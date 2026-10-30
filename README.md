# Middleman

Graph-based trust propagation platform for informal/blue-collar service discovery
in Kigali, Rwanda. Built for the Mission Capstone project — see `/docs` for the
full research proposal this implements.

## Live demo

- **App:** https://middleman-client.vercel.app
- **API:** https://middleman-api-74zb.onrender.com/api/health (free tier, so the
  first request after idle can take ~50s while it wakes up)

Log in with a seeded phone number and the demo PIN **`1234`**:

| Phone | Role | Who | What you'll see |
|---|---|---|---|
| `0788000001` | Client | Amina, Kimironko | My jobs → "Install ceiling fan": three responses ranked by trust, not price |
| `0788000004` | Client | Jean Paul, Gikondo | Discover: same search, different personalised ranking |
| `0788000101` | Worker | Eric, Kimironko electrician | Open jobs: accept or counter; the client's trust tier on each job |
| `0788000118` | Worker | Moses, Kimironko electrician | Area-trusted responder on Amina's job |
| `0788000119` | Worker | Ange, Kimironko electrician | New worker, cheapest offer, still ranked last |
| `0788000111` | Worker | Theoneste, Kimironko carpenter | My jobs: already chosen, can "Start job" |

To try registration, use a new number: the SMS code appears in the API log
while `OTP_PROVIDER=console` (Render → Logs).

## Structure

```
server/   Express + MongoDB API, including the trust propagation algorithm
client/   React + Vite frontend
```

## Run it locally

You need Node.js 24 (see `.nvmrc`; `nvm use` picks it up) and Docker (for MongoDB). From the repo root:

```bash
# 1. MongoDB in Docker as a one-node replica set (ratings are written in
#    transactions, which need one). First time only; later just `docker start mongo`.
docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec mongo mongosh --quiet --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"

# 2. Install everything (server and client are npm workspaces)
npm install

# 3. Server settings
cp server/.env.example server/.env
#    then set SESSION_SECRET in server/.env to any long random string

# 4. Load the demo data and start the API on http://localhost:4000
cd server
MONGO_URI='mongodb://localhost:27017/middleman?directConnection=true' npm run seed
MONGO_URI='mongodb://localhost:27017/middleman?directConnection=true' npm run dev

# 5. In a second terminal, start the app on http://localhost:5173
cd client
npm run dev
```

> **`npm run seed` wipes the database `MONGO_URI` points at.** Passing
> `MONGO_URI` on the command line as above keeps it on your local Docker
> database even if `server/.env` points at Atlas.

Open http://localhost:5173 and log in with any demo account below. **Every
demo account's PIN is `1234`.**

| Phone | Role | Who |
|---|---|---|
| `0788000001` | Client | Amina Uwimana, Kimironko |
| `0788000002` | Client | Patrick Nshimiyimana, Kimironko |
| `0788000003` | Client | Grace Mukamana, Remera |
| `0788000004` | Client | Jean Paul Habyarimana, Gikondo |
| `0788000005` | Client | Olivier Mugisha, Gikondo |
| `0788000006` | Client | Diane Ingabire, Kwa Nayinzira |
| `0788000101` | Worker | Eric Habimana, electrician, Kimironko |
| `0788000102` | Worker | Claudine Uwase, electrician, Remera |
| `0788000103` | Worker | Jean Bosco Niyonzima, electrician, Gikondo |
| `0788000104` | Worker | Emmanuel Twagirayezu, electrician, Kwa Nayinzira |
| `0788000105` | Worker | Alice Mukeshimana, plumber, Kimironko |
| `0788000106` | Worker | Fabrice Ndayisaba, plumber, Gikondo |
| `0788000107` | Worker | Samuel Bizimana, mason, Remera |
| `0788000108` | Worker | Josiane Umutoni, mason, Kimironko |
| `0788000109` | Worker | Vestine Nyirahabimana, cleaner, Gikondo |
| `0788000110` | Worker | Innocent Hakizimana, mechanic, Kwa Nayinzira |
| `0788000111` | Worker | Theoneste Nkurunziza, carpenter, Kimironko |
| `0788000112` | Worker | Aline Uwera, painter and tiler, Remera |
| `0788000113` | Worker | Didier Mugabo, welder, Gikondo |
| `0788000114` | Worker | Solange Iradukunda, tailor, Kwa Nayinzira |
| `0788000115` | Worker | Kevin Ishimwe, phone repair, Kimironko |
| `0788000116` | Worker | Yvonne Mutesi, hairdresser, Remera |
| `0788000117` | Worker | Gilbert Ndikumana, carpenter and painter, Gikondo |
| `0788000118` | Worker | Moses Habineza, electrician, Kimironko |
| `0788000119` | Worker | Ange Uwamahoro, electrician, Kimironko |

To register a new account locally, use any other `07…` number: with
`OTP_PROVIDER=console` (the default) the 6-digit SMS code is printed in the
API terminal.

**Tests:** `cd server && npm test` runs the unit tests. The API tests also run
when you point them at a throwaway database:
`TEST_MONGO_URI='mongodb://localhost:27017/middleman_test?directConnection=true' npm test` (against the replica set above).

