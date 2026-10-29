// The leave-one-out loop (Kumar et al. 2016): for each test edge, hide it,
// predict it with every method, put it back. Then the summaries.
import { performance } from 'node:perf_hooks';
import {
  clamp, fitLine, flatAverage, globalAverage, moleTrust, proposedEvidence, reciprocal, signedPrediction, tidalTrust, withEdgeHidden
} from './methods.js';
import { precisionAtK, quantile, regressionMetrics, shuffledIndices } from './metrics.js';

export const LAMBDAS = [0.25, 0.5, 1.0];
export const DEPTHS = [1, 2, 3, 4];
export const MAIN = { lambda: 0.5, depth: 3 };
export const MOLETRUST = { horizon: 3, threshold: 0.5 };
export const COLD_START = { min: 1, max: 3 }; // targets with 1-3 ratings in the whole dataset
// --tune-split: settings tried on the tuning share only.
export const TUNE_GRID = { lambdas: [0.25, 0.5, 1.0, 1.5, 2.0], depths: [2, 3, 4] };
export const TUNE_SHARE = 0.2;

// Methods with their own prediction function; (e) and (f) come from the
// computeTrust evidence (see evidenceMethod).
const DIRECT = {
  global: { label: '(a) Global average', predict: view => globalAverage(view) },
  flat: { label: '(b) Flat average of target', predict: (view, s, t) => flatAverage(view, s, t) },
  moletrust: { label: '(c) MoleTrust (h=3, t=0.5)', predict: (view, s, t) => moleTrust(view, s, t, MOLETRUST) },
  tidaltrust: { label: '(d) TidalTrust', predict: (view, s, t) => tidalTrust(view, s, t) }
};

export const METHOD_LABELS = {
  ...Object.fromEntries(Object.entries(DIRECT).map(([k, m]) => [k, m.label])),
  proposed: '(e) Proposed, lambda 0.5',
  positiveOnly: '(f) Proposed, lambda 0 (positive-only)',
  community: '(g) Proposed + community fallback, lambda 0.5',
  reciprocal: '(h) Proposed + reciprocal (off by default)'
};

/** Test cases: { source, target, truth, coldStart } for the chosen edges. */
export function makeCases(edges, indices) {
  const received = new Map();
  for (const e of edges) received.set(e.target, (received.get(e.target) || 0) + 1);
  return indices.map(i => {
    const { source, target, rating } = edges[i];
    const n = received.get(target);
    return { source, target, truth: rating / 10, coldStart: n >= COLD_START.min && n <= COLD_START.max };
  });
}

/**
 * Hides each case's edge, predicts it with every method, restores it.
 * Returns per case: each direct method's value, coverage and latency (ms),
 * and computeTrust's positive/negative evidence at every depth.
 */
export function predictAll(graph, cases, { onProgress } = {}) {
  const n = cases.length;
  const out = { direct: {}, evidence: {}, latency: {}, reciprocal: { value: new Float64Array(n), covered: new Uint8Array(n) } };
  for (const key of Object.keys(DIRECT)) {
    out.direct[key] = { value: new Float64Array(n), covered: new Uint8Array(n) };
    out.latency[key] = new Float64Array(n);
  }
  for (const depth of DEPTHS) {
    out.evidence[depth] = { positive: new Float64Array(n), negative: new Float64Array(n) };
    out.latency[`depth${depth}`] = new Float64Array(n);
  }

  cases.forEach(({ source, target }, i) => {
    withEdgeHidden(graph, source, target, view => {
      for (const [key, method] of Object.entries(DIRECT)) {
        const start = performance.now();
        const p = method.predict(view, source, target);
        out.latency[key][i] = performance.now() - start;
        out.direct[key].value[i] = p.value;
        out.direct[key].covered[i] = p.covered ? 1 : 0;
      }
      const r = reciprocal(view, source, target);
      out.reciprocal.value[i] = r.covered ? r.value : 0;
      out.reciprocal.covered[i] = r.covered ? 1 : 0;
      for (const depth of DEPTHS) {
        const start = performance.now();
        const ev = proposedEvidence(view, source, target, { depth });
        out.latency[`depth${depth}`][i] = performance.now() - start;
        out.evidence[depth].positive[i] = ev.positive;
        out.evidence[depth].negative[i] = ev.negative;
      }
    });
    if (onProgress) onProgress(i + 1, n);
  });
  return out;
}

