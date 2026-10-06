import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getMongoUri } from './config/db.js';

import authRouter from './modules/auth/auth.routes.js';
import jobsRouter from './modules/jobs/jobs.routes.js';
import discoverRouter from './modules/trust/discover.routes.js';
import usersRouter from './modules/users/users.routes.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/users', usersRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Unknown API routes answer in JSON like everything else.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 4000;

let mongo;
try {
  mongo = getMongoUri();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
console.log(`Connecting to MongoDB at ${mongo.description}...`);

mongoose.connect(mongo.uri)
  .then(() => {
    app.listen(PORT, () => console.log(`Middleman API running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