## What's built so far

- **Data models** — match the ERD in Chapter 3 of the proposal: User, Job,
  Quote, Transaction, Rating, TrustEdge. Code is organised by domain module
  (NFR-08): `server/modules/{auth,users,jobs,trust,payments}`.
- **Trust propagation algorithm** (`server/modules/trust/trustPropagation.js`) — the
  actual decay-weighted BFS traversal described in Section 3.2.3, including the
  `referredFlag` boost and bidirectional rating support.
- **Layered ranking** (`rankByTrust` in `server/modules/trust/trustPropagation.js`) —
  users the viewer's graph can't reach are scored by ratings from their own
  area, then the verification floor (path → area → floor, Section 3.2.3). The
  same call ranks workers for a client and clients for a worker.
- **Seed script** (`server/seed.js`) — 25 users across Kimironko, Kwa Nayinzira,
  Remera and Gikondo and 12 trades, with 16 completed and rated jobs, 29 open
  jobs, worker responses, one job with a worker already chosen, rating comments
  and signup invitations. Every account's PIN is `1234`. Areas and trades are
  defined once in `server/config/` (models) and `client/src/options.js`.
- **Discover page** (`client/src/pages/Discover.jsx`) — trust-ranked worker
  search.
- **Registration and login** (FR-01–03) — sign up in 2 screens (role, trades
  for workers, name, phone, area; then an SMS code, a 4-digit PIN and an
  optional "Who invited you?" that writes a referral edge). Daily login is
  phone + PIN (scrypt-hashed); SMS codes are only for signup and PIN reset.
  Codes go through `sendOtp(phone, code)` with `OTP_PROVIDER` = `console`,
  `twilio` or `africastalking`; they are stored hashed, expire in 5 minutes,
  allow 5 attempts, and are rate-limited per phone and IP. Rwandan (+250)
  numbers only. API calls still identify the user with an `x-user-id` header
  until Phase 7 adds real sessions.
- **Client-anchored bidding** (Section 3.3.3, FR-04/05/05b) — the client posts a
  job with a proposed price; each matching worker accepts it or sends one
  counter-amount; the client sees every
  response ranked by trust and chooses one, which fixes the agreed price.
- **Job lifecycle** (`server/modules/jobs/lifecycle.js`, Fig. 5) —
  `open → quote_accepted → escrow_held → in_progress → awaiting_confirmation → completed`,
  with `disputed` reachable from escrow held, in progress or awaiting
  confirmation, and `resolved` after an admin settles a dispute. The worker
  starts (once paid) and marks complete; the client confirms with a required
  rating and an optional "vouch" (FR-12, FR-17); the worker rates the client
  (FR-12b). Both ratings need the job confirmed AND escrow released. Every
  rating writes a trust edge (FR-15).
- **Sandbox escrow** (`server/modules/payments/`, FR-09/13/14) — no real money,
  ever. The client pays the agreed price into escrow; confirming releases it to
  the worker; a dispute locks it until an admin releases or refunds it.
  Payments go through a provider interface chosen by `PAYMENT_PROVIDER`:
  `fake` (moves nothing; tests and local use) or `momo-sandbox` (MTN MoMo
  sandbox: Collections `requestToPay` to fund, Disbursements `transfer` to
  release or refund; it refuses any host but `sandbox.momodeveloper.mtn.com`).
  Every call carries an idempotency key (`X-Reference-Id`); payments still
  pending settle by callback (`/api/payments/momo/callback`, which re-checks
  the status with MoMo rather than trusting the body) or by polling. Every
  escrow state change writes a ledger record (`Transaction`), with no phone
  numbers. Admin routes (`/api/admin/disputes`, `/api/admin/jobs/:id/{release,refund,ledger}`)
  need the `X-Admin-Secret` header (`ADMIN_SECRET`). The app shows a
  "Sandbox – no real money" banner on every screen.
- **Profiles** — jobs done, average rating, vouches, "vouched for by" and recent
  ratings, plus the person's trust tier from the viewer's side.
- **Screens** (Figma "Mobile v2", exports in `docs/designs/`) — mobile-first at
  390px, centred 430px column on desktop, role-based bottom tab bar. Every core
  flow is 4 steps or fewer (NFR-02).

## Deployment

API on Render, frontend on Vercel, database on MongoDB Atlas (all free tiers).

