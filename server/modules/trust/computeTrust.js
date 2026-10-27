// The trust engine as a pure function: no database, no I/O. The app's trust
// service (trustPropagation.js) loads a graph and calls computeTrust, so this
// is the only implementation of the scoring rules in Section 3.2.3.

export const DEFAULTS = Object.freeze({
  depth: 3,            // positive evidence travels at most this many hops
  decay: 0.5,          // per-hop multiplier after the first hop
  referralBoost: 1.4,  // referred edges carry ~40% more weight...
  referralDecay: 0.65, // ...and decay slower
  lambda: 0.5,         // how hard negative evidence pulls a path score down
  negativeDepth: 2,    // negative evidence travels at most this many hops
  areaDiscount: 0.5,   // area trust is second-hand, so it's discounted
  floorVerified: 0.3,
  floorUnverified: 0.1,
  negativeEpsilon: 0.01 // only negative evidence: just below the floor, so below an unrated worker
});

/**
 * What one stored edge says. A rating of 3-5 stars is positive evidence of
 * stars/5, exactly as before; 1-2 stars is negative evidence of (3 - stars)/2
 * and no positive weight at all. Rating edges store stars/5 as `weight`, so
 * the star count is recovered from it. Referral edges are always positive.
 */
export function edgeEvidence(edge) {
  if (edge.type !== 'rating') return { positive: edge.weight, negative: 0 };
  const stars = Math.round(edge.weight * 5);
  return stars <= 2 ? { positive: 0, negative: (3 - stars) / 2 } : { positive: edge.weight, negative: 0 };
}

const idOf = ref => String(ref?._id ?? ref);

/**
 * Builds the plain in-memory graph computeTrust reads, from TrustEdge-shaped
 * records ({ _id?, fromUser, toUser, type, weight, referredFlag }) and users
 * ({ _id, area, verifiedStatus }). fromUser may be populated with { _id, area },
 * which also records the rater's area. Records with the same _id are counted
 * once. Treat the result as read-only: results are cached per graph object.
 *
 *   out:   { [fromId]: [{ to, positive, negative, referred }] }  traversal
 *   in:    { [toId]:   [{ from, weight }] }                       area trust (3-5 star ratings only)
 *   users: { [id]:     { area, verified } }
 */
export function buildGraph(edges, users = []) {
  const graph = { out: {}, in: {}, users: {} };
  for (const u of users) graph.users[idOf(u)] = { area: u.area, verified: u.verifiedStatus === 'verified' };

  const seen = new Set();
  for (const edge of edges) {
    const from = idOf(edge.fromUser);
    const to = idOf(edge.toUser);
    // Read the rater's area before de-duplicating: the populated copy of an
    // edge may arrive after an unpopulated one.
    if (edge.fromUser?.area && !graph.users[from]) graph.users[from] = { area: edge.fromUser.area, verified: false };

    const key = edge._id ? String(edge._id) : edge;
    if (seen.has(key)) continue;
    seen.add(key);

    const evidence = edgeEvidence(edge);
    (graph.out[from] ||= []).push({ to, ...evidence, referred: Boolean(edge.referredFlag) });
    if (edge.type === 'rating' && evidence.positive > 0) (graph.in[to] ||= []).push({ from, weight: edge.weight });
  }
  return graph;
}

// One hop's multiplier: full weight on the first hop, decay after. Referred
// edges get the boost and the slower referral decay as positive evidence;
// as negative evidence every edge is unboosted with the default decay.
function hopFactor(edge, hops, o, positive = true) {
  const referred = positive && edge.referred;
  const boost = referred ? o.referralBoost : 1;
  const decay = hops === 0 ? 1 : referred ? o.referralDecay : o.decay;
  return boost * decay;
}

/**
 * Every person's best positive and negative evidence from `sourceId`.
 *
 * Positive: weighted breadth-first rounds up to `depth` hops. Each hop
 * multiplies the running score by its weight and (after the first hop) its
 * decay exactly once. A person is explored again only when a strictly
 * stronger path to them is found, so the strongest path wins, a weak short
 * path can't hide a stronger longer one, and cycles can't loop (depth is
 * capped and every later hop multiplies by at most 1.4 x 0.65 = 0.91).
 * Only positive edges carry trust onward.
 *
 * Negative: a negative edge at the end of a positive path of fewer than
 * `negativeDepth` hops, with the default decay and no referral boost. With the
 * default of 2 that is the viewer's own 1-2 star rating (undecayed), or one
 * from someone the viewer rated positively, one hop out (decayed once).
 * Strongest negative path wins. Distrust is not passed on through the person
 * who was rated badly.
 */
