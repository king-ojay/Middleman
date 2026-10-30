// The pilot's areas. The list is edited in shared/areas.js only; this folder
// gets a generated copy (areas.shared.js, `npm run sync:shared`) because the
// API is deployed from server/ alone and can't read files outside it. The
// User and Job model enums and request validation use this.
export { AREA_VALUES as AREAS } from './areas.shared.js';
