// Dropdown options and display labels. Values must match the server's
// config/areas.js and config/categories.js.
export const CATEGORIES = [
  { value: 'electrician', label: 'Electrician' },
  { value: 'plumber', label: 'Plumber' },
  { value: 'mason', label: 'Mason' },
  { value: 'carpenter', label: 'Carpenter' },
  { value: 'painter', label: 'Painter' },
  { value: 'tiler', label: 'Tiler' },
  { value: 'welder', label: 'Welder' },
  { value: 'mechanic', label: 'Mechanic' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'tailor', label: 'Tailor' },
  { value: 'hairdresser', label: 'Hairdresser' },
  { value: 'phone_repair', label: 'Phone repair' }
];

export const AREAS = [
  { value: 'kimironko', label: 'Kimironko' },
  { value: 'kwa_nayinzira', label: 'Kwa Nayinzira' },
  { value: 'remera', label: 'Remera' },
  { value: 'gikondo', label: 'Gikondo' }
];

const labelFrom = list => value => list.find(o => o.value === value)?.label ?? value;
export const categoryLabel = labelFrom(CATEGORIES);
export const areaLabel = labelFrom(AREAS);

// What each job status means to the person looking at it.
const STATUS_LABELS = {
  open: { client: 'Waiting for workers to respond', worker: 'Open' },
  quote_accepted: { client: 'Worker chosen — pay into escrow so they can start', worker: 'You were chosen — waiting for the client to pay into escrow' },
  escrow_held: { client: 'Payment held in escrow — worker can start', worker: 'Payment held in escrow — you can start' },
  in_progress: { client: 'In progress', worker: 'In progress' },
  awaiting_confirmation: { client: 'Worker says it is done — please confirm', worker: 'Waiting for the client to confirm' },
  completed: { client: 'Completed', worker: 'Completed' },
  disputed: { client: 'Problem reported — payment locked until it is reviewed', worker: 'Problem reported — payment locked until it is reviewed' },
  resolved: { client: 'Problem resolved', worker: 'Problem resolved' }
};

export const statusLabel = (status, role) => STATUS_LABELS[status]?.[role] ?? status;

// Where the escrowed money is, in words, when that is worth showing.
const ESCROW_LABELS = {
  funding: { client: 'Waiting for you to approve the payment', worker: 'Waiting for the client to approve the payment' },
  releasing: { client: 'Paying the worker…', worker: 'Payment to you is on its way' },
  released: { client: 'Paid to the worker', worker: 'Paid to you' },
  refunding: { client: 'Refund on its way', worker: 'Refunding the client' },
  refunded: { client: 'Refunded to you', worker: 'Refunded to the client' }
};

export const escrowLabel = (escrow, role) => ESCROW_LABELS[escrow?.status]?.[role] ?? null;

// My jobs / My work: jobs grouped by where they are (layout only; the job's
// status decides the group). Workers are only on a job once chosen, so they
// have no "Waiting for offers" group.
export const JOB_GROUPS = [
  { key: 'waiting', label: 'Waiting for offers', statuses: ['open'], roles: ['client'] },
  { key: 'active', label: 'Active', statuses: ['quote_accepted', 'escrow_held', 'in_progress'], roles: ['client', 'worker'] },
  { key: 'confirm', label: 'Awaiting confirmation', statuses: ['awaiting_confirmation'], roles: ['client', 'worker'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'], roles: ['client', 'worker'] },
  { key: 'disputed', label: 'Disputed', statuses: ['disputed', 'resolved'], roles: ['client', 'worker'] }
];

// The short status chip on a job card: its words and tone (action = this
// person has something to do; wait, done, problem).
const STATUS_CHIPS = {
  open: { client: ['Waiting for offers', 'wait'] },
  quote_accepted: { client: ['Pay to start', 'action'], worker: ['Waiting for payment', 'wait'] },
  escrow_held: { client: ['Ready to start', 'wait'], worker: ['Ready to start', 'action'] },
  in_progress: { client: ['In progress', 'wait'], worker: ['In progress', 'action'] },
  awaiting_confirmation: { client: ['Check the work', 'action'], worker: ['Waiting for client', 'wait'] },
  completed: { client: ['Completed', 'done'], worker: ['Completed', 'done'] },
  disputed: { client: ['Problem reported', 'problem'], worker: ['Problem reported', 'problem'] },
  resolved: { client: ['Resolved', 'wait'], worker: ['Resolved', 'wait'] }
};

export function statusChip(job, role) {
  if (job.escrow?.pending?.kind === 'fund') return { label: 'Payment pending', tone: 'wait' };
  if (job.status === 'open' && role === 'client' && job.responseCount > 0) {
    return { label: `${job.responseCount} offer${job.responseCount === 1 ? '' : 's'}`, tone: 'action' };
  }
  const [label, tone] = STATUS_CHIPS[job.status]?.[role] ?? [job.status, 'wait'];
  return { label, tone };
}

// Where the money is, in one or two words, once a worker is chosen. Jobs
// finished before escrow existed (no escrow record) show nothing.
const MONEY = {
  funding: { client: 'Payment pending', worker: 'Payment pending' },
  held: { client: 'Paid · in escrow', worker: 'In escrow' },
  releasing: { client: 'Releasing to worker', worker: 'On its way to you' },
  released: { client: 'Released to worker', worker: 'Released · paid to you' },
  refunding: { client: 'Refund on its way', worker: 'Refunding the client' },
  refunded: { client: 'Refunded to you', worker: 'Refunded to the client' }
};

export function moneyLabel(job, role) {
  const status = job.escrow?.status;
  if (MONEY[status]) return MONEY[status][role];
  if (job.status === 'quote_accepted') return 'Not paid yet';
  return null;
}
