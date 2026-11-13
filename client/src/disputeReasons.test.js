import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DISPUTE_REASONS, cleanDisputeDetails, disputeReasonLabel } from './disputeReasons.shared.js';

test('each side picks from its own reasons', () => {
  assert.deepEqual(DISPUTE_REASONS.client.map(r => r.label), ['Work not done', 'Work not finished or poor quality', 'Worker did not show up', 'Other']);
  assert.deepEqual(DISPUTE_REASONS.worker.map(r => r.label), ['Client will not confirm finished work', 'Client changed the job', 'Client unreachable', 'Other']);
  assert.equal(disputeReasonLabel('worker', 'not_done'), null);
  assert.equal(disputeReasonLabel('client', 'not_done'), 'Work not done');
});

test('the character count is of the cleaned text, as the server counts it', () => {
  assert.equal(cleanDisputeDetails('  <b>Tap</b>   still\tleaks \n\n\n\n again  '), 'Tap still leaks\n\nagain');
  assert.equal(cleanDisputeDetails(undefined), '');
});
