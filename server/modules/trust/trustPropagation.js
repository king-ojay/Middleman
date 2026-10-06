import TrustEdge from './trustEdge.model.js';

const MAX_DEPTH = 3;
const DEFAULT_DECAY = 0.5;
const REFERRED_BOOST = 1.4; // referred edges carry ~40% more weight and decay slower

/**
 * Computes a personalised trust score from `clientId` to every worker reachable
 * within MAX_DEPTH hops, by weighted breadth-first traversal of the trust graph.
 *
 * This is the algorithm described in Chapter 3, Section 3.2.3 of the proposal:
 * - direct edges contribute their full weight
 * - each additional hop multiplies the running score by that edge's decay rate
 *   exactly once, so a path of n hops is decayed (n - 1) times in total
 * - where multiple paths reach the same worker, the strongest path wins
 * - a `referredFlag` edge propagates further/stronger than an ordinary rating
 *
 * Returns a Map<workerId, score> for every worker reached through the graph.
 * Workers with NO path (cold-start case) are not included here — the caller
 * is responsible for applying the layered fallback (area-level trust, then
 * verification floor) for those, per Section 3.2.3.
 */
export async function computeTrustScores(clientId) {
  const scores = new Map(); // workerId (string) -> best score found so far
  const visited = new Set([String(clientId)]);

  let frontier = [{ userId: String(clientId), accumulated: 1.0, depth: 0 }];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
    const frontierIds = frontier.map(f => f.userId);
    // eslint-disable-next-line no-await-in-loop
    const edges = await TrustEdge.find({ fromUser: { $in: frontierIds } }).lean();

    const edgesBySource = new Map();
    for (const edge of edges) {
      const key = String(edge.fromUser);
      if (!edgesBySource.has(key)) edgesBySource.set(key, []);
      edgesBySource.get(key).push(edge);
    }

    const nextFrontier = [];

    for (const node of frontier) {
      const outgoing = edgesBySource.get(node.userId) || [];
      for (const edge of outgoing) {
        const targetId = String(edge.toUser);
        if (visited.has(targetId)) continue; // prevent cycles

        const referredMultiplier = edge.referredFlag ? REFERRED_BOOST : 1.0;
        const decay = edge.decayRate ?? DEFAULT_DECAY;
        // node.accumulated already carries the decay of earlier hops, so this
        // hop applies its own decay once rather than decay ** depth again.
        const contribution = node.accumulated * edge.weight * referredMultiplier * (depth === 0 ? 1 : decay);

        // toUser being a worker is determined by the caller filtering final results;
        // here we just propagate through the graph regardless of role.
        const existing = scores.get(targetId);
        if (!existing || contribution > existing) {
          scores.set(targetId, contribution);
        }

        nextFrontier.push({ userId: targetId, accumulated: contribution, depth: depth + 1 });
        visited.add(targetId);
      }
    }

    frontier = nextFrontier;
  }

  return scores;
}

// Area-level trust is second-hand community opinion, not a path through the
// viewer's own network, so it's discounted relative to the edge weights it
// averages.
const AREA_DISCOUNT = 0.5;

// Layered fallback order from Section 3.2.3: graph path -> area -> verification floor.
export const TIER_RANK = { network: 0, area: 1, fallback: 2 };

/**
 * Area-level community trust for users the viewer's graph can't reach: the
 * average weight of rating edges a user has received from people in that
 * user's own area. Users with no such ratings get no entry.
 */
async function computeAreaScores(users) {
  if (users.length === 0) return new Map();
  const areaByUser = new Map(users.map(u => [String(u._id), u.area]));

  const edges = await TrustEdge.find({
    toUser: { $in: users.map(u => u._id) },
    type: 'rating'
  }).populate('fromUser', 'area').lean();

  const sums = new Map(); // userId -> { total, count }
  for (const edge of edges) {
    const userId = String(edge.toUser);
    if (edge.fromUser?.area !== areaByUser.get(userId)) continue;
    const acc = sums.get(userId) || { total: 0, count: 0 };
    acc.total += edge.weight;
    acc.count += 1;
    sums.set(userId, acc);
  }

  const scores = new Map();
  for (const [userId, { total, count }] of sums) {
    scores.set(userId, (total / count) * AREA_DISCOUNT);
  }
  return scores;
}

/**
 * Scores and tiers `candidates` (plain user objects with _id, area and
 * verifiedStatus) from `viewerId`'s point of view, applying the layered
 * fallback, and returns them sorted by tier then score. Symmetric by design:
 * a client ranking workers and a worker sizing up clients use the same call.
 */
export async function rankByTrust(viewerId, candidates) {
  const scores = await computeTrustScores(viewerId);
  const unreached = candidates.filter(c => !scores.has(String(c._id)));
  const areaScores = await computeAreaScores(unreached);

  const ranked = candidates.map(candidate => {
    const id = String(candidate._id);
    if (scores.has(id)) return { ...candidate, trustScore: scores.get(id), trustSource: 'network' };
    if (areaScores.has(id)) return { ...candidate, trustScore: areaScores.get(id), trustSource: 'area' };
    // Final fallback: verified users get a modest floor, unverified the lowest.
    const floor = candidate.verifiedStatus === 'verified' ? 0.3 : 0.1;
    return { ...candidate, trustScore: floor, trustSource: 'fallback' };
  });

  return ranked.sort((a, b) =>
    TIER_RANK[a.trustSource] - TIER_RANK[b.trustSource] || b.trustScore - a.trustScore
  );
}

/**
 * Writes a trust edge when a job is rated. Called from both rating directions
 * (client -> worker and worker -> client) — see Rating model.
 */
export async function writeTrustEdgeFromRating({ fromUser, toUser, score, referredFlag }) {
  const weight = score / 5; // normalise 1-5 to 0-1
  return TrustEdge.create({
    fromUser,
    toUser,
    type: 'rating',
    weight,
    referredFlag: Boolean(referredFlag),
    decayRate: referredFlag ? 0.65 : DEFAULT_DECAY // referred edges decay slower
  });
}

/**
 * Writes a referral edge at signup time.
 */
export async function writeTrustEdgeFromReferral({ fromUser, toUser }) {
  return TrustEdge.create({
    fromUser,
    toUser,
    type: 'signup_referral',
    weight: 1.0,
    decayRate: DEFAULT_DECAY
  });
}
