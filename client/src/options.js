import { AREAS } from './areas.shared.js';
import { t, tn } from './i18n/index.js';

// Dropdown options and display labels. Trade values must match the server's
// config/categories.js; areas come from shared/areas.js (copied here as
// areas.shared.js, since the app is built from client/ alone). Trade names
// are translated (i18n "trade.*"); area names are place names and stay as they are.
const TRADES = ['electrician', 'plumber', 'mason', 'carpenter', 'painter', 'tiler', 'welder', 'mechanic', 'cleaner', 'tailor', 'hairdresser', 'phone_repair'];
export const CATEGORIES = TRADES.map(value => ({ value, get label() { return t(`trade.${value}`); } }));

// The pilot areas: edited in shared/areas.js, one list for the server and the app.
export { AREAS };

const labelFrom = list => value => list.find(o => o.value === value)?.label ?? value;
export const categoryLabel = labelFrom(CATEGORIES);
export const areaLabel = labelFrom(AREAS);

// What each job status means to the person looking at it (i18n "status.*").
const STATUSES = ['open', 'quote_accepted', 'escrow_held', 'in_progress', 'awaiting_confirmation', 'completed', 'disputed', 'resolved'];
export const statusLabel = (status, role) => (STATUSES.includes(status) ? t(`status.${status}.${role}`) : status);

// Where the escrowed money is, in words, when that is worth showing (i18n "escrow.*").
const ESCROW_WORDS = ['funding', 'releasing', 'released', 'refunding', 'refunded'];
export const escrowLabel = (escrow, role) => (ESCROW_WORDS.includes(escrow?.status) ? t(`escrow.${escrow.status}.${role}`) : null);

// My jobs / My work: jobs grouped by where they are (layout only; the job's
// status decides the group). Workers are only on a job once chosen, so they
// have no "Waiting for offers" group.
export const JOB_GROUPS = [
  { key: 'waiting', statuses: ['open'], roles: ['client'] },
  { key: 'active', statuses: ['quote_accepted', 'escrow_held', 'in_progress'], roles: ['client', 'worker'] },
  { key: 'confirm', statuses: ['awaiting_confirmation'], roles: ['client', 'worker'] },
  { key: 'completed', statuses: ['completed'], roles: ['client', 'worker'] },
  { key: 'disputed', statuses: ['disputed', 'resolved'], roles: ['client', 'worker'] }
].map(g => ({ ...g, get label() { return t(`group.${g.key}`); } }));

// The short status chip on a job card: its words and tone (action = this
// person has something to do; wait, done, problem). Words: i18n "chip.*".
const CHIP_TONES = {
  open: { client: 'wait' },
  quote_accepted: { client: 'action', worker: 'wait' },
  escrow_held: { client: 'wait', worker: 'action' },
  in_progress: { client: 'wait', worker: 'action' },
  awaiting_confirmation: { client: 'action', worker: 'wait' },
  completed: { client: 'done', worker: 'done' },
  disputed: { client: 'problem', worker: 'problem' },
  resolved: { client: 'wait', worker: 'wait' }
};

export function statusChip(job, role) {
  if (job.escrow?.pending?.kind === 'fund') return { label: t('chip.paymentPending'), tone: 'wait' };
  if (job.status === 'open' && role === 'client' && job.responseCount > 0) {
    return { label: tn('chip.offers', job.responseCount), tone: 'action' };
  }
  const tone = CHIP_TONES[job.status]?.[role];
  return tone ? { label: t(`chip.${job.status}.${role}`), tone } : { label: job.status, tone: 'wait' };
}

// Where the money is, in one or two words, once a worker is chosen. Jobs
// finished before escrow existed (no escrow record) show nothing. Words: i18n "money.*".
const MONEY = ['funding', 'held', 'releasing', 'released', 'refunding', 'refunded'];

export function moneyLabel(job, role) {
  const status = job.escrow?.status;
  if (MONEY.includes(status)) return t(`money.${status}.${role}`);
  if (job.status === 'quote_accepted') return t('money.notPaid');
  return null;
}
