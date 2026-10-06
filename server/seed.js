// Seeds the database with demo users, completed + rated jobs, and open jobs.
// Wipes existing data first. Run with: npm run seed (from server/).
//
// The rating graph is shaped so that, logged in as Amina (the demo client),
// Discover shows all three trust tiers for electricians and masons:
//   network  — reachable through Amina's own rating graph (1 or 3 hops)
//   area     — not reachable, but rated by clients in the worker's own area
//   fallback — never rated ("New — not yet rated")
import 'dotenv/config';
import mongoose from 'mongoose';
import { getMongoUri } from './config/db.js';

import User from './modules/users/user.model.js';
import Job from './modules/jobs/job.model.js';
import Quote from './modules/jobs/quote.model.js';
import Rating from './modules/trust/rating.model.js';
import Transaction from './models/Transaction.js';
import TrustEdge from './modules/trust/trustEdge.model.js';
import { writeTrustEdgeFromRating, writeTrustEdgeFromReferral } from './modules/trust/trustPropagation.js';
import { hashPin } from './modules/auth/pin.js';

// Every demo account logs in with this PIN.
const DEMO_PIN = '1234';



const USERS = [
  // Clients
  { key: 'amina', name: 'Amina Uwimana', phone: '0788000001', role: 'client', area: 'kimironko' },
  { key: 'patrick', name: 'Patrick Nshimiyimana', phone: '0788000002', role: 'client', area: 'kimironko' },
  { key: 'grace', name: 'Grace Mukamana', phone: '0788000003', role: 'client', area: 'remera' },
  { key: 'jeanpaul', name: 'Jean Paul Habyarimana', phone: '0788000004', role: 'client', area: 'gikondo' },
  { key: 'olivier', name: 'Olivier Mugisha', phone: '0788000005', role: 'client', area: 'gikondo' },
  { key: 'diane', name: 'Diane Ingabire', phone: '0788000006', role: 'client', area: 'kwa_nayinzira' },

  // Workers
  { key: 'eric', name: 'Eric Habimana', phone: '0788000101', role: 'worker', area: 'kimironko', skills: ['electrician'], verifiedStatus: 'verified' },
  { key: 'claudine', name: 'Claudine Uwase', phone: '0788000102', role: 'worker', area: 'remera', skills: ['electrician'] },
  { key: 'bosco', name: 'Jean Bosco Niyonzima', phone: '0788000103', role: 'worker', area: 'gikondo', skills: ['electrician'], verifiedStatus: 'verified' },
  { key: 'emmanuel', name: 'Emmanuel Twagirayezu', phone: '0788000104', role: 'worker', area: 'kwa_nayinzira', skills: ['electrician'], verifiedStatus: 'verified' },
  { key: 'alice', name: 'Alice Mukeshimana', phone: '0788000105', role: 'worker', area: 'kimironko', skills: ['plumber'], verifiedStatus: 'verified' },
  { key: 'fabrice', name: 'Fabrice Ndayisaba', phone: '0788000106', role: 'worker', area: 'gikondo', skills: ['plumber'] },
  { key: 'samuel', name: 'Samuel Bizimana', phone: '0788000107', role: 'worker', area: 'remera', skills: ['mason'] },
  { key: 'josiane', name: 'Josiane Umutoni', phone: '0788000108', role: 'worker', area: 'kimironko', skills: ['mason'] },
  { key: 'vestine', name: 'Vestine Nyirahabimana', phone: '0788000109', role: 'worker', area: 'gikondo', skills: ['cleaner'] },
  { key: 'innocent', name: 'Innocent Hakizimana', phone: '0788000110', role: 'worker', area: 'kwa_nayinzira', skills: ['mechanic'] },
  { key: 'theoneste', name: 'Theoneste Nkurunziza', phone: '0788000111', role: 'worker', area: 'kimironko', skills: ['carpenter'], verifiedStatus: 'verified' },
  { key: 'aline', name: 'Aline Uwera', phone: '0788000112', role: 'worker', area: 'remera', skills: ['painter', 'tiler'] },
  { key: 'didier', name: 'Didier Mugabo', phone: '0788000113', role: 'worker', area: 'gikondo', skills: ['welder'] },
  { key: 'solange', name: 'Solange Iradukunda', phone: '0788000114', role: 'worker', area: 'kwa_nayinzira', skills: ['tailor'], verifiedStatus: 'verified' },
  { key: 'kevin', name: 'Kevin Ishimwe', phone: '0788000115', role: 'worker', area: 'kimironko', skills: ['phone_repair'] },
  { key: 'yvonne', name: 'Yvonne Mutesi', phone: '0788000116', role: 'worker', area: 'remera', skills: ['hairdresser'] },
  { key: 'gilbert', name: 'Gilbert Ndikumana', phone: '0788000117', role: 'worker', area: 'gikondo', skills: ['carpenter', 'painter'] },
  // More Kimironko electricians, so Amina's ceiling-fan job gets responses from all three trust tiers
  { key: 'moses', name: 'Moses Habineza', phone: '0788000118', role: 'worker', area: 'kimironko', skills: ['electrician'] },
  { key: 'ange', name: 'Ange Uwamahoro', phone: '0788000119', role: 'worker', area: 'kimironko', skills: ['electrician'] }
];

