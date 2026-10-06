// computeTrustScores against the proposal's worked example (Table 6) and the
// propagation rules in Section 3.2.3. Edges are written through the real
// writeTrustEdgeFrom* functions into an in-memory store, so the weights,
// referral boost and decay rates are exactly what the app records.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import TrustEdge from '../modules/trust/trustEdge.model.js';
import {
  computeTrustScores, writeTrustEdgeFromRating, writeTrustEdgeFromReferral
} from '../modules/trust/trustPropagation.js';

let edges;
beforeEach(() => {
  edges = [];
  TrustEdge.create = async doc => { edges.push({ decayRate: 0.5, referredFlag: false, ...doc }); return doc; };
  TrustEdge.find = query => ({
    lean: async () => edges.filter(e => query.fromUser.$in.includes(String(e.fromUser)))
  });
});

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

test('Table 6: Diane, rated 4 of 5 directly, scores 0.80 (a direct edge is not decayed)', async () => {
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'diane', score: 4 });
  const scores = await computeTrustScores('you');
  close(scores.get('diane'), 0.8);
});

test('Table 6: Eric, via an invited client who rated him 5 of 5 and referred him, scores 0.91', async () => {
  await writeTrustEdgeFromReferral({ fromUser: 'you', toUser: 'amina' });
  await writeTrustEdgeFromRating({ fromUser: 'amina', toUser: 'eric', score: 5, referredFlag: true });
  const scores = await computeTrustScores('you');
  close(scores.get('amina'), 1.0);
  close(scores.get('eric'), 1.0 * (1.0 * 1.4 * 0.65)); // 0.91
});

test('Table 6: Jean, with no path within three hops, gets no path score', async () => {
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'diane', score: 4 });
  await writeTrustEdgeFromRating({ fromUser: 'someone-else', toUser: 'jean', score: 5 });
  const scores = await computeTrustScores('you');
  assert.equal(scores.has('jean'), false);
});

test('Table 6 together: all three candidates in one graph', async () => {
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'diane', score: 4 });
  await writeTrustEdgeFromReferral({ fromUser: 'you', toUser: 'amina' });
  await writeTrustEdgeFromRating({ fromUser: 'amina', toUser: 'eric', score: 5, referredFlag: true });
  const scores = await computeTrustScores('you');
  close(scores.get('diane'), 0.8);
  close(scores.get('eric'), 0.91);
  assert.equal(scores.has('jean'), false);
});

test('decay is applied once per hop: the third hop is not decayed more steeply', async () => {
  // you -> a -> b -> w, each rated 4 of 5 (0.8), default decay 0.5
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'a', score: 4 });
  await writeTrustEdgeFromRating({ fromUser: 'a', toUser: 'b', score: 4 });
  await writeTrustEdgeFromRating({ fromUser: 'b', toUser: 'w', score: 4 });
  const scores = await computeTrustScores('you');
  close(scores.get('a'), 0.8);                         // hop 1: full weight
  close(scores.get('b'), 0.8 * 0.8 * 0.5);             // hop 2: one decay
  close(scores.get('w'), 0.8 * 0.8 * 0.8 * 0.5 * 0.5); // hop 3: two decays (0.128), not three (0.064)
});

test('traversal stops at three hops', async () => {
  for (const [from, to] of [['you', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'd']]) {
    await writeTrustEdgeFromRating({ fromUser: from, toUser: to, score: 5 });
  }
  const scores = await computeTrustScores('you');
  assert.equal(scores.has('c'), true);
  assert.equal(scores.has('d'), false);
});

test('where several paths reach a worker, the strongest one wins', async () => {
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'w', score: 2 });     // direct: 0.4
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'a', score: 5 });
  await writeTrustEdgeFromRating({ fromUser: 'a', toUser: 'w', score: 5 });       // via a: 1.0 * 1.0 * 0.5 = 0.5
  const scores = await computeTrustScores('you');
  close(scores.get('w'), 0.5);
});

test('cycles do not loop and the viewer never scores themselves', async () => {
  await writeTrustEdgeFromRating({ fromUser: 'you', toUser: 'a', score: 5 });
  await writeTrustEdgeFromRating({ fromUser: 'a', toUser: 'you', score: 5 });
  await writeTrustEdgeFromRating({ fromUser: 'a', toUser: 'b', score: 5 });
  await writeTrustEdgeFromRating({ fromUser: 'b', toUser: 'a', score: 5 });
  const scores = await computeTrustScores('you');
  assert.equal(scores.has('you'), false);
  close(scores.get('b'), 0.5);
});
