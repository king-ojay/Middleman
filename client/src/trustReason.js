import { areaLabel } from './options.js';

// Turns the server's `reason` for a ranked worker (server/modules/trust/
// reason.js) into one plain sentence. Every name, star count, number of
// people and month comes from the reason itself; nothing is made up, and
// there is never a score. No pronouns: the app doesn't store them, so the
// worker's first name is repeated instead.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// '2026-03' -> "this month", "in March" (this year) or "in March 2025".
export function monthPhrase(month, now = new Date()) {
  const [year, m] = String(month).split('-').map(Number);
  if (!year || !m) return '';
  if (year === now.getFullYear() && m === now.getMonth() + 1) return 'this month';
  return year === now.getFullYear() ? `in ${MONTHS[m - 1]}` : `in ${MONTHS[m - 1]} ${year}`;
}

const stars = n => `${n}★`;

// "rated Eric 5★", "rated Eric 5★ and vouched for Eric", or "invited Eric".
function endsWith(hop, name) {
  if (hop.type === 'invite') return `invited ${name}`;
  const rated = `rated ${name} ${stars(hop.stars)}`;
  return hop.type === 'vouch' ? `${rated} and vouched for ${name}` : rated;
}

// The rating that ends a 2-hop path: "hired Eric and rated Eric 5★" (with a
// vouch: "hired Eric, rated Eric 5★ and vouched for Eric").
function hiredAndRated(hop, name) {
  if (hop.type === 'invite') return `invited ${name}`;
  const met = `${hop.hired ? 'hired' : 'worked for'} ${name}`;
  return hop.type === 'vouch' ? `${met}, rated ${name} ${stars(hop.stars)} and vouched for ${name}` : `${met} and rated ${name} ${stars(hop.stars)}`;
}

function network({ name, via, hops }, now) {
  const [first, ...rest] = hops;
  if (rest.length === 0) {
    if (first.type === 'invite') return `You invited ${name}.`;
    const when = first.month ? ` ${monthPhrase(first.month, now)}` : '';
    return `You ${first.hired ? 'hired' : 'worked for'} ${name}${when}${first.type === 'vouch' ? ',' : ' and'} ${endsWith(first, name)}.`;
  }

  // Hop 1: the viewer's own link to someone they know. Without a name (their
  // rating isn't on the worker's profile) they are "someone you rated 5★".
  const opening = first.type === 'invite' ? 'You invited' : `You rated`;
  const lead = via
    ? `${opening} ${via}${first.type === 'invite' ? '' : ` ${stars(first.stars)}`}${first.type === 'vouch' ? ` and vouched for ${via}` : ''}. `
    : '';
  const subject = via || (first.type === 'invite' ? 'Someone you invited' : `Someone you rated ${stars(first.stars)}`);

  if (rest.length === 1) return `${lead}${subject} ${hiredAndRated(rest[0], name)}.`;

  // 3 hops: the person in the middle is never named.
  const [middle, last] = rest;
  const how = middle.type === 'invite' ? 'invited' : middle.hired ? 'hired' : 'worked for';
  const between = via ? `Someone ${via} ${how}` : `${subject} ${how} someone who`;
  return `${lead}${between} ${endsWith(last, name)}.`;
}

function area({ name, area: where, people, minStars }) {
  const who = people === 1 ? '1 person' : `${people} people`;
  return `${who} in ${areaLabel(where)} rated ${name} ${stars(minStars)}${minStars < 5 ? ' or higher' : ''}.`;
}

function newcomer({ verified, rated, joined }, now) {
  const since = joined ? `Joined ${monthPhrase(joined, now)}. ` : '';
  if (rated) return `${since}${verified ? 'Verified, not' : 'Not'} yet rated well by people you know.`;
  return `${since}${verified ? 'Verified, no' : 'No'} ratings yet.`;
}

export function reasonSentence(reason, now = new Date()) {
  if (!reason) return '';
  if (reason.tier === 'network') return network(reason, now);
  if (reason.tier === 'area') return area(reason);
  return newcomer(reason, now);
}

// The label on the first-ranked worker's highlighted card; none when they are new.
export const topLabel = reason => ({ network: 'Most trusted for you', area: 'Most trusted in your area' })[reason?.tier] || null;