// Completed jobs. `clientScore` is the client's rating of the worker;
// `workerScore` (optional) is the worker's rating of the client.
const COMPLETED_JOBS = [
  // Amina's direct network
  { client: 'amina', worker: 'eric', category: 'electrician', price: 25000, description: 'Replace faulty wiring in sitting room', comment: 'Fixed the wiring fault the same day. I told two neighbours.', clientScore: 5, workerScore: 5 },
  { client: 'amina', worker: 'alice', category: 'plumber', price: 18000, description: 'Fix leaking kitchen tap', comment: 'Quick, tidy, fair price.', clientScore: 4, referred: true, workerScore: 5 },
  // Alice -> Grace links Amina to Grace's hires (3-hop network trust)
  { client: 'grace', worker: 'alice', category: 'plumber', price: 30000, description: 'Install new shower mixer', clientScore: 5, workerScore: 4 },
  { client: 'grace', worker: 'claudine', category: 'electrician', price: 22000, description: 'Install security lights', comment: 'Good work, arrived a little later than agreed.', clientScore: 5, workerScore: 5 },
  { client: 'grace', worker: 'samuel', category: 'mason', price: 60000, description: 'Rebuild garden wall', clientScore: 4 },
  // Gikondo community — unreachable from Amina, so area-level trust
  { client: 'jeanpaul', worker: 'bosco', category: 'electrician', price: 20000, description: 'Rewire meter box', comment: 'Explained everything before starting.', clientScore: 5, workerScore: 5 },
  { client: 'olivier', worker: 'bosco', category: 'electrician', price: 15000, description: 'Fix tripping breaker', clientScore: 4 },
  { client: 'jeanpaul', worker: 'vestine', category: 'cleaner', price: 8000, description: 'Deep clean after renovation', clientScore: 5 },
  { client: 'olivier', worker: 'fabrice', category: 'plumber', price: 12000, description: 'Unblock drainage', clientScore: 4 },
  // Kimironko community — Patrick isn't in Amina's graph, so Josiane is area-trusted
  { client: 'patrick', worker: 'josiane', category: 'mason', price: 45000, description: 'Plaster bedroom walls', clientScore: 5 },
  { client: 'patrick', worker: 'moses', category: 'electrician', price: 15000, description: 'Fix doorbell wiring', comment: 'Reliable and polite.', clientScore: 5 },
  // Other trades (client ratings only, so the electrician paths above are unchanged)
  { client: 'amina', worker: 'theoneste', category: 'carpenter', price: 35000, description: 'Build kitchen shelves', clientScore: 5 },
  { client: 'patrick', worker: 'kevin', category: 'phone_repair', price: 25000, description: 'Replace phone battery', clientScore: 4 },
  { client: 'grace', worker: 'aline', category: 'painter', price: 55000, description: 'Paint sitting room', clientScore: 5 },
  { client: 'jeanpaul', worker: 'didier', category: 'welder', price: 60000, description: 'Weld new compound gate', clientScore: 4 },
  { client: 'diane', worker: 'solange', category: 'tailor', price: 15000, description: 'Tailor a work suit', clientScore: 5 }
];

