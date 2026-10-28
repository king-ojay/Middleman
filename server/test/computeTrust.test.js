// computeTrust on plain in-memory graphs: the existing positive rules,
// negative evidence from 1-2 star ratings, and the options that tune both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, buildGraph, computeTrust, edgeEvidence, pathScores } from '../modules/trust/computeTrust.js';
import TrustEdge from '../modules/trust/trustEdge.model.js';
import { rankByTrust } from '../modules/trust/trustPropagation.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);

// Edges shaped exactly as writeTrustEdgeFrom* stores them.
const rating = (from, to, stars, referred = false) =>
  ({ fromUser: from, toUser: to, type: 'rating', weight: stars / 5, referredFlag: referred });
const referral = (from, to) => ({ fromUser: from, toUser: to, type: 'signup_referral', weight: 1.0 });

// you -referral-> amina -5 stars, referred-> w gives w a positive path of 0.91.
const strongPath = [referral('you', 'amina'), rating('amina', 'w', 5, true)];

// (a) existing behaviour

test('defaults are the current constants', () => {
  assert.deepEqual(
    { depth: DEFAULTS.depth, decay: DEFAULTS.decay, referralBoost: DEFAULTS.referralBoost, referralDecay: DEFAULTS.referralDecay },
    { depth: 3, decay: 0.5, referralBoost: 1.4, referralDecay: 0.65 }
  );
});

test('3-5 stars are positive evidence of stars/5 and nothing negative', () => {
  for (const stars of [3, 4, 5]) assert.deepEqual(edgeEvidence(rating('a', 'b', stars)), { positive: stars / 5, negative: 0 });
  assert.deepEqual(edgeEvidence(referral('a', 'b')), { positive: 1, negative: 0 });
});

test('Table 6: direct 4 stars is 0.80 undecayed; referred path to Eric is 0.91; Jean has no path', () => {
  const g = buildGraph([rating('you', 'diane', 4), referral('you', 'amina'), rating('amina', 'eric', 5, true), rating('x', 'jean', 5)]);
  assert.deepEqual(computeTrust(g, 'you', 'diane'), { score: 0.8, positive: 0.8, negative: 0, source: 'path', pathLength: 1 });
  const eric = computeTrust(g, 'you', 'eric');
  close(eric.score, 0.91);
  assert.equal(eric.pathLength, 2);
  assert.notEqual(computeTrust(g, 'you', 'jean').source, 'path');
});

test('decay once per hop, and nothing past three hops', () => {
  const g = buildGraph([rating('you', 'a', 4), rating('a', 'b', 4), rating('b', 'c', 4), rating('c', 'd', 5)]);
  close(computeTrust(g, 'you', 'b').score, 0.8 * 0.8 * 0.5);
  close(computeTrust(g, 'you', 'c').score, 0.8 * 0.8 * 0.8 * 0.5 * 0.5);
  assert.equal(computeTrust(g, 'you', 'd').source, 'floor');
});

test('strongest positive path wins, even when it is longer', () => {
  const g = buildGraph([rating('you', 'w', 3), ...strongPath]);
  const w = computeTrust(g, 'you', 'w');
  close(w.score, 0.91);
  assert.equal(w.pathLength, 2);
});

test('no path: area trust from same-area raters at half weight, else the verification floor', () => {
  const users = [
    { _id: 'w', area: 'kimironko', verifiedStatus: 'unverified' },
    { _id: 'n1', area: 'kimironko' }, { _id: 'n2', area: 'kimironko' }, { _id: 'far', area: 'remera' },
    { _id: 'v', area: 'remera', verifiedStatus: 'verified' },
    { _id: 'u', area: 'remera', verifiedStatus: 'unverified' }
  ];
  const g = buildGraph([rating('n1', 'w', 5), rating('n2', 'w', 4), rating('far', 'w', 1)], users);
  assert.deepEqual(computeTrust(g, 'you', 'w'), { score: (1.0 + 0.8) / 2 * 0.5, positive: 0, negative: 0, source: 'area', pathLength: null });
  assert.deepEqual(computeTrust(g, 'you', 'v'), { score: 0.3, positive: 0, negative: 0, source: 'floor', pathLength: null });
  assert.equal(computeTrust(g, 'you', 'u').score, 0.1);
});

