// Loads .env before any module reads process.env at import time.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { allowedOrigins, rejectOtherOrigins } from './config/cors.js';

import authRouter from './modules/auth/auth.routes.js';
import jobsRouter from './modules/jobs/jobs.routes.js';
import discoverRouter from './modules/trust/discover.routes.js';
import usersRouter from './modules/users/users.routes.js';
import { adminRouter, callbackRouter } from './modules/payments/payments.routes.js';

// The Express app without a database connection or a listening port, so
// tests can start it on their own (see test/).
const app = express();
// Behind Render's proxy: use the client's IP (X-Forwarded-For) for rate limits.
app.set('trust proxy', 1);
// Security headers. The app (vercel.app) reads this API from another site,
// so resources are allowed cross-origin; CORS still decides who may read them.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Only the app's own origins (config/cors.js); anything else gets 403.
const origins = allowedOrigins();
app.use(rejectOtherOrigins(origins));
app.use(cors({ origin: [...origins] }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/users', usersRouter);
app.use('/api/payments', callbackRouter);
app.use('/api/admin', adminRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Unknown API routes answer in JSON like everything else.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

export default app;
