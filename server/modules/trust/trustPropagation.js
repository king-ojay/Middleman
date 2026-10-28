import TrustEdge from './trustEdge.model.js';
import { DEFAULTS, buildGraph, computeTrust, pathScores } from './computeTrust.js';

// The trust service: loads the part of the trust graph a viewer can reach
// and hands it to computeTrust (computeTrust.js), which holds the scoring
// rules from Chapter 3, Section 3.2.3. Nothing here scores anyone itself.

// Layered fallback order from Section 3.2.3: graph path -> area -> verification floor.
export const TIER_RANK = { network: 0, area: 1, fallback: 2 };
const TIER_OF_SOURCE = { path: 'network', area: 'area', floor: 'fallback' };

/**
 * Loads every edge leaving a person the viewer can reach through positive
 * edges in fewer hops than either evidence limit, one query per hop. That is
 * all computeTrust needs to follow paths. With `candidates`, also loads the
 * ratings they received (raters' areas populated) for area-level trust.
 */
async function loadTrustGraph(viewerId, candidates = [], options = {}) {
  const o = { ...DEFAULTS, ...options };
  const viewer = String(viewerId);
  const edges = [];
  const visited = new Set([viewer]);
  let frontier = [viewer];

  for (let hop = 0; hop < Math.max(o.depth, o.negativeDepth) && frontier.length > 0; hop++) {
    // eslint-disable-next-line no-await-in-loop
    const found = await TrustEdge.find({ fromUser: { $in: frontier } }).lean();
    edges.push(...found);
    const graph = buildGraph(found);
    frontier = [];
    for (const out of Object.values(graph.out)) {
      for (const edge of out) {
        if (edge.positive > 0 && !visited.has(edge.to)) { visited.add(edge.to); frontier.push(edge.to); }
      }
    }
  }

  if (candidates.length > 0) {
    const received = await TrustEdge.find({
      toUser: { $in: candidates.map(c => c._id) },
      type: 'rating'
    }).populate('fromUser', 'area').lean();
    edges.push(...received);
  }

  return buildGraph(edges, candidates);
}

/**
 * Final path score from `clientId` to everyone in the network tier. People
 * with no positive path, or one cancelled out by negative evidence, are left
 * out; rankByTrust applies the fallback for those.
 */
export async function computeTrustScores(clientId, options = {}) {
  return pathScores(await loadTrustGraph(clientId, [], options), clientId, options);
}

/**
 * Scores and tiers `candidates` (plain user objects with _id, area and
 * verifiedStatus) from `viewerId`'s point of view and returns them sorted by
 * tier, then score, then worker id, so equal scores always come back in the
 * same order. Everyone passed in comes back, however they were rated.
 * Symmetric by design: a client ranking workers and a worker sizing up
 * clients use the same call.
 */
export async function rankByTrust(viewerId, candidates, options = {}) {
  const graph = await loadTrustGraph(viewerId, candidates, options);
  const ranked = candidates.map(candidate => {
    const trust = computeTrust(graph, viewerId, candidate._id, options);
    return { ...candidate, trustScore: trust.score, trustSource: TIER_OF_SOURCE[trust.source] };
  });

  return ranked.sort((a, b) =>
    TIER_RANK[a.trustSource] - TIER_RANK[b.trustSource] ||
    b.trustScore - a.trustScore ||
    String(a._id).localeCompare(String(b._id))
  );
}

/**
 * Writes a trust edge when a job is rated. Called from both rating directions
 * (client -> worker and worker -> client) — see Rating model. With a
 * `session`, the write is part of that transaction (see writeRating).
 */
export async function writeTrustEdgeFromRating({ fromUser, toUser, score, referredFlag }, { session = null } = {}) {
  const weight = score / 5; // normalise 1-5 to 0-1; computeTrust reads 1-2 stars as negative evidence
  const edge = {
    fromUser,
    toUser,
    type: 'rating',
    weight,
    referredFlag: Boolean(referredFlag),
    decayRate: referredFlag ? DEFAULTS.referralDecay : DEFAULTS.decay // kept for the record; computeTrust takes decay from its options
  };
  if (!session) return TrustEdge.create(edge);
  const [created] = await TrustEdge.create([edge], { session });
  return created;
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
    decayRate: DEFAULTS.decay
  });
}
