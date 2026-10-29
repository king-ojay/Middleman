// The leave-one-out graph and every method compared in Part A. All methods
// read the same graph, and a test edge is removed from it (withEdgeHidden)
// before any method predicts it, so no method can see the edge it predicts.
import { DEFAULTS, computeTrust } from '../../modules/trust/computeTrust.js';

/**
 * Converts ratings exactly as CLAUDE.md says: weight = rating/10; rating > 0
 * is positive evidence of rating/10; rating <= 0 is negative evidence of
 * |rating|/10. Every member is one node type. There are no referral edges, no
 * areas and no verification, so `in` (area trust) and `users` stay empty and
 * everyone is unverified.
 *
 * The graph has the shape computeTrust reads (out/in/users, see buildGraph),
 * plus what the baselines need:
 *   out:     { [from]: [{ to, weight, positive, negative, referred: false }] }
 *   ratedBy: { [to]: Map(from -> rating) }   ratings each member received
 *   totals:  { ratingSum, count }            for the global average
 * Sums are kept in whole rating points so leave-one-out averages are exact.
 */
export function buildRatingGraph(edges) {
  const graph = { out: {}, in: {}, users: {}, ratedBy: {}, totals: { ratingSum: 0, count: 0 } };
  for (const { source, target, rating } of edges) {
    const weight = rating / 10;
    (graph.out[source] ||= []).push({
      to: target,
      weight,
      positive: rating > 0 ? weight : 0,
      negative: rating > 0 ? 0 : Math.abs(weight),
      referred: false
    });
    (graph.ratedBy[target] ||= new Map()).set(source, rating);
    graph.totals.ratingSum += rating;
    graph.totals.count += 1;
  }
  return graph;
}

/**
 * Removes the edge source -> target, calls fn(view) and puts the edge back in
 * the same place (also if fn throws). `view` is a new object each time:
 * computeTrust caches results per graph object, so a fresh view means nothing
 * computed while the edge was present can be reused. The view's raters() and
 * totals leave the edge out without changing the graph's own copies.
 */
export function withEdgeHidden(graph, source, target, fn) {
  const list = graph.out[source];
  const index = list ? list.findIndex(e => e.to === target) : -1;
  if (index < 0) throw new Error(`No edge ${source} -> ${target} to hide`);
  const [edge] = list.splice(index, 1);
  const rating = graph.ratedBy[target].get(source);
  const targetRaters = new Map([...graph.ratedBy[target]].filter(([from]) => from !== source));
  const view = {
    out: graph.out,
    in: graph.in,
    users: graph.users,
    raters: member => (member === target ? targetRaters : graph.ratedBy[member]),
    totals: { ratingSum: graph.totals.ratingSum - rating, count: graph.totals.count - 1 }
  };
  try {
    return fn(view);
  } finally {
    list.splice(index, 0, edge);
  }
}

/** The view of the whole graph, nothing hidden (for tests and spot checks). */
export const fullView = graph => ({ ...graph, raters: member => graph.ratedBy[member] });

// Every method returns { value, covered }: value on [-1, 1]; covered is false
// when the method had no evidence of its own and used its fallback.

export const clamp = x => Math.max(-1, Math.min(1, x));

/** (a) Mean of every other rating in the network. */
export function globalAverage(view) {
  return { value: view.totals.ratingSum / 10 / view.totals.count, covered: true };
}

/** (b) Mean of the other ratings the target received; the global average if it has none. */
export function flatAverage(view, source, target) {
  const ratings = view.raters(target);
  if (!ratings || ratings.size === 0) return { value: globalAverage(view).value, covered: false };
  let sum = 0;
  for (const rating of ratings.values()) sum += rating;
  return { value: sum / 10 / ratings.size, covered: true };
}

/**
 * (c) MoleTrust (Massa & Avesani 2007). Members are put into levels by
 * breadth-first distance from the source, up to the horizon; edges back to
 * the same or an earlier level are dropped, which removes cycles. The source
 * has trust 1. A member's trust is the weighted average of its predecessors'
 * statements about it, weighted by each predecessor's own trust, counting
 * only predecessors whose trust is at least the threshold. The prediction is
 * the target's trust; not reached, or no predecessor over the threshold,
 * falls back to the global average.
 */
export function moleTrust(view, source, target, { horizon = 3, threshold = 0.5 } = {}) {
  const trust = new Map([[source, 1]]);
  const placed = new Set([source]);
  let level = [source];
  for (let d = 0; d < horizon && level.length > 0; d++) {
    const next = new Map(); // member -> [sum of trust x statement, sum of trust]
    for (const u of level) {
      const tu = trust.get(u);
      for (const e of view.out[u] || []) {
        if (placed.has(e.to)) continue;
        if (!next.has(e.to)) next.set(e.to, [0, 0]);
        if (tu !== undefined && tu >= threshold) {
          const acc = next.get(e.to);
          acc[0] += tu * e.weight;
          acc[1] += tu;
        }
      }
    }
    for (const [v, [num, den]] of next) {
      placed.add(v);
      if (den > 0) trust.set(v, num / den);
    }
    if (next.has(target)) break;
    level = [...next.keys()];
  }
  return trust.has(target) && target !== source
    ? { value: clamp(trust.get(target)), covered: true }
    : { value: globalAverage(view).value, covered: false };
}

