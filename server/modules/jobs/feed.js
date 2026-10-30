import { AREAS } from '../../config/areas.js';
import { CATEGORIES } from '../../config/categories.js';
import { HttpError } from '../httpError.js';

// Trade names as the app shows them, so "phone repair" finds phone_repair jobs.
const TRADE_NAMES = new Map(CATEGORIES.map(c => [c, c.replace(/_/g, ' ')]));
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_high: { proposedPrice: -1, createdAt: -1, _id: -1 },
  price_low: { proposedPrice: 1, createdAt: -1, _id: -1 }
};
export const FEED_LIMIT = 100;
const MAX_QUERY = 100;

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The worker's job list as a MongoDB filter and sort, from the query string
 * of GET /api/jobs/feed. Without parameters it is the original feed: open
 * jobs in the worker's own area matching one of their trades, newest first.
 *   area:  mine (default) | all (every pilot area) | one pilot area
 *   trade: mine (default) | any | one trade
 *   q:     free text, matched against the description and the trade name
 *   sort:  newest (default) | price_high | price_low
 * Jobs have no separate title; the description is what clients write.
 */
export function feedQuery(worker, { area = 'mine', trade = 'mine', q = '', sort = 'newest' } = {}) {
  const filter = { status: 'open' };

  if (area === 'mine') filter.area = worker.area;
  else if (area === 'all') filter.area = { $in: AREAS };
  else if (AREAS.includes(area)) filter.area = area;
  else throw new HttpError(400, 'Unknown area');

  if (trade === 'mine') filter.category = { $in: worker.skills || [] };
  else if (trade === 'any') filter.category = { $in: CATEGORIES };
  else if (CATEGORIES.includes(trade)) filter.category = trade;
  else throw new HttpError(400, 'Unknown trade');

  if (typeof q !== 'string') throw new HttpError(400, 'Search text must be text');
  const text = q.trim().slice(0, MAX_QUERY);
  if (text) {
    const lower = text.toLowerCase();
    const trades = CATEGORIES.filter(c => TRADE_NAMES.get(c).includes(lower));
    filter.$or = [{ description: { $regex: escapeRegex(text), $options: 'i' } }, { category: { $in: trades } }];
  }

  if (!SORTS[sort]) throw new HttpError(400, 'Unknown sort');
  return { filter, sort: SORTS[sort] };
}
