// The trust engine as a pure function: no database, no I/O. The app's trust
// service (trustPropagation.js) loads a graph and calls computeTrust, so this
// is the only implementation of the scoring rules in Section 3.2.3.

export const DEFAULTS = Object.freeze({
  depth: 3,            // trust travels at most this many hops
  decay: 0.5,          // per-hop multiplier after the first hop
  referralBoost: 1.4,  // referred edges carry ~40% more weight...
  referralDecay: 0.65, // ...and decay slower
  areaDiscount: 0.5,   // area trust is second-hand, so it's discounted
  floorVerified: 0.3,
  floorUnverified: 0.1
});

const idOf = ref => String(ref?._id ?? ref);

/**
 * Builds the plain in-memory graph computeTrust reads, from TrustEdge-shaped
 * records ({ _id?, fromUser, toUser, type, weight, referredFlag }) and users
 * ({ _id, area, verifiedStatus }). fromUser may be populated with { _id, area },
 * which also records the rater's area. Records with the same _id are counted
 * once. Treat the result as read-only: results are cached per graph object.
 *
 *   out:   { [fromId]: [{ to, weight, referred }] }  traversal
 *   in:    { [toId]:   [{ from, weight }] }          area trust (ratings only)
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

    (graph.out[from] ||= []).push({ to, weight: edge.weight, referred: Boolean(edge.referredFlag) });
    if (edge.type === 'rating') (graph.in[to] ||= []).push({ from, weight: edge.weight });
  }
  return graph;
}

// One hop's multiplier: full weight on the first hop, the edge's decay after.
function hopFactor(edge, hops, o) {
  const boost = edge.referred ? o.referralBoost : 1;
  const decay = hops === 0 ? 1 : edge.referred ? o.referralDecay : o.decay;
  return boost * decay;
}

/**
 * Every person's strongest path from `sourceId`: weighted breadth-first
 * rounds up to `depth` hops. Each hop multiplies the running score by its
 * weight and (after the first hop) its decay exactly once. A person is
 * explored again only when a strictly stronger path to them is found, so the
 * strongest path wins, a weak short path can't hide a stronger longer one,
 * and cycles can't loop (depth is capped and every later hop multiplies by
 * at most 1.4 x 0.65 = 0.91).
 */
function propagate(graph, sourceId, o) {
  const best = new Map(); // id -> { score, hops }
  let frontier = [{ id: sourceId, score: 1, hops: 0 }];

  for (let hops = 0; hops < o.depth && frontier.length > 0; hops++) {
    const improved = new Map();
    for (const node of frontier) {
      for (const edge of graph.out[node.id] || []) {
        if (edge.to === sourceId) continue;
        const score = node.score * edge.weight * hopFactor(edge, hops, o);
        if (score <= (best.get(edge.to)?.score ?? 0)) continue;
        best.set(edge.to, { score, hops: hops + 1 });
        improved.set(edge.to, { id: edge.to, score, hops: hops + 1 });
      }
    }
    frontier = [...improved.values()];
  }

  return { best };
}

// Average weight of ratings `targetId` got from people in their own area.
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
 * How much `sourceId` should trust `targetId`: the strongest path score
 * (source 'path'), else area trust, else the verification floor. Nobody
 * scores themselves: the source has no path to itself.
 *
 * Returns { score, positive, source: 'path'|'area'|'floor', pathLength }
 * where pathLength is the hop count of the strongest path, or null.
 */
export function computeTrust(graph, sourceId, targetId, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const source = String(sourceId);
  const target = String(targetId);
  const { best } = propagateCached(graph, source, o);

  const path = target === source ? undefined : best.get(target);
  if (path) return { score: path.score, positive: path.score, source: 'path', pathLength: path.hops };

  const area = areaScore(graph, target, o);
  if (area !== undefined) return { score: area, positive: 0, source: 'area', pathLength: null };

  const floor = graph.users[target]?.verified ? o.floorVerified : o.floorUnverified;
  return { score: floor, positive: 0, source: 'floor', pathLength: null };
}

/** Everyone `sourceId` has a path to, with their path score. */
export function pathScores(graph, sourceId, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const { best } = propagateCached(graph, String(sourceId), o);
  return new Map([...best].map(([id, path]) => [id, path.score]));
}
