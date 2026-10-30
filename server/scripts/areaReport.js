// Read-only report: how many users are in each area, and which Kimironko users
// signed up through the app (where Kimironko was preselected until the area
// picker became required), so they can be asked to check their area.
// Prints user ids, roles and signup dates only: never names or phone numbers.
//
//   MONGO_URI="<connection string>" node scripts/areaReport.js
//
// Seeded demo users are all created within a few seconds by seed.js, so a user
// created more than 10 minutes after the first user counts as an app signup.
import 'dotenv/config';
import mongoose from 'mongoose';
import { getMongoUri } from '../config/db.js';
import User from '../modules/users/user.model.js';

const OLD_DEFAULT = 'kimironko';
const SEED_WINDOW_MS = 10 * 60 * 1000;

const { uri, description } = getMongoUri();
console.log(`Database: ${description}\n`);
await mongoose.connect(uri);
try {
  const byArea = await User.aggregate([
    { $group: { _id: { area: '$area', role: '$role' }, n: { $sum: 1 } } },
    { $sort: { '_id.area': 1, '_id.role': 1 } }
  ]);
  console.log('Users by area and role:');
  for (const { _id, n } of byArea) console.log(`  ${_id.area.padEnd(14)} ${_id.role.padEnd(7)} ${n}`);

  const first = await User.findOne({}, 'createdAt').sort({ createdAt: 1 }).lean();
  const cutoff = first ? new Date(first.createdAt.getTime() + SEED_WINDOW_MS) : new Date(0);
  const kimironko = await User.find({ area: OLD_DEFAULT }, 'role createdAt').sort({ createdAt: 1 }).lean();
  const signups = kimironko.filter(u => u.createdAt > cutoff);

  console.log(`\n${OLD_DEFAULT}: ${kimironko.length} users, ${signups.length} signed up through the app (after ${cutoff.toISOString()}):`);
  for (const u of signups) console.log(`  ${u._id}  ${u.role.padEnd(7)} ${u.createdAt.toISOString()}`);
} finally {
  await mongoose.disconnect();
}
