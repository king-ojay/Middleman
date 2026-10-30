// GENERATED from shared/areas.js by `npm run sync:shared`. Do not edit here:
// edit shared/areas.js and run the sync.

// The Kigali neighbourhoods the pilot covers: the one list for the server
// (model enums, validation) and the app (pickers, labels). Adding an area
// means adding it here, then running `npm run sync:shared`, which copies this
// file into server/ and client/ (each is deployed from its own folder and
// can't read this one). Plain data only, so Node and Vite can both import it.
export const AREAS = Object.freeze([
  { value: 'kimironko', label: 'Kimironko' },
  { value: 'kwa_nayinzira', label: 'Kwa Nayinzira' },
  { value: 'remera', label: 'Remera' },
  { value: 'gikondo', label: 'Gikondo' }
]);

export const AREA_VALUES = Object.freeze(AREAS.map(a => a.value));