1. **Atlas** — create a free M0 cluster and a database user. Under Network
   Access, allow `0.0.0.0/0` (Render's free tier has no fixed IP). Copy the
   connection string and add the database name before the `?`:
   `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/middleman?retryWrites=true&w=majority`
2. **Seed Atlas** from your machine (one-off; wipes and reloads demo data):
   ```bash
   cd server && MONGO_URI="<atlas connection string>" npm run seed
   ```
3. **Render** — New + → Blueprint → select this repo. It reads `render.yaml`
   and prompts for `MONGO_URI`; paste the Atlas string there. Under Environment,
   also set `OTP_SECRET` (any long random string) and `OTP_PROVIDER`
   (`console` prints codes to the log; `twilio` or `africastalking` send real
   SMS and need the keys listed in `server/.env.example`). Check
   `https://<service>.onrender.com/api/health` returns `{"status":"ok"}`.
   Free services sleep when idle, so the first request can take ~50s.
   Escrow uses `PAYMENT_PROVIDER=fake` until you switch it to `momo-sandbox`:
   subscribe to Collections and Disbursements on momodeveloper.mtn.com, run
   `node scripts/momoSandboxSetup.js` (in `server/`, see its header) to create
   the API users and keys, put the six `MOMO_*` values and `MOMO_CALLBACK_URL`
   in Render's Environment, then check them with
   `node --env-file=.env scripts/momoSandboxCheck.js`.
4. **Vercel** — Add New → Project → import this repo, set **Root Directory**
   to `client` (Vite is auto-detected), and add the environment variable
   `VITE_API_URL=https://<service>.onrender.com` (no trailing slash). Deploy.
   `client/vercel.json` makes deep links like `/discover` work.

## Evaluation, Part A: public datasets

`server/scripts/experiments/run.js` tests the trust engine's core (path
propagation, decay, strongest path, the negative-evidence rule) on real public
signed networks, with the leave-one-out protocol of Kumar et al. (2016), "Edge
weight prediction in weighted signed networks" (ICDM). No synthetic data.

```bash
# The data is not in the repo (data/raw/ is gitignored). Download once:
mkdir -p data/raw
curl -L -o data/raw/soc-sign-bitcoinotc.csv.gz https://snap.stanford.edu/data/soc-sign-bitcoinotc.csv.gz
curl -L -o data/raw/soc-sign-bitcoinalpha.csv.gz https://snap.stanford.edu/data/soc-sign-bitcoinalpha.csv.gz  # optional replication

cd server
node scripts/experiments/run.js --dataset bitcoinotc --sample 2000   # quick check, ~20s
node scripts/experiments/run.js --dataset bitcoinotc                 # every edge, a few minutes
node scripts/experiments/run.js --dataset bitcoinalpha
```

Options: `--sample N` tests a seeded random sample of N edges; `--seed S`
(default 1) fixes the sample and split; `--tune-split` also tunes lambda
{0.25, 0.5, 1.0, 1.5, 2.0} and depth {1, 2, 3, 4} (best RMSE) and fits a linear
calibration on a seeded 20% of the test edges, then reports every method on
the other 80%, which tuning never sees; `--reciprocal` adds the
"proposed + reciprocal" row (off by default: it uses the target's own rating
of the source, which suits Bitcoin OTC's mutual ratings but not Middleman,
where clients rank strangers). `.csv` and `.csv.gz` both work. The run logs the file's MD5 (OTC:
`eeaf5cd1d29ab435505baeeb6816317b`), its line count (OTC: 35,592), the git
commit and a hash of the experiment code.

- **Graph**: weight = rating/10; a rating > 0 is positive evidence of
  rating/10, a rating <= 0 negative evidence of |rating|/10; every member is
  one node type. Referral boost, area trust and verification are off: the data
  has none of them (they are evaluated in the pilot).
- **Protocol**: for each test edge, the edge is hidden, predicted from the rest
  of the graph, and put back. Prediction = positive − lambda × negative from
  `computeTrust` (unchanged), clamped to [-1, 1]; with no evidence it is the
  floor `computeTrust` returns (0.1). `test/experiments.test.js` checks that a
  hidden edge never influences its own prediction.
- **Compared on the same edges**: global average, flat average of the target's
  other ratings, MoleTrust (horizon 3, threshold 0.5), TidalTrust, the
  proposed model with lambda 0.5, and with lambda 0 (positive-only). Sweeps:
  lambda 0.25/0.5/1.0 and depth 1–4. Experiment-only variants, each its own
  row: "proposed + community fallback" (no evidence: the target's average of
  its other ratings, the OTC analogue of the app's area-trust tier, else the
  global average), the tuned and calibrated versions (with `--tune-split`)
  and "proposed + reciprocal" (with `--reciprocal`). None of them changes
  `computeTrust` or the app's defaults.
- **Metrics**: RMSE and Pearson correlation (the paper's), MAE, sign accuracy
  (overall and on negative ratings), coverage, precision@5/10, cold start
  (targets with 1–3 ratings) and latency. Kumar et al.'s Table IV is printed
  beside the results; only their unsupervised Table IV is comparable.
- **Output**: a console report and `results/<dataset>_<timestamp>.json` and
  `.csv` (aggregate metrics only, never the ratings).

## Not built yet (next steps)

- 72-hour auto-release of escrow, and an admin screen (disputes are resolved
  through the admin API for now)

## Design system

Tokens (colour, Inter type scale, radii, shadows) live in
`client/tailwind.config.js` and are the only source of styling values. Shared
components are in `client/src/components/ui/` (Button, Chip, TierBadge, Card,
FormField, Avatar, Switch, TabBar, PageLayout, Sheet, StarRating, ...); screens
use only these. Text on the green `signal` colour uses `on-signal` (dark
forest) rather than white, which fails contrast.
