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
  quote_accepted: { client: 'Worker chosen — waiting for them to start', worker: 'You were chosen — start when ready' },
  escrow_held: { client: 'Payment held — worker can start', worker: 'Payment held — you can start' },
  in_progress: { client: 'In progress', worker: 'In progress' },
  awaiting_confirmation: { client: 'Worker says it is done — please confirm', worker: 'Waiting for the client to confirm' },
  completed: { client: 'Completed', worker: 'Completed' },
  disputed: { client: 'Problem reported', worker: 'Problem reported' }
};

export const statusLabel = (status, role) => STATUS_LABELS[status]?.[role] ?? status;