test('a rater\'s area counts even when their edge was first loaded unpopulated', () => {
  const edge = { _id: 'e1', ...rating('n1', 'w', 5) };
  const g = buildGraph([edge, { ...edge, fromUser: { _id: 'n1', area: 'kimironko' } }], [{ _id: 'w', area: 'kimironko' }]);
  assert.equal(computeTrust(g, 'you', 'w').source, 'area');
  assert.equal(g.in.w.length, 1);
});

// (b) negative evidence on a direct edge

test('1-2 stars are negative evidence of (3 - stars)/2 and no positive weight', () => {
  assert.deepEqual(edgeEvidence(rating('a', 'b', 1)), { positive: 0, negative: 1.0 });
  assert.deepEqual(edgeEvidence(rating('a', 'b', 2)), { positive: 0, negative: 0.5 });
});

test('a direct 1-star rating lowers a path score by lambda x 1.0', () => {
  const without = computeTrust(buildGraph(strongPath), 'you', 'w');
  const withOne = computeTrust(buildGraph([...strongPath, rating('you', 'w', 1)]), 'you', 'w');
  close(withOne.negative, 1.0);
  close(withOne.positive, without.positive);
  close(without.score - withOne.score, DEFAULTS.lambda * 1.0);
});

test('a 2-star rating is not a positive path on its own', () => {
  const r = computeTrust(buildGraph([rating('you', 'w', 2)]), 'you', 'w');
  assert.equal(r.source, 'floor');
  assert.equal(r.positive, 0);
  close(r.negative, 0.5);
});

test('negative evidence is not passed on through the person rated badly', () => {
  const g = buildGraph([rating('you', 'a', 1), rating('a', 'w', 5)]);
  assert.equal(computeTrust(g, 'you', 'w').source, 'floor');
  assert.equal(computeTrust(g, 'you', 'w').negative, 0);
});

// (c) negative depth

test('negative evidence decays like positive and stops after two hops', () => {
  // second hop: you -5-> a -1-> w, so negative = 1.0 x 1.0 x 0.5
  const twoHops = computeTrust(buildGraph([...strongPath, rating('you', 'a', 5), rating('a', 'w', 1)]), 'you', 'w');
  close(twoHops.negative, 0.5);
  close(twoHops.score, 0.91 - 0.5 * 0.5);
  // third hop: you -5-> a -5-> b -1-> w has no effect
  const threeHops = computeTrust(buildGraph([...strongPath, rating('you', 'a', 5), rating('a', 'b', 5), rating('b', 'w', 1)]), 'you', 'w');
  assert.equal(threeHops.negative, 0);
  close(threeHops.score, 0.91);
});

test('strongest negative path wins rather than adding up', () => {
  const g = buildGraph([...strongPath, rating('you', 'w', 2), rating('you', 'a', 5), rating('a', 'w', 1)]);
  close(computeTrust(g, 'you', 'w').negative, 0.5); // 0.5 direct, 0.5 via a: max, not 1.0
});

// (d) lambda

test('lambda 0.25, 0.5 and 1.0 scale the penalty; a path pushed to 0 leaves the network tier', () => {
  // no users given, so no area trust: a cancelled path falls to the plain unverified floor
  const g = buildGraph([...strongPath, rating('you', 'w', 1)]);
  close(computeTrust(g, 'you', 'w', { lambda: 0.25 }).score, 0.91 - 0.25);
  close(computeTrust(g, 'you', 'w', { lambda: 0.5 }).score, 0.91 - 0.5);
  const cancelled = computeTrust(g, 'you', 'w', { lambda: 1.0 });
  close(cancelled.positive, 0.91);
  assert.deepEqual({ ...cancelled, positive: 0.91 }, { score: 0.1, positive: 0.91, negative: 1, source: 'floor', pathLength: 2 });
});

test('other options override the defaults', () => {
  const chain = buildGraph([rating('you', 'a', 5), rating('a', 'b', 5), rating('b', 'c', 5), rating('c', 'd', 5), rating('b', 'w', 1), ...strongPath]);
  assert.equal(computeTrust(chain, 'you', 'd', { depth: 4 }).source, 'path');
  close(computeTrust(chain, 'you', 'b', { decay: 0.25 }).score, 0.25);
  close(computeTrust(chain, 'you', 'w', { negativeDepth: 3 }).negative, 0.25);
  close(computeTrust(chain, 'you', 'w', { referralBoost: 1, referralDecay: 0.5 }).positive, 0.5);
});

