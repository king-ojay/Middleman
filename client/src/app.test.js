// The Android app's build settings (capacitor.config.ts) and the web app's
// install files (public/manifest.webmanifest, icons, index.html links).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = path => new URL(`../${path}`, import.meta.url);

// Each import re-reads the config with CAP_TARGET as set at that moment.
async function capConfig(target) {
  if (target) process.env.CAP_TARGET = target;
  else delete process.env.CAP_TARGET;
  try {
    return (await import(`../capacitor.config.ts?target=${target}`)).default;
  } finally {
    delete process.env.CAP_TARGET;
  }
}

test('the Android app is rw.middleman.app, served from https://localhost', async () => {
  const config = await capConfig();
  assert.equal(config.appId, 'rw.middleman.app');
  assert.equal(config.appName, 'Middleman');
  assert.equal(config.webDir, 'dist');
  assert.equal(config.server.androidScheme, 'https');
  assert.equal(config.server.hostname, undefined); // so the origin the API allows is exactly https://localhost
});

test('only the local build may call a plain http:// API', async () => {
  const live = await capConfig();
  assert.equal(live.server.cleartext, undefined);
  assert.equal(live.android.allowMixedContent, false);

  const local = await capConfig('local');
  assert.equal(local.server.cleartext, true);
  assert.equal(local.android.allowMixedContent, true);
});

test('the splash is the brand green', async () => {
  assert.equal((await capConfig()).plugins.SplashScreen.backgroundColor, '#166534');
  assert.match(readFileSync(file('android/app/src/main/res/values/splash.xml'), 'utf8'), /#166534/);
});

// Width and height from a PNG's IHDR chunk.
const pngSize = path => {
  const b = readFileSync(file(`public${path}`));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', path);
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};

test('the web manifest makes the site installable, with icons of the sizes it states', () => {
  const manifest = JSON.parse(readFileSync(file('public/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Middleman');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) assert.equal(pngSize(icon.src), icon.sizes, icon.src);
  const sizes = purpose => manifest.icons.filter(i => i.purpose === purpose).map(i => i.sizes);
  assert.deepEqual(sizes('any'), ['192x192', '512x512']);
  assert.deepEqual(sizes('maskable'), ['512x512']);
  assert.equal(pngSize('/icons/apple-touch-icon.png'), '180x180');
});

test('index.html links the manifest and the iPhone icon, and registers no service worker', () => {
  const html = readFileSync(file('index.html'), 'utf8');
  assert.match(html, /<link rel="manifest" href="\/manifest.webmanifest" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon.png" \/>/);
  assert.doesNotMatch(html, /serviceWorker/);
});
