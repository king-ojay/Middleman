import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountLabel, autoReleaseNote, counterpartLabel, dateTimeLabel, groupTransactions, JOB_STATES, jobState, otherLabel, shortDate, stateLabel, STATUS, stepsFor, TYPE_LABELS
} from './transactions.js';

test('every type and status the server sends has words', () => {
  assert.deepEqual(Object.keys(TYPE_LABELS), ['paid_in', 'released', 'received', 'refunded']);
  assert.deepEqual(Object.keys(STATUS), ['pending', 'held', 'completed', 'refunded', 'failed']);
  assert.equal(TYPE_LABELS.received, 'Received');
});

test('amounts: minus leaving you, plus reaching you, no sign when nothing moved', () => {
  assert.equal(amountLabel({ amount: 15000, direction: 'out', status: 'held' }), '−15,000 RWF');
  assert.equal(amountLabel({ amount: 15000, direction: 'in', status: 'completed' }), '+15,000 RWF');
  assert.equal(amountLabel({ amount: 15000, direction: 'moved', status: 'completed' }), '15,000 RWF');
  assert.equal(amountLabel({ amount: 15000, direction: 'out', status: 'failed' }), '15,000 RWF');
  assert.equal(amountLabel({ amount: 15000, direction: 'out', status: 'pending' }), '15,000 RWF');
});

test('date and time in Kigali, and the other person', () => {
  assert.equal(dateTimeLabel('2026-11-13T21:30:00Z'), '13 Nov 2026, 23:30');
  assert.equal(otherLabel({ type: 'received', other: 'Clara M.' }), 'from Clara M.');
  assert.equal(otherLabel({ type: 'paid_in', other: 'Walter N.' }), 'with Walter N.');
  assert.equal(otherLabel({ type: 'refunded', other: 'Walter N.' }), 'with Walter N.');
  assert.equal(otherLabel({ type: 'released', other: null }), 'with Deleted user');
  assert.equal(otherLabel({ type: 'received', other: null }), 'from Deleted user');
});

const row = (job, type, status, at, extra = {}) => ({
  id: `${job}-${type}-${status}-${at}`, type, status, at, amount: 9000, direction: 'out', other: 'Walter N.',
  job: { _id: job, description: `Job ${job}`, category: 'plumber' }, ...extra
});

test('a job\'s state comes from its newest movement that did not fail', () => {
  assert.equal(jobState([row('a', 'paid_in', 'held', '2026-11-02')]), 'held');
  assert.equal(jobState([row('a', 'released', 'completed', '2026-11-03'), row('a', 'paid_in', 'completed', '2026-11-02')]), 'released');
  assert.equal(jobState([row('a', 'released', 'pending', '2026-11-03'), row('a', 'paid_in', 'held', '2026-11-02')]), 'releasing');
  assert.equal(jobState([row('a', 'refunded', 'refunded', '2026-11-04'), row('a', 'paid_in', 'refunded', '2026-11-02'), row('a', 'paid_in', 'failed', '2026-11-01')]), 'refunded');
  assert.equal(jobState([row('a', 'paid_in', 'pending', '2026-11-02')]), 'pending');
  assert.equal(jobState([row('a', 'paid_in', 'failed', '2026-11-02')]), 'failed');
  assert.equal(jobState([row('a', 'received', 'completed', '2026-11-03', { direction: 'in' })]), 'released');
});

test('the three steps: green when released, ink while held, grey refund steps', () => {
  assert.deepEqual(JOB_STATES.released.steps, ['Paid in', 'Held in escrow', 'Released']);
  assert.equal(JOB_STATES.released.done, 3);
  assert.equal(JOB_STATES.released.bar, 'green');
  assert.equal(JOB_STATES.held.done, 2);
  assert.equal(JOB_STATES.held.bar, 'ink');
  assert.deepEqual(JOB_STATES.refunded.steps, ['Paid in', 'Problem reported', 'Refunded to you']);
  assert.equal(JOB_STATES.refunded.bar, 'grey');
  assert.equal(stateLabel('released', 'client'), 'Released');
  assert.equal(stateLabel('released', 'worker'), 'Received');
  assert.equal(stateLabel('held', 'client'), 'In escrow');
  // released by the system after the confirmation window, for both parties
  assert.equal(stateLabel('released', 'client', true), 'Released automatically');
  assert.equal(stateLabel('released', 'worker', true), 'Released automatically');
  assert.equal(stateLabel('held', 'client', true), 'In escrow');
});

test('a dispute that ended with the money released stays visible: Paid in, Problem reported, Released, in green', () => {
  const card = state => ({ state, job: { _id: 'a', disputed: true } });
  assert.deepEqual(stepsFor(card('released')), { ...JOB_STATES.released, steps: ['Paid in', 'Problem reported', 'Released'] });
  assert.equal(stepsFor(card('released')).bar, 'green');
  assert.equal(stepsFor(card('released')).done, 3);
  // without a dispute, and for a refund, the steps are as before
  assert.deepEqual(stepsFor({ state: 'released', job: { _id: 'b', disputed: false } }).steps, ['Paid in', 'Held in escrow', 'Released']);
  assert.deepEqual(stepsFor(card('refunded')).steps, ['Paid in', 'Problem reported', 'Refunded to you']);
  assert.equal(stepsFor(card('held')).steps[1], 'Held in escrow');
});

test('rows group into one card per job under month headings; failed attempts stay on the card', () => {
  const rows = [
    row('b', 'released', 'completed', '2026-11-05T10:00:00Z'),
    row('b', 'paid_in', 'completed', '2026-11-04T10:00:00Z'),
    row('a', 'refunded', 'refunded', '2026-10-20T10:00:00Z'),
    row('a', 'paid_in', 'refunded', '2026-10-18T10:00:00Z'),
    row('a', 'paid_in', 'failed', '2026-10-17T10:00:00Z'),
    row('c', 'paid_in', 'failed', '2026-10-15T10:00:00Z', { other: null })
  ];
  const months = groupTransactions(rows);
  assert.deepEqual(months.map(m => [m.month, m.jobs.map(j => `${j.job._id}:${j.state}:${j.failed.length}`)]), [
    ['November 2026', ['b:released:0']],
    ['October 2026', ['a:refunded:1', 'c:failed:0']]
  ]);
  const [refunded, failedOnly] = months[1].jobs;
  assert.equal(refunded.main.type, 'refunded');
  assert.equal(failedOnly.main.status, 'failed');
  assert.equal(counterpartLabel(failedOnly.other, 'client'), 'To Deleted user');
  assert.equal(counterpartLabel('Clara M.', 'worker'), 'From Clara M.');
  assert.equal(shortDate('2026-11-13T23:30:00Z'), '14 Nov');
});

test('the automatic-release note gives the deadline in Kigali time, worded for each party', () => {
  const at = '2026-11-18T12:05:00.000Z'; // 14:05 in Kigali
  assert.equal(autoReleaseNote(at, 'client'), 'Payment releases automatically on 18 Nov 2026, 14:05 unless you confirm or report a problem.');
  assert.equal(autoReleaseNote(at, 'worker'), 'Payment releases automatically on 18 Nov 2026, 14:05 unless the client confirms or reports a problem.');
});