// (e) never excluded

test('a worker with a single 1-star rating stays in the results, just under the floor', async () => {
  const workers = [
    { _id: 'w', area: 'kimironko', verifiedStatus: 'verified' },
    { _id: 'liked', area: 'kimironko', verifiedStatus: 'unverified' }
  ];
  const edges = [rating('you', 'w', 1), rating('you', 'liked', 4)];
  TrustEdge.find = query => {
    if (query.fromUser) return { lean: async () => edges.filter(e => query.fromUser.$in.includes(e.fromUser)) };
    const received = edges.filter(e => query.toUser.$in.includes(e.toUser) && e.type === query.type);
    return { populate: () => ({ lean: async () => received.map(e => ({ ...e, fromUser: { _id: e.fromUser, area: 'remera' } })) }) };
  };

  const ranked = await rankByTrust('you', workers);
  assert.deepEqual(ranked.map(r => [r._id, r.trustSource, r.trustScore]), [['liked', 'network', 0.8], ['w', 'fallback', 0.3 - 0.01]]);
  assert.deepEqual(computeTrust(buildGraph(edges, workers), 'you', 'w'), { score: 0.3 - 0.01, positive: 0, negative: 1, source: 'floor', pathLength: null });
});

// (f) no self-score, (g) cycles

test('nobody scores themselves, through positive or negative edges', () => {
  const g = buildGraph([rating('you', 'a', 5), rating('a', 'you', 5), rating('a', 'you', 1), rating('you', 'you', 1)]);
  const self = computeTrust(g, 'you', 'you');
  assert.notEqual(self.source, 'path');
  assert.equal(self.positive, 0);
  assert.equal(self.negative, 0);
  assert.equal(pathScores(g, 'you').has('you'), false);
});

test('cycles end and do not inflate scores, with or without negative edges', () => {
  const g = buildGraph([
    rating('you', 'a', 5), rating('a', 'b', 5), rating('b', 'a', 5), rating('b', 'you', 5),
    rating('a', 'b', 1), rating('b', 'a', 1)
  ]);
  const b = computeTrust(g, 'you', 'b', { depth: 50, negativeDepth: 50 });
  close(b.positive, 0.5);
  close(b.negative, 0.5);
  close(computeTrust(g, 'you', 'a', { depth: 50 }).positive, 1.0);
});

// Follow-ups: net-zero paths, negative-only workers, no boost on negative
// evidence, area trust from positive ratings only, negative depth.

const kimironko = (id, verified = false) => ({ _id: id, area: 'kimironko', verifiedStatus: verified ? 'verified' : 'unverified' });

test('1. a path cancelled out to 0 falls to the area tier, scored by area trust', () => {
  const users = [kimironko('w'), kimironko('n1')];
  // positive 0.5 via a, direct 1-star negative 1.0: 0.5 - 0.5 x 1.0 = 0
  const edges = [rating('you', 'a', 5), rating('a', 'w', 5), rating('you', 'w', 1), rating('n1', 'w', 4)];
  const g = buildGraph(edges, users);
  assert.deepEqual(computeTrust(g, 'you', 'w'), { score: 0.8 * 0.5, positive: 0.5, negative: 1, source: 'area', pathLength: 2 });
  assert.equal(pathScores(g, 'you').has('w'), false);
});

test('1. a path cancelled out to 0 with no area trust falls to the plain floor, no epsilon', () => {
  const edges = [rating('you', 'a', 5), rating('a', 'w', 5), rating('you', 'w', 1)];
  const verified = buildGraph(edges, [kimironko('w', true)]);
  assert.deepEqual(computeTrust(verified, 'you', 'w'), { score: 0.3, positive: 0.5, negative: 1, source: 'floor', pathLength: 2 });
  const unverified = buildGraph(edges, [kimironko('w')]);
  assert.equal(computeTrust(unverified, 'you', 'w').score, 0.1);
  // epsilon is for negative-only workers, so changing it changes nothing here
  assert.equal(computeTrust(unverified, 'you', 'w', { negativeEpsilon: 0.05 }).score, 0.1);
  assert.equal(pathScores(verified, 'you').has('w'), false);
});

