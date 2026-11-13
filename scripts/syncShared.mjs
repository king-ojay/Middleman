// Copies each file in shared/ into the two folders that are deployed on their
// own: server/ (Render, rootDir: server) and client/ (Vercel, Root Directory:
// client). Neither host lets a build or the running app read files outside
// its folder, so each gets a committed copy. Edit the file in shared/ only,
// then:
//
//   npm run sync:shared
//
// server/test/area.api.test.js and dispute.api.test.js fail if a copy no
// longer matches.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export const SHARED = [
  { source: 'shared/areas.js', copies: ['server/config/areas.shared.js', 'client/src/areas.shared.js'] },
  { source: 'shared/disputeReasons.js', copies: ['server/config/disputeReasons.shared.js', 'client/src/disputeReasons.shared.js'] }
];
// The areas file, as the area tests name it.
export const { source: SOURCE, copies: COPIES } = SHARED[0];

export const generated = (source, from = SOURCE) =>
  `// GENERATED from ${from} by \`npm run sync:shared\`. Do not edit here:\n// edit ${from} and run the sync.\n\n${source}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const { source, copies } of SHARED) {
    const content = generated(readFileSync(new URL(source, root), 'utf8'), source);
    for (const copy of copies) {
      writeFileSync(new URL(copy, root), content);
      console.log(`wrote ${copy}`);
    }
  }
}
