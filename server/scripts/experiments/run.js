// Part A: the proposed trust model against baselines on public signed
// networks, with the leave-one-out protocol of Kumar et al. (2016).
//
//   node scripts/experiments/run.js --dataset bitcoinotc|bitcoinalpha [--sample N --seed S --tune-split --reciprocal]
//
// --tune-split: tune lambda and depth (and a linear calibration) on a seeded
// 20% of the test edges and report every method on the other 80% as well.
// --reciprocal: add "proposed + reciprocal" (off by default; OTC-specific).
//
// Reads data/raw/<file>.csv or .csv.gz (gitignored; see dataset.js for the
// download). Writes results/<dataset>_<timestamp>.json and .csv with
// aggregate metrics only, never the ratings themselves.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULTS } from '../../modules/trust/computeTrust.js';
import { DATASETS, describeRatings, downloadInstructions, findDatasetFile, parseRatings, readDataset } from './dataset.js';
import {
  DEPTHS, LAMBDAS, MAIN, METHOD_LABELS, MOLETRUST, COLD_START,
  TUNE_GRID, TUNE_SHARE, heldOut, makeCases, methodPredictions, predictAll, summarize, sweeps
} from './experiment.js';
import { buildRatingGraph, NO_EVIDENCE } from './methods.js';
import { shuffledIndices } from './metrics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const DATA_DIR = path.join(ROOT, 'data/raw');
const RESULTS_DIR = path.join(ROOT, 'results');

function parseArgs(argv) {
  const args = { seed: 1, tuneSplit: false, reciprocal: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dataset') args.dataset = argv[++i];
    else if (a === '--sample') args.sample = Number(argv[++i]);
    else if (a === '--seed') args.seed = Number(argv[++i]);
    else if (a === '--tune-split') args.tuneSplit = true;
    else if (a === '--reciprocal') args.reciprocal = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if (!DATASETS[args.dataset]) throw new Error(`--dataset must be one of: ${Object.keys(DATASETS).join(', ')}`);
  if (args.sample !== undefined && !(Number.isInteger(args.sample) && args.sample > 0)) throw new Error('--sample must be a positive whole number');
  if (!Number.isInteger(args.seed)) throw new Error('--seed must be a whole number');
  return args;
}

function gitCommit() {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'server'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
    return { commit, dirty, codeHash: codeHash() };
  } catch {
    return { commit: 'unknown', dirty: null, codeHash: codeHash() };
  }
}

// SHA-256 over the engine and the experiment code, so a result can be tied to
// the exact code even when it ran before that code was committed.
function codeHash() {
  const files = ['../../modules/trust/computeTrust.js', 'dataset.js', 'methods.js', 'metrics.js', 'experiment.js', 'run.js'];
  const hash = createHash('sha256');
  for (const file of files) hash.update(readFileSync(path.join(here, file)));
  return hash.digest('hex').slice(0, 16);
}