test('1. in results, a cancelled path ties with an unrated worker and stays above a negative-only one', async () => {
  const workers = [kimironko('negOnly', true), kimironko('cancelled', true), kimironko('unrated', true), kimironko('stranger')];
  const edges = [rating('you', 'a', 5), rating('a', 'cancelled', 5), rating('you', 'cancelled', 1), rating('you', 'negOnly', 1)];
  TrustEdge.find = query => {
    if (query.fromUser) return { lean: async () => edges.filter(e => query.fromUser.$in.includes(e.fromUser)) };
    return { populate: () => ({ lean: async () => [] }) };
  };
  const ranked = await rankByTrust('you', workers);
  assert.deepEqual(ranked.map(r => [r._id, r.trustSource, r.trustScore]), [
    ['cancelled', 'fallback', 0.3], ['unrated', 'fallback', 0.3], ['negOnly', 'fallback', 0.3 - 0.01], ['stranger', 'fallback', 0.1]
  ]);
});

test('ties are broken by worker id, whatever order the workers arrive in; a cancelled path stays tied', async () => {
  // b-cancelled (path cancelled to 0) and a-unrated tie at the verified floor, 0.3
  const edges = [rating('you', 'x', 5), rating('x', 'b-cancelled', 5), rating('you', 'b-cancelled', 1)];
  TrustEdge.find = query => {
    if (query.fromUser) return { lean: async () => edges.filter(e => query.fromUser.$in.includes(e.fromUser)) };
    return { populate: () => ({ lean: async () => [] }) };
  };
  const workers = [kimironko('z-new'), kimironko('b-cancelled', true), kimironko('m-new'), kimironko('a-unrated', true)];
  const expected = [['a-unrated', 0.3], ['b-cancelled', 0.3], ['m-new', 0.1], ['z-new', 0.1]];
  for (const order of [workers, [...workers].reverse()]) {
    const ranked = await rankByTrust('you', order);
    assert.deepEqual(ranked.map(r => [r._id, r.trustScore]), expected);
  }
});

test('1. a path that stays above 0 is still in the network tier', () => {
  const g = buildGraph([...strongPath, rating('you', 'w', 2)]);
  const w = computeTrust(g, 'you', 'w');
  assert.equal(w.source, 'path');
  close(w.score, 0.91 - 0.5 * 0.5);
});

test('2. only negative evidence ranks just under an unrated worker with the same verification', () => {
  const users = [kimironko('bad', true), kimironko('unrated', true), kimironko('badU'), kimironko('unratedU')];
  const g = buildGraph([rating('you', 'bad', 2), rating('you', 'badU', 1)], users);
  assert.ok(computeTrust(g, 'you', 'bad').score < computeTrust(g, 'you', 'unrated').score);
  assert.ok(computeTrust(g, 'you', 'badU').score < computeTrust(g, 'you', 'unratedU').score);
  close(computeTrust(g, 'you', 'bad').score, 0.29);
  close(computeTrust(g, 'you', 'badU').score, 0.09);
  close(computeTrust(g, 'you', 'badU', { negativeEpsilon: 0 }).score, 0.1);
});

test('2. only negative evidence ignores area trust the worker would otherwise get', () => {
  const g = buildGraph([rating('you', 'w', 1), rating('n1', 'w', 5)], [kimironko('w'), kimironko('n1')]);
  const w = computeTrust(g, 'you', 'w');
  assert.equal(w.source, 'floor');
  close(w.score, 0.1 - 0.01);
});

test('3. referred negative evidence gets no boost and the default decay', () => {
  // direct referred 1-star: 1.0, not 1.4
  close(computeTrust(buildGraph([rating('you', 'w', 1, true)]), 'you', 'w').negative, 1.0);
  // one hop out, referred: 1.0 x 1.0 x default decay 0.5, not x 1.4 or x 0.65
  close(computeTrust(buildGraph([rating('you', 'a', 5), rating('a', 'w', 1, true)]), 'you', 'w').negative, 0.5);
  // the referral decay option does not touch negative evidence
  close(computeTrust(buildGraph([rating('you', 'a', 5), rating('a', 'w', 1, true)]), 'you', 'w', { referralDecay: 0.9 }).negative, 0.5);
  // the boost still applies to positive evidence
  close(computeTrust(buildGraph(strongPath), 'you', 'w').positive, 0.91);
});

