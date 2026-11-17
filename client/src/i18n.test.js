// The two languages (i18n/en.js, rw.js): same keys both ways, same
// placeholders, the choice kept on the device, server errors by code, and the
// trust sentences and dates built in Kinyarwanda without gaps.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// A stand-in for the browser's localStorage, set before i18n loads.
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};

const { default: en } = await import('./i18n/en.js');
const { default: rw, CHECK } = await import('./i18n/rw.js');
const { getLang, loadLang, setLang, t, tn } = await import('./i18n/index.js');
const { errorText } = await import('./i18n/errors.js');
const { reasonSentence, reasonTiles, topLabel } = await import('./trustReason.js');
const { dateTimeLabel, monthLabel, shortDate } = await import('./transactions.js');

const placeholders = text => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();

beforeEach(() => setLang('en'));
afterEach(() => setLang('en'));

test('every English key is in Kinyarwanda and every Kinyarwanda key is in English', () => {
  assert.deepEqual(Object.keys(en).filter(k => !(k in rw)), [], 'missing from rw.js');
  assert.deepEqual(Object.keys(rw).filter(k => !(k in en)), [], 'not in en.js');
});

test('each translation keeps the same placeholders, and none is empty', () => {
  for (const key of Object.keys(en)) {
    assert.deepEqual(placeholders(rw[key]), placeholders(en[key]), key);
    assert.ok(rw[key].trim() || !en[key].trim(), `${key} is empty`);
  }
});

test('every key marked CHECK for the reviewer exists', () => {
  assert.deepEqual(Object.keys(CHECK).filter(k => !(k in en)), []);
});

test('English is the default; the choice is saved and read back, as after a reload', () => {
  store.clear();
  assert.equal(loadLang(), 'en');
  setLang('rw');
  assert.equal(getLang(), 'rw');
  assert.equal(store.get('middleman.lang'), 'rw');
  assert.equal(loadLang(), 'rw', 'a reload starts in Kinyarwanda');
  assert.equal(t('landing.logIn'), 'Injira');
  setLang('xx'); // unknown: ignored
  assert.equal(getLang(), 'rw');
  store.set('middleman.lang', 'xx');
  assert.equal(loadLang(), 'en', 'an unknown saved value falls back to English');
});

test('t fills placeholders, tn picks one or other, and an unknown key comes back as itself', () => {
  assert.equal(t('call.button', { name: 'Eric' }), 'Call Eric');
  assert.equal(tn('chip.offers', 1), '1 offer');
  assert.equal(tn('chip.offers', 3), '3 offers');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLang('rw');
  assert.equal(t('call.button', { name: 'Eric' }), 'Hamagara Eric');
  assert.equal(tn('chip.offers', 3), 'Ibyifuzo 3');
});

test('server errors are translated by code; unknown ones keep the server\'s English', () => {
  const busy = { error: 'This worker is busy right now with 3 jobs in progress. Choose someone else, or try again later.', code: 'worker_busy', params: { limit: 3 } };
  assert.equal(errorText(busy, 409), busy.error);
  assert.equal(errorText({ error: 'That code is wrong. 1 try left.', code: 'code_wrong', params: { left: 1 } }, 400), 'That code is wrong. 1 try left.');
  setLang('rw');
  assert.equal(errorText(busy, 409), 'Uyu mukozi afite akazi 3 kari gukorwa ubu. Hitamo undi, cyangwa ugerageze nyuma.');
  assert.equal(errorText({ error: 'That code is wrong. 2 tries left.', code: 'code_wrong', params: { left: 2 } }, 400), 'Iyo kode si yo. Usigaje amahirwe 2.');
  assert.equal(errorText({ error: 'Something new from the server', code: 'not_a_code' }, 400), 'Something new from the server');
  assert.equal(errorText({ error: 'No code at all' }, 400), 'No code at all');
  assert.equal(errorText(null, 502), 'Ntibyakunze (502)');
});