const f = (x, digits = 3) => (x === null || x === undefined || Number.isNaN(x) ? 'n/a' : x.toFixed(digits));
const pct = x => (x === null || x === undefined ? 'n/a' : `${(x * 100).toFixed(1)}%`);

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = cells => cells.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
  return [line(headers), widths.map(w => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = DATASETS[args.dataset];
  const file = findDatasetFile(DATA_DIR, config);
  if (!file) {
    console.error(downloadInstructions(DATA_DIR, config));
    process.exit(2);
  }

  const startedAt = new Date();
  const { text, md5, lines } = readDataset(file);
  const edges = parseRatings(text);
  const facts = describeRatings(edges);
  const git = gitCommit();

  console.log(`Dataset:   ${config.name} (${path.relative(ROOT, file)})`);
  console.log(`MD5:       ${md5}${config.md5 ? (md5 === config.md5 ? '  (matches expected)' : `  WARNING: expected ${config.md5}`) : '  (no expected value recorded)'}`);
  console.log(`Lines:     ${lines.toLocaleString('en-US')}${lines === config.lines ? '  (matches expected)' : `  WARNING: expected ${config.lines.toLocaleString('en-US')}`}`);
  console.log(`Members:   ${facts.members.toLocaleString('en-US')}; ratings ${facts.positive.toLocaleString('en-US')} positive, ${facts.negative.toLocaleString('en-US')} negative (<= 0); self-loops ${facts.selfLoops}; duplicate pairs ${facts.duplicates}`);
  console.log(`Git:       ${git.commit}${git.dirty ? ' (plus uncommitted changes in server/)' : ''}; code hash ${git.codeHash}`);
  console.log(`Node:      ${process.version}`);
  console.log('');
  console.log('Graph: weight = rating/10; rating > 0 -> positive evidence rating/10; rating <= 0 -> negative evidence |rating|/10; one node type.');
  console.log('Off for this data (it has no roles, areas, referrals or verification):');
  console.log('  referral boost: OFF (no referral edges; every edge unreferred)');
  console.log('  area trust:     OFF (no areas)');
  console.log(`  verification:   OFF (everyone unverified; with no evidence computeTrust returns the floor ${NO_EVIDENCE})`);
  console.log(`Proposed model: computeTrust unchanged (decay ${DEFAULTS.decay}, negativeDepth ${DEFAULTS.negativeDepth}); prediction = clamp(positive - lambda x negative, -1, 1).`);
  if (facts.duplicates > 0 || facts.selfLoops > 0) console.log('WARNING: duplicate pairs or self-loops found; leave-one-out hides only the first copy of a pair.');

  // Test cases: every edge, or a seeded sample.
  const order = shuffledIndices(edges.length, args.seed);
  const chosen = args.sample ? order.slice(0, Math.min(args.sample, edges.length)) : edges.map((_, i) => i);
  const cases = makeCases(edges, chosen);
  console.log(`\nTest edges: ${cases.length.toLocaleString('en-US')}${args.sample ? ` (seeded sample, seed ${args.seed})` : ' (all edges)'}`);

  const graph = buildRatingGraph(edges);
  const t0 = Date.now();
  let lastShown = -1;
  const predictions = predictAll(graph, cases, {
    onProgress(done, total) {
      const tenth = Math.floor((done / total) * 10);
      if (tenth > lastShown) {
        lastShown = tenth;
        process.stderr.write(`  ${done}/${total} (${tenth * 10}%) ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
      }
    }
  });
  const predictSeconds = (Date.now() - t0) / 1000;

  // Every row on every test edge. With --tune-split, also the held-out
  // table: settings and calibration from the 20% tuning share, every method
  // reported on the other 80% only.
  const methods = methodPredictions(predictions);
  if (!args.reciprocal) delete methods.reciprocal; // off by default
  const allIdx = cases.map((_, i) => i);
  const results = Object.fromEntries(Object.entries(methods).map(([k, m]) => [k, summarize(cases, m, allIdx)]));
  const sweep = sweeps(cases, predictions, allIdx);
  let held = null, heldResults = null;
  if (args.tuneSplit) {
    held = heldOut(cases, predictions, args.seed + 1);
    Object.assign(METHOD_LABELS, held.labels);
    heldResults = Object.fromEntries(Object.entries({ ...methods, ...held.methods }).map(([k, m]) => [k, summarize(cases, m, held.reportIdx)]));
  }
  const runtimeSeconds = (Date.now() - startedAt.getTime()) / 1000;

  // Console report
  const label = k => METHOD_LABELS[k];
  console.log(`\nResults on all ${cases.length.toLocaleString('en-US')} test edges\n`);
  console.log(table(
    ['Method', 'RMSE', 'PCC', 'MAE', 'Sign acc', 'Sign acc (neg)', 'Coverage', 'RMSE covered', 'PCC covered'],
    Object.entries(results).map(([k, r]) => [label(k), f(r.rmse), f(r.pcc), f(r.mae), pct(r.signAccuracy), pct(r.negativeSignAccuracy), pct(r.coverage), f(r.coveredOnly.rmse), f(r.coveredOnly.pcc)])
  ));
  console.log('\nCoverage = predicted from the method\'s own evidence (path methods: a path; flat average: the target has other ratings).');
  console.log('Fallbacks: (b)-(d) the global average; (e)/(f) the floor computeTrust returns with no evidence; (g) the target\'s average');
  console.log('of its other ratings (community reputation, the OTC analogue of Middleman\'s area-trust tier), else the global average.');
  console.log('(a) has PCC -1 by construction: leave-one-out makes it (sum - r)/(n - 1), which falls as the hidden rating r rises.');
  if (args.reciprocal) {
    console.log('(h) uses the target\'s own rating of the source when there is one (as Kumar et al.\'s Reciprocal baseline), else (g).');
    console.log('    NOTE: this suits Bitcoin OTC, where most ratings are mutual. It does not apply to Middleman, which ranks strangers');
    console.log('    for a client who has never dealt with them; it is shown for comparison only and is off by default (--reciprocal).');
  }

  const p5 = Object.values(results)[0].precisionAt5, p10 = Object.values(results)[0].precisionAt10;
  console.log(`\nRanking and cold start. precision@k over sources with >= k test edges (k=5: ${p5.sources} sources, base rate ${pct(p5.baseRate)}; k=10: ${p10.sources}, base rate ${pct(p10.baseRate)}).`);
  console.log(`Cold start = targets with ${COLD_START.min}-${COLD_START.max} ratings in the whole dataset (${Object.values(results)[0].coldStart.n} test edges).\n`);
  console.log(table(
    ['Method', 'P@5', 'P@10', 'Cold RMSE', 'Cold PCC', 'Cold MAE', 'Cold coverage', 'Latency median ms', 'p95 ms'],
    Object.entries(results).map(([k, r]) => [label(k), pct(r.precisionAt5.precision), pct(r.precisionAt10.precision), f(r.coldStart.rmse), f(r.coldStart.pcc), f(r.coldStart.mae), pct(r.coldStart.coverage), f(r.latencyMs?.median, 4), f(r.latencyMs?.p95, 4)])
  ));

  // One table: every method, RMSE, PCC, coverage, and Table IV beside them.
  const comparison = rows => {
    const theirs = Object.entries(config.paper).map(([name, [rmse, pcc]]) => [`paper: ${name}`, rmse.toFixed(2), pcc.toFixed(2), '']);
    const ours = Object.entries(rows).map(([k, r]) => [`ours: ${label(k)}`, f(r.rmse, 3), f(r.pcc, 3), pct(r.coverage)]);
    return table(['Method', 'RMSE', 'PCC', 'Coverage'], [...theirs, ...ours]);
  };
  console.log(`\nAgainst Kumar et al. (2016) Table IV, unsupervised leave-one-out, ${config.name}; all ${cases.length.toLocaleString('en-US')} test edges (theirs to 2 decimals):\n`);
  console.log(comparison(results));

  console.log(`\nSweeps (proposed model; lambda at depth ${MAIN.depth}, depth at lambda ${MAIN.lambda}; negativeDepth stays ${DEFAULTS.negativeDepth}):\n`);
  const sweepRow = r => [`lambda ${r.lambda}, depth ${r.depth}`, f(r.rmse), f(r.pcc), f(r.mae), pct(r.signAccuracy), pct(r.negativeSignAccuracy), pct(r.coverage), f(r.latencyMs?.median, 4)];
  const sweepHeaders = ['Setting', 'RMSE', 'PCC', 'MAE', 'Sign acc', 'Sign acc (neg)', 'Coverage', 'Latency median ms'];
  console.log(table(sweepHeaders, sweep.lambda.map(sweepRow)));
  console.log('');
  console.log(table(sweepHeaders, sweep.depth.map(sweepRow)));

  if (held) {
    const { tunedFloor, tunedCommunity, calibration } = held;
    console.log(`\nHeld-out evaluation (--tune-split, seed ${args.seed + 1}): tuned on ${held.tuneIdx.length.toLocaleString('en-US')} edges (20%), reported on the other ${held.reportIdx.length.toLocaleString('en-US')} (80%), never used for tuning.`);
    console.log(`Grid: lambda {${TUNE_GRID.lambdas.join(', ')}} x depth {${TUNE_GRID.depths.join(', ')}}, best RMSE on the 20%.`);
    console.log(`  Chosen for (e*) proposed:                    lambda ${tunedFloor.lambda}, depth ${tunedFloor.depth} (RMSE on the 20%: ${f(tunedFloor.rmse)})`);
    console.log(`  Chosen for (g*) proposed + community fallback: lambda ${tunedCommunity.lambda}, depth ${tunedCommunity.depth} (RMSE on the 20%: ${f(tunedCommunity.rmse)})`);
    console.log(`  Calibration for (g*c), fitted on the 20% (${calibration.n} covered edges): truth ~ ${f(calibration.a, 4)} + ${f(calibration.b, 4)} x score, applied to covered edges only\n`);
    const side = [
      ['proposed', MAIN.lambda, MAIN.depth], ['tuned', tunedFloor.lambda, tunedFloor.depth],
      ['community', MAIN.lambda, MAIN.depth], ['communityTuned', tunedCommunity.lambda, tunedCommunity.depth],
      ['communityCalibrated', tunedCommunity.lambda, tunedCommunity.depth]
    ];
    console.log('Default and tuned settings side by side, on the held-out 80%:\n');
    console.log(table(['Method', 'lambda', 'depth', 'RMSE', 'PCC', 'MAE', 'Coverage'],
      side.map(([k, lambda, depth]) => [label(k), lambda, depth, f(heldResults[k].rmse), f(heldResults[k].pcc), f(heldResults[k].mae), pct(heldResults[k].coverage)])));
    console.log(`\nAgainst Kumar et al. (2016) Table IV; held-out 80% (${held.reportIdx.length.toLocaleString('en-US')} edges):\n`);
    console.log(comparison(heldResults));
  }

  console.log(`\nPrediction time ${predictSeconds.toFixed(1)}s; total runtime ${runtimeSeconds.toFixed(1)}s.`);

  // Files
  mkdirSync(RESULTS_DIR, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const base = path.join(RESULTS_DIR, `${args.dataset}_${stamp}`);
  const withLabels = rows => Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { label: label(k), ...r }]));
  const record = {
    dataset: { key: args.dataset, name: config.name, file: path.relative(ROOT, file), md5, expectedMd5: config.md5, lines, expectedLines: config.lines, ...facts },
    run: { startedAt: startedAt.toISOString(), runtimeSeconds, predictSeconds, git, node: process.version, args, testEdges: cases.length },
    settings: {
      graph: 'weight = rating/10; rating > 0 positive evidence rating/10; rating <= 0 negative evidence |rating|/10; one node type',
      off: { referralBoost: 'no referral edges', areaTrust: 'no areas', verification: 'everyone unverified' },
      computeTrust: { ...DEFAULTS },
      prediction: 'clamp(positive - lambda * negative, -1, 1); no evidence -> floorUnverified',
      main: MAIN, lambdas: LAMBDAS, depths: DEPTHS, moleTrust: MOLETRUST, coldStart: COLD_START,
      fallbacks: {
        flat: 'global average', moletrust: 'global average', tidaltrust: 'global average', proposed: `floor ${NO_EVIDENCE}`,
        community: "target's average of its other ratings, else global average",
        reciprocal: "target's rating of the source, else proposed + community fallback"
      }
    },
    methods: withLabels(results),
    sweeps: sweep,
    heldOut: held && {
      seed: args.seed + 1, share: TUNE_SHARE, grid: TUNE_GRID, tuneEdges: held.tuneIdx.length, reportEdges: held.reportIdx.length,
      tunedFloor: held.tunedFloor, tunedCommunity: held.tunedCommunity, calibration: held.calibration,
      methods: withLabels(heldResults)
    },
    paperTableIV: config.paper
  };
  writeFileSync(`${base}.json`, `${JSON.stringify(record, null, 2)}\n`);

  const csvHeaders = ['section', 'method', 'lambda', 'depth', 'n', 'rmse', 'pcc', 'mae', 'sign_accuracy', 'negative_sign_accuracy', 'coverage',
    'rmse_covered', 'pcc_covered', 'precision_at_5', 'precision_at_10', 'cold_n', 'cold_rmse', 'cold_pcc', 'cold_mae', 'cold_coverage',
    'latency_median_ms', 'latency_p95_ms'];
  const num = x => (x === null || x === undefined ? '' : String(x));
  const methodRow = section => ([k, r]) => [section, label(k), '', '', r.n, r.rmse, r.pcc, r.mae, r.signAccuracy, r.negativeSignAccuracy, r.coverage,
    r.coveredOnly.rmse, r.coveredOnly.pcc, r.precisionAt5.precision, r.precisionAt10.precision, r.coldStart.n, r.coldStart.rmse, r.coldStart.pcc,
    r.coldStart.mae, r.coldStart.coverage, r.latencyMs?.median, r.latencyMs?.p95];
  const csvRows = [
    ...Object.entries(results).map(methodRow('method')),
    ...[...sweep.lambda.map(r => ['lambda_sweep', r]), ...sweep.depth.map(r => ['depth_sweep', r])].map(([section, r]) =>
      [section, 'proposed', r.lambda, r.depth, r.n, r.rmse, r.pcc, r.mae, r.signAccuracy, r.negativeSignAccuracy, r.coverage, '', '', '', '', '', '', '', '', '', r.latencyMs?.median, r.latencyMs?.p95]),
    ...(heldResults ? Object.entries(heldResults).map(methodRow('heldout_80')) : []),
    ...Object.entries(config.paper).map(([name, [rmse, pcc]]) => ['paper_table_iv', name, '', '', '', rmse, pcc, ...Array(15).fill('')])
  ];
  const csvCell = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : num(v));
  writeFileSync(`${base}.csv`, `${[csvHeaders, ...csvRows].map(r => r.map(csvCell).join(',')).join('\n')}\n`);
  console.log(`Wrote ${path.relative(ROOT, base)}.json and .csv`);
}

try {
  main();
} catch (err) {
  console.error(`Experiment failed: ${err.message}`);
  process.exit(1);
}
