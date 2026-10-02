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
