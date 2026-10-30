// The Kigali neighbourhoods the pilot covers: the one list for the server
// (model enums, validation) and the app (pickers, labels). Adding an area
// means adding it here. Plain data only, so Node and Vite can both import it.
export const AREAS = Object.freeze([
  { value: 'kimironko', label: 'Kimironko' },
  { value: 'kwa_nayinzira', label: 'Kwa Nayinzira' },
  { value: 'remera', label: 'Remera' },
  { value: 'gikondo', label: 'Gikondo' }
]);

export const AREA_VALUES = Object.freeze(AREAS.map(a => a.value));
