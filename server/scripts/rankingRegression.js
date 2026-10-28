// Ranking regression: every user's ranking of every trade's workers, from the
// old trust engine (a git ref) and the current one, against the same seeded
// database. Positive-only rankings must stay identical: same order, same tiers,
// same scores. With the seed data that is 25 users x 12 trades = 300 rankings.
//
// Read-only. Run against a seeded database, never production:
//   MONGO_URI=mongodb://127.0.0.1:27017/middleman_regression node seed.js
//   MONGO_URI=mongodb://127.0.0.1:27017/middleman_regression node scripts/rankingRegression.js [old-ref]
//
// old-ref defaults to 25e74d3, the last main commit before computeTrust and
// negative evidence (the engine as it was on main before PR #1).
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { getMongoUri } from '../config/db.js';
import { CATEGORIES } from '../config/categories.js';
import User from '../modules/users/user.model.js';
import * as current from '../modules/trust/trustPropagation.js';

const OLD_REF = process.argv[2] || '25e74d3';
const TOLERANCE = 1e-12;
const here = path.dirname(fileURLToPath(import.meta.url));
const trustDir = path.resolve(here, '../modules/trust');

// The old engine, as committed at OLD_REF, written to a temp file with its
// relative imports pointed back at this checkout (models are unchanged).
async function loadOldEngine(dir) {
  const source = execFileSync('git', ['show', `${OLD_REF}:server/modules/trust/trustPropagation.js`], { cwd: here, encoding: 'utf8' });
  const file = path.join(dir, 'trustPropagation.old.js');
  writeFileSync(file, source.replace(/from '\.\/([^']+)'/g, (_, rel) => `from '${pathToFileURL(path.join(trustDir, rel)).href}'`));
  return import(pathToFileURL(file).href);
}

const describe = ranked => ranked.map(w => `${w.name} [${w.trustSource} ${w.trustScore.toFixed(4)}]`).join(', ');

function differs(a, b) {
  if (a.length !== b.length) return true;
  return a.some((w, i) =>
    String(w._id) !== String(b[i]._id) ||
    w.trustSource !== b[i].trustSource ||
    Math.abs(w.trustScore - b[i].trustScore) > TOLERANCE
  );
}

async function main() {
  const { uri, description } = getMongoUri();
  console.log(`Database: ${description}`);
  console.log(`Old engine: ${OLD_REF}:server/modules/trust/trustPropagation.js`);
  console.log('New engine: working tree\n');

  const dir = mkdtempSync(path.join(tmpdir(), 'middleman-regression-'));
  try {
    const old = await loadOldEngine(dir);
    await mongoose.connect(uri);

    const viewers = await User.find().sort({ phone: 1 }).lean();
    let total = 0;
    let empty = 0;
    const mismatches = [];

    for (const viewer of viewers) {
      for (const category of CATEGORIES) {
        // Same candidate query as GET /api/discover with "All areas".
        const candidates = await User.find({ role: 'worker', skills: category }).lean();
        const before = await old.rankByTrust(viewer._id, candidates);
        const after = await current.rankByTrust(viewer._id, candidates);
        total += 1;
        if (candidates.length === 0) empty += 1;
        if (differs(before, after)) mismatches.push({ viewer: viewer.name, category, before, after });
      }
    }

    console.log(`${viewers.length} users x ${CATEGORIES.length} trades = ${total} rankings (${empty} with no workers)`);
    for (const m of mismatches) {
      console.log(`\nDIFFERENT: ${m.viewer} / ${m.category}`);
      console.log(`  old: ${describe(m.before)}`);
      console.log(`  new: ${describe(m.after)}`);
    }
    console.log(`\n${total - mismatches.length} identical, ${mismatches.length} different`);
    process.exitCode = mismatches.length === 0 ? 0 : 1;
  } finally {
    await mongoose.disconnect();
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('Regression failed:', err.message);
  process.exit(1);
});
