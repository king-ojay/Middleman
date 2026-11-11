import User from '../users/user.model.js';
import Rating from './rating.model.js';

// Turns rankByTrust's internal trustReason (explainTrust: user ids, raw
// edges) into the `reason` other users may see, for Discover and the offers
// on a client's job. Only first names: the worker's own, and the viewer's
// direct connection on hop 1 (someone the viewer rated or invited). Anyone
// further along a path has no name and no id. No scores or weights; dates
// are months only.
//
//   network: { tier, name, via, hops: [{ type: 'rating'|'vouch'|'invite', stars?, hired?, month }] }
//            via: hop 1's first name, or null (a 1-hop path, or kept anonymous, see below)
//            hired: the rater was the client on that job (else the worker who rated the client)
//   area:    { tier, name, area, people, minStars }  people in the worker's own area who gave 3-5 stars
//   new:     { tier, name, verified, rated, joined }  rated: has any rating at all, good or bad

const PROFILE_RATINGS = 5; // the profile shows the 5 most recent ratings (users.routes.js)

const firstName = name => String(name || '').trim().split(/\s+/)[0] || null;

// "2026-03" in Kigali time (UTC+2 all year), so a late-evening rating lands in the right month.
const monthOf = date => (date ? new Date(new Date(date).getTime() + 2 * 3600e3).toISOString().slice(0, 7) : null);

const HOP_TYPE = step => (step.kind === 'signup_referral' ? 'invite' : step.referred ? 'vouch' : 'rating');

/**
 * Adds `reason` to each ranked person (rankByTrust(..., { explain: true })).
 * Returns new objects without trustReason.
 */
export async function withPublicReasons(ranked) {
  const paths = ranked.filter(p => p.trustReason?.steps);
  const onPaths = new Set(paths.flatMap(p => p.trustReason.steps.flatMap(s => [s.from, s.to])));
  const people = new Map((await User.find({ _id: { $in: [...onPaths] } }, 'name role').lean()).map(u => [String(u._id), u]));

  // A hop-1 person is named next to their rating of the worker only when
  // that rating is already on the worker's profile; otherwise "someone".
  const shown = new Map();
  await Promise.all(paths.filter(p => p.trustReason.steps.length === 2 && p.trustReason.steps[1].kind === 'rating').map(async p => {
    const recent = await Rating.find({ toUser: p._id }, 'fromUser score').sort({ createdAt: -1 }).limit(PROFILE_RATINGS).lean();
    const { from, stars } = p.trustReason.steps[1];
    shown.set(String(p._id), recent.some(r => String(r.fromUser) === String(from) && r.score === stars));
  }));

  return ranked.map(({ trustReason: why, createdAt, ...person }) => {
    const name = firstName(person.name);
    let reason;
    if (why?.steps) {
      const { steps } = why;
      const named = steps.length > 1 && (steps.length > 2 || steps[1].kind !== 'rating' || shown.get(String(person._id)));
      reason = {
        tier: 'network',
        name,
        via: named ? firstName(people.get(String(steps[0].to))?.name) : null,
        hops: steps.map(s => ({
          type: HOP_TYPE(s),
          ...(s.kind === 'rating' && { stars: s.stars, hired: people.get(String(s.from))?.role === 'client' }),
          month: monthOf(s.at)
        }))
      };
    } else if (why && 'areaRaters' in why) {
      reason = { tier: 'area', name, area: person.area, people: why.areaRaters, minStars: why.minStars };
    } else {
      reason = { tier: 'new', name, verified: Boolean(why?.verified), rated: Boolean(why?.rated), joined: monthOf(createdAt) };
    }
    return { ...person, reason };
  });
}
