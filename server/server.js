import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import jobsRouter from './routes/jobs.js';
import discoverRouter from './routes/discover.js';
import ratingsRouter from './routes/ratings.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/jobs', jobsRouter);
app.use('/api/discover', discoverRouter);
app.use('/api/ratings', ratingsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/middleman';

mongoose.connect(MONGO_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`Middleman API running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
