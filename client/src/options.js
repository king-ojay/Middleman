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
