import { areaLabel } from './options.js';
import { t, tn } from './i18n/index.js';

// Turns the server's `reason` for a ranked worker (server/modules/trust/
// reason.js) into one plain sentence. Every name, star count, number of
// people and month comes from the reason itself; nothing is made up, and
// there is never a score. No pronouns: the app doesn't store them, so the
// worker's first name is repeated instead. The words are templates in
// i18n/en.js and rw.js ("reason.*"), with the names and numbers put in here.

// '2026-03' -> "this month", "in March" (this year) or "in March 2025".
export function monthPhrase(month, now = new Date()) {
  const [year, m] = String(month).split('-').map(Number);
  if (!year || !m) return '';
  if (year === now.getFullYear() && m === now.getMonth() + 1) return t('when.thisMonth');
  const name = t(`month.${m}`);
  return year === now.getFullYear() ? t('when.inMonth', { month: name }) : t('when.inMonthYear', { month: name, year });
}

const stars = n => `${n}★`;
// How a hop ended: invited, rated, or rated and vouched (the sentence keys' last part).
const ending = hop => (hop.type === 'invite' ? 'invited' : hop.type === 'vouch' ? 'vouched' : 'rated');
const met = hop => (hop.hired ? 'hired' : 'worked');

function network({ name, via, hops }, now) {
  const [first, ...rest] = hops;
  if (rest.length === 0) {
    if (first.type === 'invite') return t('reason.direct.invited', { name });
    const when = first.month ? ` ${monthPhrase(first.month, now)}` : '';
    return t(`reason.direct.${met(first)}.${ending(first)}`, { name, when, stars: stars(first.stars) });
  }

  // Hop 1: the viewer's own link to someone they know. Without a name (their
  // rating isn't on the worker's profile) they are "someone you rated 5★".
  const lead = via ? t(`reason.lead.${ending(first)}`, { via, stars: stars(first.stars) }) : '';
  const subject = via || (first.type === 'invite' ? t('reason.subject.invited') : t('reason.subject.rated', { stars: stars(first.stars) }));

  if (rest.length === 1) {
    const [last] = rest;
    const key = last.type === 'invite' ? 'reason.two.invited' : `reason.two.${met(last)}.${ending(last)}`;
    return t(key, { lead, subject, name, stars: stars(last.stars) });
  }

  // 3 hops: the person in the middle is never named.
  const [middle, last] = rest;
  const how = t(`reason.how.${middle.type === 'invite' ? 'invited' : met(middle)}`);
  return t(`reason.three.${via ? 'named' : 'anon'}.${ending(last)}`, { lead, via, subject, how, name, stars: stars(last.stars) });
}

function area({ name, area: where, people, minStars }) {
  const key = `reason.area.${people === 1 ? 'one' : 'other'}${minStars < 5 ? '.orHigher' : ''}`;
  return t(key, { n: people, area: areaLabel(where), name, stars: stars(minStars) });
}

function newcomer({ verified, rated, joined }, now) {
  const since = joined ? t('reason.joined', { when: monthPhrase(joined, now) }) : '';
  return t(`reason.new.${rated ? 'rated' : 'unrated'}${verified ? '.verified' : ''}`, { since });
}

export function reasonSentence(reason, now = new Date()) {
  if (!reason) return '';
  if (reason.tier === 'network') return network(reason, now);
  if (reason.tier === 'area') return area(reason);
  return newcomer(reason, now);
}

// The label on the first-ranked worker's highlighted card; none when they are new.
export const topLabel = reason => (['network', 'area'].includes(reason?.tier) ? t(`reason.top.${reason.tier}`) : null);

// Who gave the rating (or invite) that ends a path, as the sentence says it:
// you (1 hop), the named hop-1 person, or "someone" when the sentence keeps
// them anonymous (hop 1 not named, or the middle person of 3 hops).
function lastLink({ via, hops }) {
  if (hops.length === 1) return { by: t('reason.tile.byYou'), from: t('reason.tile.fromYouLast') };
  if (hops.length === 2 && via) return { by: t('reason.tile.by', { who: via }), from: t('reason.tile.from', { who: via }) };
  return { by: t('reason.tile.bySomeone'), from: t('reason.tile.fromSomeone') };
}

/**
 * Up to three short facts for the first-ranked worker's card, built only from
 * the same reason as the sentence (and so under the same privacy rules):
 *   network: "2 steps / from you", "5★ / from Amina" (or "Invited / by
 *            Amina"), "Vouched / by Amina" when the last rating was a vouch;
 *   area:    "3 people / in Kimironko", "4★ / lowest rating".
 * A fact the reason doesn't have gets no tile; a new worker gets none.
 */
export function reasonTiles(reason) {
  if (reason?.tier === 'network') {
    const steps = reason.hops.length;
    const last = reason.hops[steps - 1];
    const who = lastLink(reason);
    const tiles = [{ value: tn('reason.tile.steps', steps), label: t('reason.tile.fromYou') }];
    if (last.type === 'invite') tiles.push({ value: t('reason.tile.invited'), label: who.by });
    else tiles.push({ value: stars(last.stars), label: who.from });
    if (last.type === 'vouch') tiles.push({ value: t('reason.tile.vouched'), label: who.by });
    return tiles;
  }
  if (reason?.tier === 'area') {
    return [
      { value: tn('reason.tile.people', reason.people), label: t('reason.tile.inArea', { area: areaLabel(reason.area) }) },
      { value: stars(reason.minStars), label: t('reason.tile.lowest') }
    ];
  }
  return [];
}

/**
 * The people along a network path, for the overlapping avatars: you, then
 * each person in between (named only when the sentence names them: hop 1's
 * `via`; everyone else is anonymous, drawn as a blank avatar), then the
 * worker. Area and new workers have no path.
 */
export function reasonPath(reason) {
  if (reason?.tier !== 'network') return [];
  const between = reason.hops.slice(1).map((_, i) => (i === 0 && reason.via ? { name: reason.via } : { anonymous: true }));
  return [{ name: t('common.you'), you: true }, ...between, { name: reason.name, worker: true }];
}
