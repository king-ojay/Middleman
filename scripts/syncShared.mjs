// Copies shared/areas.js into the two folders that are deployed on their own:
// server/ (Render, rootDir: server) and client/ (Vercel, Root Directory:
// client). Neither host lets a build or the running app read files outside
// its folder, so each gets a committed copy. Edit shared/areas.js only, then:
//
//   npm run sync:shared
//
// server/test/area.api.test.js fails if a copy no longer matches.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export const SOURCE = 'shared/areas.js';
export const COPIES = ['server/config/areas.shared.js', 'client/src/areas.shared.js'];

export const generated = source =>
  `// GENERATED from ${SOURCE} by \`npm run sync:shared\`. Do not edit here:\n// edit ${SOURCE} and run the sync.\n\n${source}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const content = generated(readFileSync(new URL(SOURCE, root), 'utf8'));
  for (const copy of COPIES) {
    writeFileSync(new URL(copy, root), content);
    console.log(`wrote ${copy}`);
  }
}
