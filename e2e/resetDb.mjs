// Empties the throwaway e2e database before the API starts. Refuses anything
// but a local MongoDB whose database name contains "e2e": never Atlas, never
// the live data.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../server/package.json', import.meta.url));
const mongoose = require('mongoose');

export function checkE2eUri(uri) {
  if (!uri) throw new Error('Set E2E_MONGO_URI, e.g. mongodb://127.0.0.1:27099/middleman_e2e?directConnection=true (a one-node replica set)');
  const url = new URL(uri);
  if (url.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('E2E_MONGO_URI must be a local mongodb:// URI (127.0.0.1 or localhost)');
  }
  if (!/e2e/i.test(url.pathname)) throw new Error('E2E_MONGO_URI must name a database containing "e2e"');
  return uri;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mongoose.connect(checkE2eUri(process.env.E2E_MONGO_URI));
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log('[e2e] database emptied');
}
