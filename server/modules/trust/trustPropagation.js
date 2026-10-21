import TrustEdge from './trustEdge.model.js';
import { DEFAULTS, buildGraph, computeTrust, pathScores } from './computeTrust.js';

// The trust service: loads the part of the trust graph a viewer can reach
// and hands it to computeTrust (computeTrust.js), which holds the scoring
// rules from Chapter 3, Section 3.2.3. Nothing here scores anyone itself.

// Layered fallback order from Section 3.2.3: graph path -> area -> verification floor.
export const TIER_RANK = { network: 0, area: 1, fallback: 2 };
const TIER_OF_SOURCE = { path: 'network', area: 'area', floor: 'fallback' };

/**
 * Loads every edge leaving a person the viewer can reach in fewer than
 * `depth` hops, one query per hop. That is all computeTrust needs to follow
 * paths. With `candidates`, also loads the ratings they received (raters'
 * areas populated) for area-level trust.
 */
async function loadTrustGraph(viewerId, candidates = [], options = {}) {
  const o = { ...DEFAULTS, ...options };
  const viewer = String(viewerId);
  const edges = [];
  const visited = new Set([viewer]);
  let frontier = [viewer];

  for (let hop = 0; hop < o.depth && frontier.length > 0; hop++) {
    // eslint-disable-next-line no-await-in-loop
    const found = await TrustEdge.find({ fromUser: { $in: frontier } }).lean();
    edges.push(...found);
    const graph = buildGraph(found);
    frontier = [];
    for (const out of Object.values(graph.out)) {
      for (const edge of out) {
        if (!visited.has(edge.to)) { visited.add(edge.to); frontier.push(edge.to); }
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
 * Path score from `clientId` to everyone they have a path to. People with no
 * path are left out; rankByTrust applies the fallback for those.
 */
export async function computeTrustScores(clientId, options = {}) {
  return pathScores(await loadTrustGraph(clientId, [], options), clientId, options);
}

/**
 * Scores and tiers `candidates` (plain user objects with _id, area and
 * verifiedStatus) from `viewerId`'s point of view and returns them sorted by
 * tier then score.
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
    decayRate: referredFlag ? DEFAULTS.referralDecay : DEFAULTS.decay // kept for the record; computeTrust takes decay from its options
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
    decayRate: DEFAULTS.decay
  });
}