// Worker responses to open jobs (FR-05). No amount = accepted the client's price.
const RESPONSES = [
  // Amina's ceiling fan: one response per trust tier, so the ranking is visible
  { job: 'Install ceiling fan in living room', worker: 'eric' },                                       // network, accepts
  { job: 'Install ceiling fan in living room', worker: 'moses', amount: 18000 },                       // area, counters lower
  { job: 'Install ceiling fan in living room', worker: 'ange', amount: 15000, depositAmount: 5000 },   // new, cheapest + deposit
  { job: "Rewire the shop's lighting", worker: 'bosco', amount: 70000, depositAmount: 20000 },
  { job: 'Paint two bedrooms', worker: 'aline' }
];

// Jobs where the client has already chosen a worker, so "Start job" can be demoed.
const CHOSEN = [
  { job: 'Repair broken wardrobe door', worker: 'theoneste' }
];

// Signup invitations (FR-03): the inviter vouches for the person they invited.
// Chosen so they don't change the electrician tiers the demo relies on.
const SIGNUP_REFERRALS = [
  { from: 'amina', to: 'eric' },
  { from: 'jeanpaul', to: 'olivier' },
  { from: 'diane', to: 'emmanuel' }
];

const OPEN_JOBS = [
  { client: 'diane', category: 'electrician', area: 'kwa_nayinzira', description: 'Socket in kitchen sparks when used', proposedPrice: 15000 },
  { client: 'olivier', category: 'electrician', area: 'gikondo', description: 'Need outdoor lighting installed', proposedPrice: 40000 },
  { client: 'amina', category: 'plumber', area: 'kimironko', description: 'Water heater not heating', proposedPrice: 25000 },
  { client: 'patrick', category: 'cleaner', area: 'kimironko', description: 'Weekly house cleaning', proposedPrice: 15000 },
  { client: 'grace', category: 'mason', area: 'remera', description: 'Cracked front steps need repair', proposedPrice: 50000 },
  { client: 'diane', category: 'mechanic', area: 'kwa_nayinzira', description: 'Car will not start in the mornings', proposedPrice: 20000 },
  // Kimironko
  { client: 'amina', category: 'electrician', area: 'kimironko', description: 'Install ceiling fan in living room', proposedPrice: 20000 },
  { client: 'patrick', category: 'electrician', area: 'kimironko', description: 'Outdoor socket stopped working', proposedPrice: 12000 },
  { client: 'patrick', category: 'plumber', area: 'kimironko', description: 'Toilet cistern keeps running', proposedPrice: 10000 },
  { client: 'amina', category: 'carpenter', area: 'kimironko', description: 'Repair broken wardrobe door', proposedPrice: 18000 },
  { client: 'patrick', category: 'carpenter', area: 'kimironko', description: 'Build a small bookshelf', proposedPrice: 35000 },
  { client: 'amina', category: 'phone_repair', area: 'kimironko', description: 'Cracked phone screen needs replacing', proposedPrice: 30000 },
  { client: 'patrick', category: 'mason', area: 'kimironko', description: 'Patch cracks in compound wall', proposedPrice: 30000 },
  // Gikondo
  { client: 'jeanpaul', category: 'electrician', area: 'gikondo', description: "Rewire the shop's lighting", proposedPrice: 60000 },
  { client: 'jeanpaul', category: 'electrician', area: 'gikondo', description: 'Install inverter for backup power', proposedPrice: 80000 },
  { client: 'jeanpaul', category: 'plumber', area: 'gikondo', description: 'Replace corroded water pipes', proposedPrice: 45000 },
  { client: 'olivier', category: 'welder', area: 'gikondo', description: 'Fix metal gate hinge', proposedPrice: 15000 },
  { client: 'jeanpaul', category: 'welder', area: 'gikondo', description: 'Weld window security bars', proposedPrice: 70000 },
  { client: 'olivier', category: 'cleaner', area: 'gikondo', description: 'Office cleaning twice a week', proposedPrice: 25000 },
  { client: 'olivier', category: 'carpenter', area: 'gikondo', description: 'Fix sagging kitchen cabinets', proposedPrice: 20000 },
  { client: 'jeanpaul', category: 'painter', area: 'gikondo', description: 'Repaint shop front', proposedPrice: 40000 },
  // Remera
  { client: 'grace', category: 'painter', area: 'remera', description: 'Paint two bedrooms', proposedPrice: 60000 },
  { client: 'grace', category: 'tiler', area: 'remera', description: 'Tile bathroom floor', proposedPrice: 45000 },
  { client: 'grace', category: 'hairdresser', area: 'remera', description: 'Bridal hair for wedding on Saturday', proposedPrice: 40000 },
  { client: 'grace', category: 'electrician', area: 'remera', description: 'Add two sockets in the bedroom', proposedPrice: 15000 },
  // Kwa Nayinzira
  { client: 'diane', category: 'electrician', area: 'kwa_nayinzira', description: 'Fix flickering lights in corridor', proposedPrice: 8000 },
  { client: 'diane', category: 'mechanic', area: 'kwa_nayinzira', description: 'Replace brake pads', proposedPrice: 25000 },
  { client: 'diane', category: 'tailor', area: 'kwa_nayinzira', description: 'Alter school uniforms for two kids', proposedPrice: 6000 },
  { client: 'diane', category: 'tailor', area: 'kwa_nayinzira', description: 'Sew curtains for living room', proposedPrice: 20000 }
];