test('3. the first hop of a negative path gets no referral boost either', () => {
  // you -5 stars, referred-> a -1 star-> w: lead-in 1.0 unboosted, so 1.0 x 1.0 x 0.5 (was 1.4 x 1.0 x 0.5 = 0.7)
  const g = buildGraph([rating('you', 'a', 5, true), rating('a', 'w', 1)]);
  close(computeTrust(g, 'you', 'w').negative, 0.5);
  // the same referred edge still carries the boost as positive evidence
  close(computeTrust(g, 'you', 'a').positive, 1.4);
  // two edges to a: referred 3 stars (0.84 boosted, 0.6 unboosted) and plain 4 stars (0.8).
  // The negative lead-in is the strongest unboosted one, 0.8, not the boosted 0.84.
  const parallel = buildGraph([rating('you', 'a', 3, true), rating('you', 'a', 4), rating('a', 'w', 2)]);
  close(computeTrust(parallel, 'you', 'a').positive, 0.84);
  close(computeTrust(parallel, 'you', 'w').negative, 0.8 * 0.5 * 0.5);
});

test('3. negative-only stays at floor minus epsilon and never takes area trust, verified or not', () => {
  const users = [kimironko('v', true), kimironko('u'), kimironko('n1')];
  const g = buildGraph([rating('you', 'v', 2), rating('you', 'u', 1), rating('n1', 'v', 5), rating('n1', 'u', 5)], users);
  assert.deepEqual(computeTrust(g, 'you', 'v'), { score: 0.3 - 0.01, positive: 0, negative: 0.5, source: 'floor', pathLength: null });
  assert.deepEqual(computeTrust(g, 'you', 'u'), { score: 0.1 - 0.01, positive: 0, negative: 1, source: 'floor', pathLength: null });
});

test('4. area trust averages 3-5 star ratings only', () => {
  const users = [kimironko('w'), kimironko('v'), kimironko('n1'), kimironko('n2')];
  const g = buildGraph([rating('n1', 'w', 5), rating('n2', 'w', 1), rating('n1', 'v', 2), rating('n2', 'v', 1)], users);
  assert.deepEqual(computeTrust(g, 'you', 'w'), { score: 1.0 * 0.5, positive: 0, negative: 0, source: 'area', pathLength: null });
  // only low in-area ratings, none from the viewer's network: no area trust, plain floor
  assert.deepEqual(computeTrust(g, 'you', 'v'), { score: 0.1, positive: 0, negative: 0, source: 'floor', pathLength: null });
});

test('5. one hop out: a rating from someone the viewer rated, decayed once', () => {
  // you rated a 4 stars (0.8); a rated w 2 stars (0.5 negative): 0.8 x 0.5 x 0.5
  const g = buildGraph([rating('you', 'a', 4), rating('a', 'w', 2)]);
  close(computeTrust(g, 'you', 'w').negative, 0.2);
  // someone the viewer referred counts the same way: 1.0 x 1.0 x 0.5
  close(computeTrust(buildGraph([referral('you', 'b'), rating('b', 'w', 1)]), 'you', 'w').negative, 0.5);
});

test('5. raters two or more hops out, or reached only through a bad rating, do not count', () => {
  const g = buildGraph([
    rating('you', 'a', 5), rating('a', 'b', 5), rating('b', 'w', 1), // b is two hops out
    rating('you', 'c', 1), rating('c', 'w', 1)                        // c was rated badly by the viewer
  ]);
  assert.equal(computeTrust(g, 'you', 'w').negative, 0);
});

test('5. the one-hop rater is weighted by the viewer\'s direct trust in them, not a longer path', () => {
  // direct a = 0.6; via referral r -> a (referred 5 stars) = 0.91, but that is two hops
  const g = buildGraph([rating('you', 'a', 3), referral('you', 'r'), rating('r', 'a', 5, true), rating('a', 'w', 1)]);
  close(computeTrust(g, 'you', 'a').positive, 0.91);
  close(computeTrust(g, 'you', 'w').negative, 0.6 * 1.0 * 0.5);
});
