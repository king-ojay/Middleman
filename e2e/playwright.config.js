// One end-to-end run of the whole flow against a LOCAL API on a throwaway
// local database (E2E_MONGO_URI, see resetDb.mjs), the console OTP provider
// and the fake payment provider: no SMS, no MoMo, no Atlas, no live site.
// The API runs from this folder so it never reads server/.env; every setting
// it needs is given here. Uses the installed Google Chrome.
//   E2E_MONGO_URI='mongodb://127.0.0.1:27099/middleman_e2e?directConnection=true' npm test
import { defineConfig } from '@playwright/test';
import { checkE2eUri } from './resetDb.mjs';

const API_PORT = 4199;
const WEB_PORT = 4273;
export const API_LOG = '.logs/api.log';

const apiEnv = {
  MONGO_URI: checkE2eUri(process.env.E2E_MONGO_URI),
  E2E_MONGO_URI: process.env.E2E_MONGO_URI,
  PORT: String(API_PORT),
  NODE_ENV: 'development', // the console OTP provider prints codes only outside production
  OTP_PROVIDER: 'console',
  PAYMENT_PROVIDER: 'fake',
  SESSION_SECRET: 'e2e-session-secret',
  OTP_SECRET: 'e2e-otp-secret',
  CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
  ADMIN_SECRET: ''
};

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.js',
  timeout: 180_000,
  workers: 1,
  reporter: [['list']],
  use: { channel: 'chrome', baseURL: `http://localhost:${WEB_PORT}`, viewport: { width: 390, height: 844 } },
  webServer: [
    {
      command: `mkdir -p .logs && node resetDb.mjs && node ../server/server.js > ${API_LOG} 2>&1`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: `cd ../client && npx vite build --outDir ../e2e/.dist --emptyOutDir && npx vite preview --outDir ../e2e/.dist --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 120_000
    }
  ]
});