/**
 * The proposed model's predictions for one lambda and depth. With no evidence
 * it predicts computeTrust's floor, or with `community` the target's average
 * of its other ratings (global average if none): the OTC analogue of
 * Middleman's area-trust tier. Either way covered stays 0 for those cases.
 */
export function evidenceMethod(predictions, lambda, depth, { community = false } = {}) {
  const { positive, negative } = predictions.evidence[depth];
  const n = positive.length;
  const value = new Float64Array(n), covered = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = signedPrediction({ positive: positive[i], negative: negative[i] }, lambda);
    value[i] = p.covered || !community ? p.value : predictions.direct.flat.value[i];
    covered[i] = p.covered ? 1 : 0;
  }
  return { value, covered };
}

/**
 * "Proposed + reciprocal": the target's rating of the source when there is
 * one, otherwise `base` (proposed + community fallback).
 */
export function reciprocalMethod(predictions, base) {
  const { value: rv, covered: rc } = predictions.reciprocal;
  const n = rv.length;
  const value = new Float64Array(n), covered = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    value[i] = rc[i] ? rv[i] : base.value[i];
    covered[i] = rc[i] || base.covered[i] ? 1 : 0;
  }
  return { value, covered };
}

/** Every compared method's predictions and latencies, keyed as METHOD_LABELS. */
export function methodPredictions(predictions) {
  return {
    ...Object.fromEntries(Object.keys(DIRECT).map(k => [k, { ...predictions.direct[k], latency: predictions.latency[k] }])),
    proposed: { ...evidenceMethod(predictions, MAIN.lambda, MAIN.depth), latency: predictions.latency[`depth${MAIN.depth}`] },
    positiveOnly: { ...evidenceMethod(predictions, 0, MAIN.depth), latency: predictions.latency[`depth${MAIN.depth}`] },
    community: { ...evidenceMethod(predictions, MAIN.lambda, MAIN.depth, { community: true }), latency: predictions.latency[`depth${MAIN.depth}`] },
    reciprocal: { ...reciprocalMethod(predictions, evidenceMethod(predictions, MAIN.lambda, MAIN.depth, { community: true })), latency: predictions.latency[`depth${MAIN.depth}`] }
  };
}

const pick = (array, indices) => indices.map(i => array[i]);

/** All metrics for one method over the cases at `indices`. */
export function summarize(cases, method, indices) {
  const truth = pick(cases, indices).map(c => c.truth);
  const pred = pick(method.value, indices);
  const coveredIdx = indices.filter(i => method.covered[i]);
  const cold = indices.filter(i => cases[i].coldStart);
  const subset = indices.map(i => cases[i]);
  const latency = method.latency ? pick(method.latency, indices) : [];
  return {
    ...regressionMetrics(truth, pred),
    coverage: indices.length ? coveredIdx.length / indices.length : null,
    coveredOnly: regressionMetrics(coveredIdx.map(i => cases[i].truth), pick(method.value, coveredIdx)),
    precisionAt5: precisionAtK(subset, pred, 5),
    precisionAt10: precisionAtK(subset, pred, 10),
    coldStart: {
      ...regressionMetrics(cold.map(i => cases[i].truth), pick(method.value, cold)),
      coverage: cold.length ? cold.filter(i => method.covered[i]).length / cold.length : null
    },
    latencyMs: latency.length ? { median: quantile(latency, 0.5), p95: quantile(latency, 0.95) } : null
  };
}

