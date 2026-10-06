import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getMongoUri } from './config/db.js';

import authRouter from './routes/auth.js';
import jobsRouter from './modules/jobs/jobs.routes.js';
import discoverRouter from './routes/discover.js';
import ratingsRouter from './routes/ratings.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/ratings', ratingsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

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
