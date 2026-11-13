import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountLabel, dateTimeLabel, otherLabel, STATUS, TYPE_LABELS } from './transactions.js';

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
  assert.equal(otherLabel({ type: 'released', other: null }), 'with a removed account');
});
