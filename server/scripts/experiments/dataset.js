// Public signed-network datasets for Part A (CLAUDE.md, "Evaluation design").
// Real data only: nothing here generates or simulates ratings.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// Kumar, Spezzano, Subrahmanian & Faloutsos (2016), Table IV: unsupervised
// leave-one-out results as [RMSE, PCC]. Their supervised Table V is not
// comparable and is deliberately left out.
const TABLE_IV_OTC = {
  Reciprocal: [0.32, 0.46],
  PageRank: [0.37, 0.07],
  'Signed-HITS': [0.37, 0.34],
  'Bias&Deserve': [0.36, 0.32],
  TidalTrust: [0.39, 0.38],
  EigenTrust: [0.37, 0.01],
  MDS: [0.35, 0.41],
  Goodness: [0.32, 0.48],
  FxG: [0.31, 0.49]
};

// SNAP files: SOURCE,TARGET,RATING,TIME, no header. md5 and lines describe the
// uncompressed CSV, whichever form is on disk.
export const DATASETS = {
  bitcoinotc: {
    name: 'Bitcoin OTC',
    file: 'soc-sign-bitcoinotc.csv',
    url: 'https://snap.stanford.edu/data/soc-sign-bitcoinotc.csv.gz',
    md5: 'eeaf5cd1d29ab435505baeeb6816317b',
    lines: 35592,
    paper: TABLE_IV_OTC
  },
  bitcoinalpha: {
    name: 'Bitcoin Alpha',
    file: 'soc-sign-bitcoinalpha.csv',
    url: 'https://snap.stanford.edu/data/soc-sign-bitcoinalpha.csv.gz',
    md5: null, // not recorded yet: the first run logs it
    lines: 24186,
    paper: { FxG: [0.27, 0.41] }
  }
};

/** The dataset file in `dir`: the CSV, or the CSV gzipped. Null if neither exists. */
export function findDatasetFile(dir, config) {
  for (const name of [config.file, `${config.file}.gz`]) {
    const file = path.join(dir, name);
    if (existsSync(file)) return file;
  }
  return null;
}

export function downloadInstructions(dir, config) {
  return [
    `${config.name} not found in ${dir}`,
    `Expected ${config.file} (or ${config.file}.gz). Download it from SNAP:`,
    `  mkdir -p ${dir}`,
    `  curl -L -o ${path.join(dir, `${config.file}.gz`)} ${config.url}`,
    'The .gz file can be used as it is, or unpacked with gunzip. data/raw/ is gitignored: never commit it.'
  ].join('\n');
}

/** Reads the file (gunzipping .gz) and returns the CSV text with its MD5 and line count. */
export function readDataset(file) {
  const raw = readFileSync(file);
  const buffer = file.endsWith('.gz') ? gunzipSync(raw) : raw;
  const text = buffer.toString('utf8');
  return {
    text,
    md5: createHash('md5').update(buffer).digest('hex'),
    lines: text.split('\n').filter(line => line.trim() !== '').length
  };
}

/**
 * Parses SOURCE,TARGET,RATING,TIME rows into { source, target, rating, time }.
 * Ids stay strings (computeTrust compares ids as strings). Throws on any
 * malformed row rather than skipping it, so a bad download can't go unnoticed.
 */
export function parseRatings(text) {
  const edges = [];
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    const fields = line.trim().split(',');
    const [source, target, rating, time] = fields;
    const r = Number(rating);
    if (fields.length !== 4 || !/^\d+$/.test(source) || !/^\d+$/.test(target) || !Number.isInteger(r) || r < -10 || r > 10) {
      throw new Error(`Line ${i + 1} is not SOURCE,TARGET,RATING,TIME with a rating from -10 to 10: "${line.slice(0, 80)}"`);
    }
    edges.push({ source, target, rating: r, time: Number(time) });
  });
  return edges;
}

/** Facts worth logging before a run: members, sign split, self-loops, duplicate pairs. */
export function describeRatings(edges) {
  const members = new Set();
  const pairs = new Set();
  let positive = 0, selfLoops = 0, duplicates = 0;
  for (const e of edges) {
    members.add(e.source);
    members.add(e.target);
    if (e.rating > 0) positive += 1;
    if (e.source === e.target) selfLoops += 1;
    const key = `${e.source}>${e.target}`;
    if (pairs.has(key)) duplicates += 1;
    pairs.add(key);
  }
  return { edges: edges.length, members: members.size, positive, negative: edges.length - positive, selfLoops, duplicates };
}