/** lambda sweep at the main depth, and depth sweep at the main lambda. */
export function sweeps(cases, predictions, indices) {
  const row = (lambda, depth) => {
    const s = summarize(cases, { ...evidenceMethod(predictions, lambda, depth), latency: predictions.latency[`depth${depth}`] }, indices);
    return { lambda, depth, n: s.n, rmse: s.rmse, pcc: s.pcc, mae: s.mae, signAccuracy: s.signAccuracy,
      negativeSignAccuracy: s.negativeSignAccuracy, coverage: s.coverage, latencyMs: s.latencyMs };
  };
  return {
    lambda: [0, ...LAMBDAS].map(lambda => row(lambda, MAIN.depth)),
    depth: DEPTHS.map(depth => row(MAIN.lambda, depth))
  };
}

/**
 * --tune-split: a seeded split of the case indices into a tuning share (20%)
 * and the held-out rest (80%). Disjoint, together all cases, each sorted.
 */
export function tuningSplit(n, seed) {
  const order = shuffledIndices(n, seed);
  const cut = Math.round(n * TUNE_SHARE);
  return { tuneIdx: order.slice(0, cut).sort((a, b) => a - b), reportIdx: order.slice(cut).sort((a, b) => a - b) };
}

/**
 * Picks lambda and depth from TUNE_GRID by RMSE on the tuning indices only
 * (first best in grid order on a tie). Reads nothing at any other index.
 */
export function tune(cases, predictions, tuneIdx, { community = false } = {}) {
  const truth = pick(cases, tuneIdx).map(c => c.truth);
  let best = null;
  for (const depth of TUNE_GRID.depths) {
    for (const lambda of TUNE_GRID.lambdas) {
      const { rmse } = regressionMetrics(truth, pick(evidenceMethod(predictions, lambda, depth, { community }).value, tuneIdx));
      if (!best || rmse < best.rmse) best = { lambda, depth, rmse };
    }
  }
  return best;
}

/**
 * Calibration: a least-squares line from the model's own predictions (the
 * covered cases) to the truth, fitted on the tuning indices only. Fallback
 * predictions are not the model's score and are left alone.
 */
export function fitCalibration(cases, method, tuneIdx) {
  const idx = tuneIdx.filter(i => method.covered[i]);
  return fitLine(idx.map(i => method.value[i]), idx.map(i => cases[i].truth));
}

export function applyCalibration(method, { a, b }) {
  const value = method.value.map((v, i) => (method.covered[i] ? clamp(a + b * v) : v));
  return { ...method, value };
}

/**
 * Everything --tune-split adds: tuned settings for the proposed model with
 * each fallback, and a calibration of the tuned community variant, all from
 * the tuning indices. The caller reports them on reportIdx only.
 */
export function heldOut(cases, predictions, seed) {
  const { tuneIdx, reportIdx } = tuningSplit(cases.length, seed);
  const tunedFloor = tune(cases, predictions, tuneIdx);
  const tunedCommunity = tune(cases, predictions, tuneIdx, { community: true });
  const latency = depth => predictions.latency[`depth${depth}`];
  const tunedCommunityMethod = { ...evidenceMethod(predictions, tunedCommunity.lambda, tunedCommunity.depth, { community: true }), latency: latency(tunedCommunity.depth) };
  const calibration = fitCalibration(cases, tunedCommunityMethod, tuneIdx);
  return {
    tuneIdx,
    reportIdx,
    tunedFloor,
    tunedCommunity,
    calibration,
    methods: {
      tuned: { ...evidenceMethod(predictions, tunedFloor.lambda, tunedFloor.depth), latency: latency(tunedFloor.depth) },
      communityTuned: tunedCommunityMethod,
      communityCalibrated: applyCalibration(tunedCommunityMethod, calibration)
    },
    labels: {
      tuned: `(e*) Proposed, tuned on 20% (lambda ${tunedFloor.lambda}, depth ${tunedFloor.depth})`,
      communityTuned: `(g*) Proposed + community fallback, tuned on 20% (lambda ${tunedCommunity.lambda}, depth ${tunedCommunity.depth})`,
      communityCalibrated: '(g*c) (g*) + linear calibration fitted on 20%'
    }
  };
}