// Every shape of reason the server sends (server/modules/trust/reason.js).
const REASONS = [
  { tier: 'network', name: 'Eric', hops: [{ type: 'invite' }] },
  { tier: 'network', name: 'Eric', hops: [{ type: 'rating', stars: 5, hired: true, month: '2026-03' }] },
  { tier: 'network', name: 'Eric', hops: [{ type: 'vouch', stars: 4, hired: false }] },
  { tier: 'network', name: 'Eric', via: 'Amina', hops: [{ type: 'invite' }, { type: 'vouch', stars: 5, hired: true }] },
  { tier: 'network', name: 'Eric', hops: [{ type: 'rating', stars: 4 }, { type: 'rating', stars: 5, hired: false }] },
  { tier: 'network', name: 'Eric', via: 'Amina', hops: [{ type: 'rating', stars: 5 }, { type: 'rating', hired: true }, { type: 'vouch', stars: 5 }] },
  { tier: 'network', name: 'Eric', hops: [{ type: 'invite' }, { type: 'invite' }, { type: 'invite' }] },
  { tier: 'area', name: 'Moses', area: 'kimironko', people: 3, minStars: 4 },
  { tier: 'area', name: 'Moses', area: 'kimironko', people: 1, minStars: 5 },
  { tier: 'new', verified: true, rated: true, joined: '2026-10' },
  { tier: 'new', verified: false, rated: false }
];

test('in Kinyarwanda every reason sentence and tile is filled in, with the names and numbers', () => {
  setLang('rw');
  const now = new Date(2026, 10, 17);
  for (const reason of REASONS) {
    const sentence = reasonSentence(reason, now);
    assert.doesNotMatch(sentence, /[{}]|undefined/, sentence);
    if (reason.name) assert.match(sentence, new RegExp(reason.name));
    for (const tile of reasonTiles(reason)) assert.doesNotMatch(`${tile.value} ${tile.label}`, /[{}]|undefined/);
  }
  assert.equal(reasonSentence(REASONS[1], now), 'Wahaye Eric akazi muri Werurwe kandi umuha 5★.');
  assert.equal(reasonSentence(REASONS[7], now), 'Abantu 3 bo muri Kimironko bahaye Moses 4★ cyangwa hejuru.');
  assert.equal(topLabel(REASONS[0]), 'Uwizewe cyane kuri wowe');
});

test('dates use Kinyarwanda month names in Kigali time', () => {
  const at = '2026-11-13T12:05:00Z'; // 14:05 in Kigali
  assert.equal(dateTimeLabel(at), '13 Nov 2026, 14:05');
  setLang('rw');
  assert.equal(dateTimeLabel(at), '13 Ugushyingo 2026, 14:05');
  assert.equal(shortDate(at), '13 Ugushyingo');
  assert.equal(monthLabel(at), 'Ugushyingo 2026');
});

test('the reviewer\'s sheet (docs/translation-review.csv) lists every key, with the CHECK notes', async () => {
  const { readFileSync } = await import('node:fs');
  const csv = readFileSync(new URL('../../docs/translation-review.csv', import.meta.url), 'utf8');
  const keys = csv.trim().split('\r\n').slice(1).map(line => line.slice(1, line.indexOf('"', 1)));
  assert.deepEqual(keys, Object.keys(en), 'run node client/scripts/translationReview.mjs');
  assert.equal((csv.match(/"CHECK: /g) || []).length, Object.keys(CHECK).length);
});

test('VITE_ENABLE_KINYARWANDA=false makes the app English only', async () => {
  const { kinyarwandaEnabled, languagesFor } = await import('./i18n/index.js');
  assert.equal(kinyarwandaEnabled({}), true, 'unset: Kinyarwanda offered');
  assert.equal(kinyarwandaEnabled({ VITE_ENABLE_KINYARWANDA: 'true' }), true);
  for (const off of ['false', 'FALSE', '0', 'off', ' false ']) assert.equal(kinyarwandaEnabled({ VITE_ENABLE_KINYARWANDA: off }), false, off);
  assert.deepEqual(languagesFor(false).map(l => l.value), ['en']);
  assert.deepEqual(languagesFor(true).map(l => l.value), ['en', 'rw']);
});
