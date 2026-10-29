// The Part A experiment code (scripts/experiments): data conversion, the
// leave-one-out isolation, each method on a hand-checked graph, and metrics.
// The tiny graphs here are test fixtures for the code, not evaluation data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { computeTrust } from '../modules/trust/computeTrust.js';
import { DATASETS, downloadInstructions, findDatasetFile, parseRatings, readDataset } from '../scripts/experiments/dataset.js';
import {
  buildRatingGraph, fitLine, flatAverage, fullView, globalAverage, moleTrust, NO_EVIDENCE, proposedEvidence, reciprocal, signedPrediction,
  tidalTrust, withEdgeHidden
} from '../scripts/experiments/methods.js';
import {
  DEPTHS, TUNE_GRID, evidenceMethod, fitCalibration, heldOut, makeCases, methodPredictions, predictAll, summarize, tune, tuningSplit
} from '../scripts/experiments/experiment.js';
import { precisionAtK, regressionMetrics, shuffledIndices } from '../scripts/experiments/metrics.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`);
const csv = rows => rows.map(([s, t, r], i) => `${s},${t},${r},${1289241911 + i}`).join('\n');

// s rates a 8, b 4, c 9 and t 10 (the edge to hide); a, b and c rate t 6, -2 and 2.
const FIXTURE = parseRatings(csv([
  [1, 2, 8], [1, 3, 4], [1, 4, 9], [1, 9, 10],
  [2, 9, 6], [3, 9, -2], [4, 9, 2]
]));
const [S, A, B, C, T] = ['1', '2', '3', '4', '9'];

// Every method on one view, as predictAll runs them.
const allMethods = (view, s, t) => ({
  global: globalAverage(view),
  flat: flatAverage(view, s, t),
  moletrust: moleTrust(view, s, t),
  tidaltrust: tidalTrust(view, s, t),
  reciprocal: reciprocal(view, s, t),
  ...Object.fromEntries(DEPTHS.map(depth => [`depth${depth}`, proposedEvidence(view, s, t, { depth })]))
});

// 1. Data

test('parses SOURCE,TARGET,RATING,TIME rows and rejects malformed ones', () => {
  assert.deepEqual(parseRatings('6,2,4,1289241911.72836\n6,5,-10,1289241941.5\n'), [
    { source: '6', target: '2', rating: 4, time: 1289241911.72836 },
    { source: '6', target: '5', rating: -10, time: 1289241941.5 }
  ]);
  assert.throws(() => parseRatings('SOURCE,TARGET,RATING,TIME\n'), /Line 1/);
  assert.throws(() => parseRatings('1,2,11,0'), /Line 1/);
  assert.throws(() => parseRatings('1,2,3'), /Line 1/);
});

