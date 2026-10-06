import mongoose from 'mongoose';
import app from './app.js';
import { getMongoUri } from './config/db.js';

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