function propagate(graph, sourceId, o) {
  const best = new Map();   // id -> { score, hops }, strongest positive path
  const within = [new Map([[sourceId, { score: 1, hops: 0 }]])]; // within[d]: best paths of <= d hops, incl. source
  let frontier = [{ id: sourceId, score: 1, hops: 0 }];

  for (let hops = 0; hops < o.depth && frontier.length > 0; hops++) {
    const improved = new Map();
    for (const node of frontier) {
      for (const edge of graph.out[node.id] || []) {
        if (edge.to === sourceId || edge.positive <= 0) continue;
        const score = node.score * edge.positive * hopFactor(edge, hops, o);
        if (score <= (best.get(edge.to)?.score ?? 0)) continue;
        best.set(edge.to, { score, hops: hops + 1 });
        improved.set(edge.to, { id: edge.to, score, hops: hops + 1 });
      }
    }
    frontier = [...improved.values()];
    within.push(new Map([[sourceId, { score: 1, hops: 0 }], ...best]));
  }

  const negative = new Map(); // id -> strongest negative evidence
  const prefixes = o.negativeDepth > 0 ? within[Math.min(o.negativeDepth - 1, within.length - 1)] : new Map();
  for (const [id, path] of prefixes) {
    for (const edge of graph.out[id] || []) {
      if (edge.to === sourceId || edge.negative <= 0) continue;
      const score = path.score * edge.negative * hopFactor(edge, path.hops, o, false);
      if (score > (negative.get(edge.to) ?? 0)) negative.set(edge.to, score);
    }
  }

  return { best, negative };
}

// Average weight of 3-5 star ratings `targetId` got from people in their own
// area; 1-2 star ratings are left out (graph.in holds positive ratings only).
function areaScore(graph, targetId, o) {
  const area = graph.users[targetId]?.area;
  if (!area) return undefined;
  const local = (graph.in[targetId] || []).filter(e => graph.users[e.from]?.area === area);
  if (local.length === 0) return undefined;
  return (local.reduce((sum, e) => sum + e.weight, 0) / local.length) * o.areaDiscount;
}

const cache = new WeakMap(); // graph -> Map(source + options -> propagate result)

function propagateCached(graph, sourceId, o) {
  if (!cache.has(graph)) cache.set(graph, new Map());
  const perGraph = cache.get(graph);
  const key = `${sourceId}|${JSON.stringify(o)}`;
  if (!perGraph.has(key)) perGraph.set(key, propagate(graph, sourceId, o));
  return perGraph.get(key);
}

/**
 * How much `sourceId` should trust `targetId`.
 *
 * - Positive path with score = max(0, positive - lambda * negative) above 0:
 *   source 'path'.
 * - Positive path cancelled out by negative evidence (score 0): source 'area'
 *   with area trust when there is some, otherwise the floor case below.
 * - Only negative evidence: source 'floor', just under the verification floor
 *   (floor - negativeEpsilon), so below an unrated worker with the same
 *   verification. Area trust is not used for them.
 * - No evidence: area trust, else the verification floor, as before.
 *
 * Nobody is removed from results, and nobody scores themselves: the source
 * has no path or negative evidence to itself.
 *
 * Returns { score, positive, negative, source: 'path'|'area'|'floor', pathLength }
 * where pathLength is the hop count of the strongest positive path, or null.
 */
export function computeTrust(graph, sourceId, targetId, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const source = String(sourceId);
  const target = String(targetId);
  const { best, negative: negatives } = propagateCached(graph, source, o);

  const path = target === source ? undefined : best.get(target);
  const positive = path?.score ?? 0;
  const negative = target === source ? 0 : negatives.get(target) ?? 0;
  const floor = graph.users[target]?.verified ? o.floorVerified : o.floorUnverified;

  if (path) {
    const net = Math.max(0, positive - o.lambda * negative);
    if (net > 0) return { score: net, positive, negative, source: 'path', pathLength: path.hops };
    const area = areaScore(graph, target, o);
    if (area !== undefined) return { score: area, positive, negative, source: 'area', pathLength: path.hops };
    return { score: Math.max(0, floor - o.negativeEpsilon), positive, negative, source: 'floor', pathLength: path.hops };
  }

  if (negative > 0) return { score: Math.max(0, floor - o.negativeEpsilon), positive, negative, source: 'floor', pathLength: null };

  const area = areaScore(graph, target, o);
  if (area !== undefined) return { score: area, positive, negative, source: 'area', pathLength: null };
  return { score: floor, positive, negative, source: 'floor', pathLength: null };
}

/**
 * Everyone whose trust from `sourceId` comes from a path (source 'path'),
 * with their final score. A path cancelled out by negative evidence is left out.
 */
export function pathScores(graph, sourceId, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const { best } = propagateCached(graph, String(sourceId), o);
  const scored = [...best.keys()].map(id => [id, computeTrust(graph, sourceId, id, options)]);
  return new Map(scored.filter(([, t]) => t.source === 'path').map(([id, t]) => [id, t.score]));
}