async function seed() {
  const mongo = getMongoUri();
  console.log(`Connecting to MongoDB at ${mongo.description}...`);
  await mongoose.connect(mongo.uri);
  console.log(`Connected to ${mongoose.connection.name}. Clearing existing data...`);

  await Promise.all([User, Job, Quote, Rating, Transaction, TrustEdge].map(M => M.deleteMany({})));

  const users = {};
  for (const { key, ...data } of USERS) {
    users[key] = await User.create({ ...data, pinHash: await hashPin(DEMO_PIN) });
  }

  for (const r of SIGNUP_REFERRALS) {
    await User.updateOne({ _id: users[r.to]._id }, { referredBy: users[r.from]._id });
    await writeTrustEdgeFromReferral({ fromUser: users[r.from]._id, toUser: users[r.to]._id });
  }

  for (const j of COMPLETED_JOBS) {
    const client = users[j.client];
    const worker = users[j.worker];
    const job = await Job.create({
      client: client._id,
      worker: worker._id,
      category: j.category,
      description: j.description,
      area: client.area,
      status: 'completed',
      proposedPrice: j.price,
      agreedPrice: j.price
    });

    await rate(job, client, worker, j.clientScore, j.referred, j.comment);
    if (j.workerScore) await rate(job, worker, client, j.workerScore, false);
  }

  const openJobs = {};
  for (const j of OPEN_JOBS) {
    openJobs[j.description] = await Job.create({ client: users[j.client]._id, category: j.category, area: j.area, description: j.description, proposedPrice: j.proposedPrice });
  }

  for (const r of [...RESPONSES, ...CHOSEN]) {
    const job = openJobs[r.job];
    const amount = r.amount ?? job.proposedPrice;
    const quote = await Quote.create({ job: job._id, worker: users[r.worker]._id, amount, isCounter: amount !== job.proposedPrice, depositAmount: r.depositAmount || 0 });
    if (CHOSEN.includes(r)) {
      await Job.updateOne({ _id: job._id }, { status: 'quote_accepted', worker: quote.worker, agreedPrice: amount, depositAmount: quote.depositAmount, acceptedAt: new Date() });
      await Quote.updateOne({ _id: quote._id }, { status: 'accepted' });
    }
  }

  console.log(`Seeded ${USERS.length} users, ${COMPLETED_JOBS.length} completed jobs, ${OPEN_JOBS.length} open jobs, ${RESPONSES.length + CHOSEN.length} worker responses.\n`);
  console.log(`Demo logins (phone number, PIN ${DEMO_PIN}):`);
  for (const u of USERS) {
    console.log(`  ${u.phone}  ${u.role.padEnd(6)}  ${u.area.padEnd(13)}  ${u.name}${u.skills ? ` (${u.skills.join(', ')})` : ''}`);
  }

  await mongoose.disconnect();
}

// Same as the app: store the rating, then write its trust edge.
async function rate(job, fromUser, toUser, score, referredFlag, comment = '') {
  await Rating.create({ job: job._id, fromUser: fromUser._id, toUser: toUser._id, score, referredFlag: !!referredFlag, comment });
  await writeTrustEdgeFromRating({ fromUser: fromUser._id, toUser: toUser._id, score, referredFlag });
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