test('reads .csv and .csv.gz alike: same text, MD5 of the uncompressed CSV, line count', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'middleman-exp-'));
  try {
    const config = { ...DATASETS.bitcoinotc, file: 'sample.csv' };
    assert.equal(findDatasetFile(dir, config), null);
    assert.match(downloadInstructions(dir, config), /snap\.stanford\.edu.*\.csv\.gz/);

    const text = `${csv([[1, 2, 3], [2, 1, -4]])}\n`;
    writeFileSync(path.join(dir, 'sample.csv.gz'), gzipSync(text));
    assert.equal(findDatasetFile(dir, config), path.join(dir, 'sample.csv.gz'));
    const gz = readDataset(path.join(dir, 'sample.csv.gz'));
    writeFileSync(path.join(dir, 'sample.csv'), text);
    const plain = readDataset(findDatasetFile(dir, config)); // the plain CSV is preferred
    assert.deepEqual(gz, plain);
    assert.equal(plain.lines, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('graph conversion follows CLAUDE.md: weight rating/10, > 0 positive, <= 0 negative |rating|/10, nothing referred', () => {
  const graph = buildRatingGraph(parseRatings(csv([[1, 2, 7], [1, 3, -3], [1, 4, -10]])));
  assert.deepEqual(graph.out['1'], [
    { to: '2', weight: 0.7, positive: 0.7, negative: 0, referred: false },
    { to: '3', weight: -0.3, positive: 0, negative: 0.3, referred: false },
    { to: '4', weight: -1, positive: 0, negative: 1, referred: false }
  ]);
  assert.deepEqual(graph.in, {});    // no area trust
  assert.deepEqual(graph.users, {}); // no areas, nobody verified
});

// 2. Leave-one-out isolation

test('a hidden edge never influences its own prediction', () => {
  const graph = buildRatingGraph(FIXTURE);
  // Warm computeTrust's cache with the edge present, as a careless loop would.
  for (const depth of DEPTHS) computeTrust(graph, S, T, { depth });

  for (const { source, target } of FIXTURE) {
    const hidden = withEdgeHidden(graph, source, target, view => allMethods(view, source, target));
    const without = fullView(buildRatingGraph(FIXTURE.filter(e => !(e.source === source && e.target === target))));
    assert.deepEqual(hidden, allMethods(without, source, target), `edge ${source} -> ${target}`);
  }

  // When the hidden edge is the only evidence about the target, every method falls back.
  const lone = buildRatingGraph(parseRatings(csv([[1, 2, 10], [1, 3, 5], [3, 4, 5]])));
  withEdgeHidden(lone, '1', '2', view => {
    const m = allMethods(view, '1', '2');
    for (const key of ['flat', 'moletrust', 'tidaltrust']) assert.equal(m[key].covered, false, key);
    for (const depth of DEPTHS) assert.deepEqual(signedPrediction(m[`depth${depth}`], 0.5), { value: NO_EVIDENCE, covered: false });
  });
});

test('withEdgeHidden restores the graph exactly, even when the prediction throws', () => {
  const graph = buildRatingGraph(FIXTURE);
  const snapshot = structuredClone(graph);
  withEdgeHidden(graph, S, T, view => assert.equal(view.out[S].some(e => e.to === T), false));
  assert.throws(() => withEdgeHidden(graph, A, T, () => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(graph, snapshot);
  assert.throws(() => withEdgeHidden(graph, T, S, () => {}), /No edge/);
});

test('predictAll gives the same predictions as rebuilding the graph without each edge', () => {
  const graph = buildRatingGraph(FIXTURE);
  const cases = makeCases(FIXTURE, FIXTURE.map((_, i) => i));
  const predictions = predictAll(graph, cases);
  cases.forEach(({ source, target }, i) => {
    const expected = allMethods(fullView(buildRatingGraph(FIXTURE.filter(e => !(e.source === source && e.target === target)))), source, target);
    for (const key of ['global', 'flat', 'moletrust', 'tidaltrust']) assert.equal(predictions.direct[key].value[i], expected[key].value);
    assert.equal(predictions.reciprocal.covered[i], expected.reciprocal.covered ? 1 : 0);
    for (const depth of DEPTHS) assert.equal(predictions.evidence[depth].positive[i], expected[`depth${depth}`].positive);
  });
});

// 3. Methods, checked by hand on the fixture with s -> t hidden

test('baselines and the proposed model on the fixture', () => {
  const graph = buildRatingGraph(FIXTURE);
  const m = withEdgeHidden(graph, S, T, view => allMethods(view, S, T));
  close(m.global.value, (0.8 + 0.4 + 0.9 + 0.6 - 0.2 + 0.2) / 6);
  close(m.flat.value, (0.6 - 0.2 + 0.2) / 3);
  // MoleTrust: a (0.8) and c (0.9) are over the 0.5 threshold, b (0.4) is not.
  close(m.moletrust.value, (0.8 * 0.6 + 0.9 * 0.2) / (0.8 + 0.9));
  // TidalTrust: raters a, b, c one hop away with path strengths 0.8, 0.4, 0.9;
  // max is 0.9, so only c's rating counts.
  close(m.tidaltrust.value, 0.2);
  // computeTrust: strongest positive path s->a->t = 0.8 x 0.6 x 0.5; negative
  // s->b->t = 0.4 x 0.2 x 0.5 (b's rating of t is -2).
  close(m.depth3.positive, 0.24);
  close(m.depth3.negative, 0.04);
  close(signedPrediction(m.depth3, 0.5).value, 0.24 - 0.5 * 0.04);
  close(signedPrediction(m.depth3, 0).value, 0.24);
  // depth 1: no positive path once the direct edge is hidden; the negative
  // evidence still arrives (negativeDepth stays 2).
  assert.equal(m.depth1.positive, 0);
  close(signedPrediction(m.depth1, 0.5).value, -0.02);
  assert.deepEqual(signedPrediction(m.depth1, 0), { value: NO_EVIDENCE, covered: false });
});

test('signed prediction is clamped to [-1, 1] and lambda 0 ignores negative evidence', () => {
  assert.deepEqual(signedPrediction({ positive: 1.4, negative: 0 }, 0.5), { value: 1, covered: true });
  assert.deepEqual(signedPrediction({ positive: 0, negative: 1 }, 1), { value: -1, covered: true });
  assert.deepEqual(signedPrediction({ positive: 0, negative: 0.6 }, 0), { value: NO_EVIDENCE, covered: false });
});

test('MoleTrust stops at the horizon', () => {
  const chain = fullView(buildRatingGraph(parseRatings(csv([[1, 2, 10], [2, 3, 10], [3, 4, 10], [4, 5, 7]]))));
  assert.equal(moleTrust(chain, '1', '5').covered, false);
  close(moleTrust(chain, '1', '5', { horizon: 4 }).value, 0.7);
});

test('methodPredictions labels (e) as lambda 0.5 at depth 3 and (f) as lambda 0', () => {
  const graph = buildRatingGraph(FIXTURE);
  const cases = makeCases(FIXTURE, [3]); // s -> t
  const methods = methodPredictions(predictAll(graph, cases));
  close(methods.proposed.value[0], 0.22);
  close(methods.positiveOnly.value[0], 0.24);
});

// 4. Metrics

test('RMSE, MAE, Pearson and sign accuracy', () => {
  const r = regressionMetrics([1, -1, 0.5, -0.5], [0.5, -0.5, 0.5, 0.1]);
  close(r.rmse, Math.sqrt((0.25 + 0.25 + 0 + 0.36) / 4));
  close(r.mae, (0.5 + 0.5 + 0 + 0.6) / 4);
  close(r.signAccuracy, 0.75);
  close(r.negativeSignAccuracy, 0.5);
  close(regressionMetrics([1, 2, 3], [2, 4, 6]).pcc, 1);
  assert.equal(regressionMetrics([1, 2, 3], [1, 1, 1]).pcc, null);
});

test('precision@k ranks each source\'s targets by prediction', () => {
  const cases = ['a', 'b', 'c', 'd'].map((target, i) => ({ source: 's', target, truth: i < 2 ? 1 : -1 }));
  assert.equal(precisionAtK(cases, [0.9, 0.1, 0.5, -0.2], 2).precision, 0.5);
  assert.equal(precisionAtK(cases, [0.9, 0.8, 0.5, -0.2], 2).precision, 1);
  assert.equal(precisionAtK(cases, [0.9, 0.8, 0.5, -0.2], 5).sources, 0);
});

test('the seeded shuffle is deterministic and a permutation', () => {
  assert.deepEqual(shuffledIndices(50, 7), shuffledIndices(50, 7));
  assert.notDeepEqual(shuffledIndices(50, 7), shuffledIndices(50, 8));
  assert.deepEqual([...shuffledIndices(50, 7)].sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i));
});

// 5. M3b variants: community fallback, reciprocal, held-out tuning, calibration

// Mutual pairs (1<->2, 2<->3) plus one-way ratings; 5 is rated only by 4.
const MUTUAL = parseRatings(csv([
  [1, 2, 9], [2, 1, 8], [2, 3, 5], [3, 2, -3], [1, 3, 6],
  [3, 4, 7], [4, 5, 10], [4, 3, 2], [5, 1, -6], [2, 4, 4]
]));
const mutualPredictions = () => {
  const cases = makeCases(MUTUAL, MUTUAL.map((_, i) => i));
  return { cases, predictions: predictAll(buildRatingGraph(MUTUAL), cases) };
};

test('community fallback: no evidence -> the target\'s other ratings (else the global average); evidence -> unchanged', () => {
  const { cases, predictions } = mutualPredictions();
  const plain = evidenceMethod(predictions, 0.5, 3);
  const community = evidenceMethod(predictions, 0.5, 3, { community: true });
  let fellBack = 0;
  cases.forEach((c, i) => {
    assert.equal(community.covered[i], plain.covered[i]);
    if (plain.covered[i]) assert.equal(community.value[i], plain.value[i]);
    else { assert.equal(community.value[i], predictions.direct.flat.value[i]); fellBack += 1; }
  });
  assert.ok(fellBack > 0, 'the fixture has cases with no evidence');
  // 4 -> 5: 5 has no other ratings, so the community value is the global average of the other 9.
  const i = cases.findIndex(c => c.source === '4' && c.target === '5');
  assert.equal(community.value[i], (9 + 8 + 5 - 3 + 6 + 7 + 2 - 6 + 4) / 10 / 9);
});

test('reciprocal uses the target\'s rating of the source, never the hidden edge itself', () => {
  const graph = buildRatingGraph(MUTUAL);
  withEdgeHidden(graph, '1', '2', view => assert.deepEqual(reciprocal(view, '1', '2'), { value: 0.8, covered: true }));
  withEdgeHidden(graph, '2', '1', view => assert.deepEqual(reciprocal(view, '2', '1'), { value: 0.9, covered: true }));
  withEdgeHidden(graph, '1', '3', view => assert.equal(reciprocal(view, '1', '3').covered, false));

  const { cases, predictions } = mutualPredictions();
  const methods = methodPredictions(predictions);
  cases.forEach((c, i) => {
    const back = MUTUAL.find(e => e.source === c.target && e.target === c.source);
    assert.equal(methods.reciprocal.value[i], back ? back.rating / 10 : methods.community.value[i]);
  });
});

test('the tuning split is seeded, disjoint and 20/80', () => {
  const { tuneIdx, reportIdx } = tuningSplit(100, 2);
  assert.equal(tuneIdx.length, 20);
  assert.equal(reportIdx.length, 80);
  assert.equal(new Set([...tuneIdx, ...reportIdx]).size, 100);
  assert.deepEqual(tuningSplit(100, 2), { tuneIdx, reportIdx });
});

test('no held-out (80%) edge leaks into tuning or calibration', () => {
  const { cases, predictions } = mutualPredictions();
  const { tuneIdx, reportIdx } = tuningSplit(cases.length, 2);
  const before = heldOut(cases, predictions, 2);

  // Change everything about the 80%: truths flipped, evidence scrambled.
  const changedCases = cases.map((c, i) => (reportIdx.includes(i) ? { ...c, truth: -c.truth } : c));
  const changed = structuredClone(predictions);
  for (const i of reportIdx) {
    for (const depth of DEPTHS) { changed.evidence[depth].positive[i] = 0.9; changed.evidence[depth].negative[i] = 0.7; }
    changed.direct.flat.value[i] = -0.5;
  }
  const after = heldOut(changedCases, changed, 2);
  assert.deepEqual(after.tuneIdx, tuneIdx);
  assert.deepEqual([after.tunedFloor, after.tunedCommunity, after.calibration], [before.tunedFloor, before.tunedCommunity, before.calibration]);

});

test('the 80% report reads only the 80%, and tuning reads only the 20%', () => {
  const { cases, predictions } = mutualPredictions();
  const { tuneIdx, reportIdx } = tuningSplit(cases.length, 2);
  const method = evidenceMethod(predictions, 0.5, 3, { community: true });
  const report = summarize(cases, method, reportIdx);

  const scrambled = { value: Float64Array.from(method.value), covered: Uint8Array.from(method.covered) };
  for (const i of tuneIdx) { scrambled.value[i] = -1; scrambled.covered[i] = 0; }
  const changedCases = cases.map((c, i) => (tuneIdx.includes(i) ? { ...c, truth: 1 } : c));
  assert.deepEqual(summarize(changedCases, scrambled, reportIdx), report);

  // Calibration sees the tuning share's covered edges only.
  const fitted = fitCalibration(cases, method, tuneIdx);
  const covered = tuneIdx.filter(i => method.covered[i]);
  assert.deepEqual(fitted, fitLine(covered.map(i => method.value[i]), covered.map(i => cases[i].truth)));
});

test('tune picks the best RMSE on the tuning share from the grid', () => {
  const { cases, predictions } = mutualPredictions();
  const idx = cases.map((_, i) => i);
  const best = tune(cases, predictions, idx, { community: true });
  for (const depth of TUNE_GRID.depths) {
    for (const lambda of TUNE_GRID.lambdas) {
      const { rmse } = summarize(cases, evidenceMethod(predictions, lambda, depth, { community: true }), idx);
      assert.ok(best.rmse <= rmse + 1e-15);
    }
  }
  assert.ok(TUNE_GRID.lambdas.includes(best.lambda) && TUNE_GRID.depths.includes(best.depth));
});

test('fitLine is least squares, and the identity when it cannot fit', () => {
  const { a, b } = fitLine([0, 1, 2], [1, 3, 5]);
  close(a, 1);
  close(b, 2);
  assert.deepEqual(fitLine([0.5], [1]), { a: 0, b: 1, n: 1 });
  assert.deepEqual(fitLine([0.2, 0.2], [0, 1]), { a: 0, b: 1, n: 2 });
});