/**
 * (d) TidalTrust (Golbeck 2005). Breadth-first search from the source along
 * positive edges, stopping at the first level that contains members who rated
 * the target, so only the shortest paths count. max = the strongest of those
 * paths, a path's strength being its weakest edge (excluding the final rating
 * of the target). Then, from the raters back to the source:
 * t(i) = sum of w(i,j) x t(j) / sum of w(i,j) over next-level neighbours j
 * with w(i,j) >= max, where a rater's t is its rating of the target. No
 * rater reachable falls back to the global average.
 */
export function tidalTrust(view, source, target) {
  const raters = view.raters(target);
  const fallback = { value: globalAverage(view).value, covered: false };
  if (!raters || raters.size === 0) return fallback;

  const depth = new Map([[source, 0]]);
  const strength = new Map([[source, Infinity]]);
  const levels = [[source]];
  let found = [];
  while (levels.at(-1).length > 0) {
    const d = levels.length - 1;
    found = levels[d].filter(u => u !== source && raters.has(u));
    if (found.length > 0) break;
    const next = [];
    for (const u of levels[d]) {
      for (const e of view.out[u] || []) {
        if (e.positive <= 0 || e.to === target) continue;
        const s = Math.min(strength.get(u), e.positive);
        if (!depth.has(e.to)) {
          depth.set(e.to, d + 1);
          strength.set(e.to, s);
          next.push(e.to);
        } else if (depth.get(e.to) === d + 1 && s > strength.get(e.to)) {
          strength.set(e.to, s);
        }
      }
    }
    levels.push(next);
  }
  if (found.length === 0) return fallback;

  const max = Math.max(...found.map(r => strength.get(r)));
  const t = new Map(found.map(r => [r, raters.get(r) / 10]));
  for (let k = levels.length - 2; k >= 0; k--) {
    for (const u of levels[k]) {
      let num = 0, den = 0;
      for (const e of view.out[u] || []) {
        if (e.positive < max || depth.get(e.to) !== k + 1 || !t.has(e.to)) continue;
        num += e.positive * t.get(e.to);
        den += e.positive;
      }
      if (den > 0) t.set(u, num / den);
    }
  }
  return t.has(source) ? { value: clamp(t.get(source)), covered: true } : fallback;
}

/**
 * (e)/(f) The proposed model: computeTrust, unchanged, from source to target.
 * Its positive and negative evidence do not depend on lambda, so one call
 * serves every lambda; see signedPrediction.
 */
export function proposedEvidence(view, source, target, { depth = DEFAULTS.depth } = {}) {
  const { positive, negative } = computeTrust(view, source, target, { depth });
  return { positive, negative };
}

// What computeTrust returns for someone with no evidence when areas and
// verification are off: the unverified floor.
export const NO_EVIDENCE = DEFAULTS.floorUnverified;

/**
 * prediction = positive - lambda x negative, signed and clamped to [-1, 1].
 * With lambda 0 (positive-only) negative evidence counts for nothing. No
 * evidence at all: the floor computeTrust would return.
 */
export function signedPrediction({ positive, negative }, lambda) {
  const hasEvidence = positive > 0 || (lambda > 0 && negative > 0);
  return hasEvidence
    ? { value: clamp(positive - lambda * negative), covered: true }
    : { value: NO_EVIDENCE, covered: false };
}

/**
 * Reciprocal evidence (Kumar et al.'s Reciprocal baseline): the target's own
 * rating of the source, if there is one. It is a different edge from the
 * hidden source -> target, so it is visible in the view. Suits Bitcoin OTC,
 * where most ratings are mutual; Middleman ranks strangers, so it does not
 * apply there.
 */
export function reciprocal(view, source, target) {
  const rating = view.raters(source)?.get(target);
  return rating === undefined ? { value: null, covered: false } : { value: rating / 10, covered: true };
}

/**
 * Least-squares line truth ~ a + b x over the given (x, truth) pairs. Fewer
 * than two points, or no spread in x, gives the identity (a 0, b 1).
 */
export function fitLine(xs, ys) {
  const n = xs.length;
  if (n < 2) return { a: 0, b: 1, n };
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  if (sxx === 0) return { a: 0, b: 1, n };
  const b = sxy / sxx;
  return { a: my - b * mx, b, n };
}
