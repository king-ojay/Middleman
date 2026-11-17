// Writes docs/translation-review.csv for a native speaker to check the
// Kinyarwanda draft: key, English, Kinyarwanda draft, reviewer comment. The
// comment column is empty except for keys the drafter was unsure of
// ("CHECK: why", from rw.js CHECK). Run after changing en.js or rw.js:
//   node client/scripts/translationReview.mjs
import { writeFileSync } from 'node:fs';
import en from '../src/i18n/en.js';
import rw, { CHECK } from '../src/i18n/rw.js';

const cell = value => `"${String(value).replaceAll('"', '""')}"`;
const rows = [['key', 'English', 'Kinyarwanda draft', 'reviewer comment']];
for (const key of Object.keys(en)) rows.push([key, en[key], rw[key], CHECK[key] ? `CHECK: ${CHECK[key]}` : '']);

const out = new URL('../../docs/translation-review.csv', import.meta.url);
writeFileSync(out, `${rows.map(r => r.map(cell).join(',')).join('\r\n')}\r\n`);
console.log(`${rows.length - 1} strings, ${Object.keys(CHECK).length} marked CHECK -> docs/translation-review.csv`);
