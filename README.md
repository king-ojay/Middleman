# Middleman

A web app that links informal and blue-collar workers with clients in four
Kigali neighbourhoods (Kimironko, Kwa Nayinzira, Remera, Gikondo). Workers are
ranked for each client by **personalised, graph-based trust propagation**:
people the client trusts, and the people they trust, come first. Ratings go
both ways, and payments run through a **sandboxed mobile-money escrow** (MTN
MoMo sandbox, no real money). Responsive Progressive Web App target: phone,
tablet and desktop. ALU BSc Software Engineering capstone.

- **Demo video:** `<VIDEO LINK PLACEHOLDER>`
- **Final report:** `<REPORT LINK PLACEHOLDER>`

## Live URLs

- **App:** https://middleman-client.vercel.app
- **API:** https://middleman-api-74zb.onrender.com/api/health

The live deployment runs the `main` branch. Escrow, worker job search, the
redesigned My jobs screens and the required area picker are on `redesign-v2`
(tag `v1.0.0-pilot` and later) and reach the live URLs when that branch is
merged. The API is on Render's free tier, which sleeps when idle; Render
documents a wake-up of up to about a minute.

Demo accounts (seeded data, PIN **`1234`** for all):

| Phone | Role | Who | What you'll see |
|---|---|---|---|
| `0788000001` | Client | Amina, Kimironko | My jobs → "Install ceiling fan": three responses ranked by trust, not price |
| `0788000004` | Client | Jean Paul, Gikondo | Discover: same search, different personalised ranking |
| `0788000101` | Worker | Eric, Kimironko electrician | Jobs: accept or counter; the client's trust tier on each job |
| `0788000118` | Worker | Moses, Kimironko electrician | Area-trusted responder on Amina's job |
| `0788000119` | Worker | Ange, Kimironko electrician | New worker, cheapest offer, still ranked last |
| `0788000111` | Worker | Theoneste, Kimironko carpenter | My work: already chosen, waiting for payment |

To register, use a new `07…` number. With `OTP_PROVIDER=console` the SMS code
is printed in the API log only outside production (for example when running
locally); the production API never logs codes, so live signup needs
`OTP_PROVIDER=africastalking`.

## Features

- **Registration and login** (FR-01–03): two screens (role, trades for workers,
  name, phone, a required area picker with no default; then an SMS code, a
  4-digit PIN and an optional "Who invited you?" that writes a referral edge).
  Daily login is phone + PIN. Area can be changed later in Profile.
- **Personalised trust ranking**: Discover ranks workers by trust from the
  client's own graph (decay per hop, strongest path, referral boost, negative
  evidence from 1–2★ ratings), then area trust ("Trusted in this area"), then a
  verification floor. Only tiers are shown, never a number.
- **Client-anchored bidding** (FR-04/05/05b): the client posts a job with a
  price; workers accept it or send one counter-offer (optionally asking for a
  materials amount); the client sees offers ranked by trust and chooses one.
- **Worker job search**: by default jobs in the worker's area and trades;
  filters for area, trade, free-text search and price sort; offers allowed in
  any pilot area within the worker's own trades; "You responded" label.
- **Job lifecycle and sandbox escrow** (FR-09/13/14): pay into escrow → worker
  starts → marks complete → client confirms and rates, which releases the
  money. Disputes lock the money until an admin releases or refunds it. Every
  escrow change is written to an append-only ledger. "Sandbox – no real money"
  banner on every screen.
- **Bidirectional ratings and vouches** (FR-12, FR-12b, FR-15, FR-17): both
  directions need the job confirmed and the money released; every rating
  writes a trust edge.
- **My jobs / My work**: jobs grouped by status in tabs, each card with a
  status chip, where the money is, and the one next step.
- **Profiles**: jobs done, average rating, vouches, recent ratings, the
  viewer's trust tier, area setting, appearance (light/dark/system).
- **Security**: scrypt-hashed PIN, OTP stored as HMAC-SHA256 (5-minute expiry,
  5 attempts), HS256 sessions (12 h), helmet headers, CSP, CORS allow-list,
  rate limits and login lockout, phone numbers masked in logs.

## Tech stack (exact versions in `package-lock.json`)

| Part | Versions |
|---|---|
| Runtime | Node.js 24.22.1 (pinned in `.nvmrc`, `render.yaml`, `engines: 24.x`) |
| API | Express 4.22.3, Mongoose 8.24.4, helmet 8.3.0, cors 2.8.6, dotenv 16.6.1 |
| Database | MongoDB 7/8 as a one-node replica set locally (transactions); MongoDB Atlas in production |
| App | React 18.3.1, React Router 6.30.6, Vite 5.4.21, Tailwind CSS 3.4.19, PostCSS 8.5.28, Autoprefixer 10.6.1, @vitejs/plugin-react 4.7.0 |
| Hosting | Render (API, free), Vercel (app, free), Atlas M0 (free) |

## Structure

```
server/   Express + MongoDB API
  modules/auth       login, PIN, OTP (providers: console, twilio, africastalking), sessions, rate limits
  modules/users      user model, profile, area change
  modules/jobs       job and quote models, lifecycle, worker job feed
  modules/trust      computeTrust (pure engine), graph loading and ranking, ratings
  modules/payments   escrow, append-only ledger, payment providers (fake, momo-sandbox)
  scripts/           experiments (Part A), ranking regression, MoMo sandbox setup/check, area report
  test/              node:test unit and API tests
client/   React + Vite app (pages/, components/, components/ui/ design-system components)
shared/   Plain data both use: the pilot areas. Edit shared/areas.js, then run
          `npm run sync:shared` (copies it into server/ and client/, which deploy alone)
scripts/  syncShared.mjs, makeSubmissionZip.sh
docs/     RUNBOOK.md, designs/, screenshots/
results/  committed Part A experiment results (aggregate metrics only)
```

## Install and run locally

You need Node.js 24 (`nvm use` reads `.nvmrc`) and Docker (for MongoDB). From
the repo root:

```bash
# 1. MongoDB as a one-node replica set (ratings and escrow use transactions).
#    First time only; later just `docker start mongo`.
docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0
docker exec mongo mongosh --quiet --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"

# 2. Install everything (server and client are npm workspaces)
npm install

# 3. Server settings: copy the example and set SESSION_SECRET to any long random string
cp server/.env.example server/.env

# 4. Load the demo data and start the API on http://localhost:4000
cd server
MONGO_URI='mongodb://localhost:27017/middleman?directConnection=true' npm run seed
MONGO_URI='mongodb://localhost:27017/middleman?directConnection=true' npm run dev

# 5. In a second terminal, start the app on http://localhost:5173
cd client
npm run dev
```

> **`npm run seed` wipes the database `MONGO_URI` points at.** Passing
> `MONGO_URI` on the command line as above keeps it on your local database
> even if `server/.env` points at Atlas.

The seed creates 25 users (6 clients, 19 workers) across the four areas and 12
trades, 16 completed and rated jobs, open jobs, offers and referrals. Every
seeded account's PIN is `1234`; phone numbers are `0788000001`–`0788000006`
(clients) and `0788000101`–`0788000119` (workers).

## Environment variables (names only; values go in `server/.env` or the host's settings, never in the repo)

| Where | Names |
|---|---|
| API, required | `MONGO_URI`, `SESSION_SECRET` (the API refuses to start in production without it) |
| API, production | `NODE_ENV`, `NODE_VERSION`, `CORS_ORIGINS`, `OTP_SECRET` (without it codes use a random key per process), `PORT` (set by the host) |
| API, optional | `SESSION_TTL_HOURS` |
| SMS codes | `OTP_PROVIDER` (`console`, `twilio`, `africastalking`); `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` |
| Escrow | `PAYMENT_PROVIDER` (`fake`, `momo-sandbox`); `MOMO_COLLECTION_SUBSCRIPTION_KEY`, `MOMO_COLLECTION_USER_ID`, `MOMO_COLLECTION_API_KEY`, `MOMO_DISBURSEMENT_SUBSCRIPTION_KEY`, `MOMO_DISBURSEMENT_USER_ID`, `MOMO_DISBURSEMENT_API_KEY`, `MOMO_CALLBACK_URL`; optional `MOMO_CURRENCY`, `MOMO_SANDBOX_MSISDN` |
| Disputes | `ADMIN_SECRET` (header `X-Admin-Secret` on `/api/admin/*`) |
| Tests | `TEST_MONGO_URI` (database name must contain "test") |
| App (Vercel) | `VITE_API_URL` |

## Tests

```bash
cd server
npm test                                    # unit + experiment tests; API tests skip
TEST_MONGO_URI='mongodb://localhost:27017/middleman_test?directConnection=true' npm test   # everything

# 300-ranking regression (positive-only rankings must not change)
MONGO_URI='mongodb://localhost:27017/middleman_regression?directConnection=true' node seed.js
MONGO_URI='mongodb://localhost:27017/middleman_regression?directConnection=true' node scripts/rankingRegression.js
```

132 tests at the time of writing: 63 unit, 49 API integration (need
`TEST_MONGO_URI`), 20 experiment-code tests; plus the separate 300-ranking
regression. See `docs/RUNBOOK.md` for details.

## Evaluation, Part A: public datasets (Bitcoin OTC)

`server/scripts/experiments/run.js` tests the trust engine's core (path
propagation, decay, strongest path, the negative-evidence rule) on real public
signed networks with the leave-one-out protocol of Kumar et al. (2016), "Edge
weight prediction in weighted signed networks" (ICDM). No synthetic data.

The data is not in the repo (`data/raw/` is gitignored). Download it from
Stanford SNAP: https://snap.stanford.edu/data/soc-sign-bitcoin-otc.html

```bash
mkdir -p data/raw
curl -L -o data/raw/soc-sign-bitcoinotc.csv.gz https://snap.stanford.edu/data/soc-sign-bitcoinotc.csv.gz
curl -L -o data/raw/soc-sign-bitcoinalpha.csv.gz https://snap.stanford.edu/data/soc-sign-bitcoinalpha.csv.gz  # optional replication

cd server
node scripts/experiments/run.js --dataset bitcoinotc --sample 2000            # quick check
node scripts/experiments/run.js --dataset bitcoinotc                          # all 35,592 edges (~5.5 min)
node scripts/experiments/run.js --dataset bitcoinotc --tune-split --seed 2    # held-out tuning
```

The run checks the file's MD5 (OTC `eeaf5cd1d29ab435505baeeb6816317b`) and
line count (35,592), and writes `results/<dataset>_<timestamp>.json` and
`.csv` with aggregate metrics only. `--sample N`, `--seed S`, `--tune-split`
(tunes lambda {0.25, 0.5, 1.0, 1.5, 2.0} × depth {1, 2, 3, 4} on a seeded 20%
and reports on the other 80%) and `--reciprocal` (OTC-only variant) are
optional. Only Kumar et al.'s unsupervised Table IV is comparable.

All 35,592 OTC edges (results file `results/bitcoinotc_2026-10-29T13-28-33-037Z.json`):

| Method | RMSE | PCC |
|---|---|---|
| Flat average of target (baseline) | 0.319 | 0.474 |
| Proposed, lambda 0.5, depth 3 (app defaults) | 0.345 | 0.289 |
| Proposed + community fallback | 0.335 | 0.382 |
| Kumar et al. FxG (best unsupervised, Table IV) | 0.31 | 0.49 |

Referral boost, area trust, verification and escrow cannot be tested on this
data (it has no roles, areas, referrals or verification); they are evaluated
in the pilot.

## Deployment

API on Render (`render.yaml` Blueprint, `rootDir: server`), app on Vercel
(Root Directory `client`), database on Atlas. Neither host lets a build read
files outside its folder, which is why `shared/` is copied in by
`npm run sync:shared`. Step-by-step setup, the security checks and the pilot
procedure are in [`docs/RUNBOOK.md`](docs/RUNBOOK.md). Free Atlas clusters
need Network Access `0.0.0.0/0` (Render's free tier has no fixed IP). The
app's CSP `connect-src` in `client/vercel.json` names the API host, and the
Vercel URL must be in the API's `CORS_ORIGINS`.

## Known limitations

- **Live signup** needs a real SMS provider (`OTP_PROVIDER=africastalking`); it
  is not switched on yet, so OTP signup and PIN reset do not work on the live
  URL.
- **Escrow** is sandbox only and has not been run against the real MTN sandbox
  (no keys yet); the fake provider and stubbed request shapes are tested. One
  payment covers the whole price (the materials amount is shown, not paid
  separately); no 72-hour auto-release; disputes are settled through admin API
  routes, with no admin screen.
- **Pilot tooling** from the ethics form is not built yet: participant IDs,
  event logs, a deletion script, in-app SUS and ranking-preference questions.
- **Not installable as a PWA yet**: no web manifest, service worker or
  favicon. No meta description; `/robots.txt` is served the app page.
- **Render free tier**: one instance; rate limits are in memory and reset on
  restart; the instance sleeps when idle.
- **Trust defaults** are lambda 0.5, depth 3. Held-out tuning on Bitcoin OTC
  chose lambda 1.5, depth 2; switching is a research decision.

## Design system

Tokens (colour, Inter type scale, radii, shadows) live in
`client/tailwind.config.js` and `client/src/styles/index.css` (dark mode swaps
the CSS variables). Shared components are in `client/src/components/ui/`
(Button, Chip, Badge, TierBadge, Card, FormField, Avatar, Switch, TabBar,
PageLayout, Sheet, StarRating, ...). Text on the green `signal` colour uses
`on-signal` rather than white, which fails contrast.

## Submission archive

```bash
bash scripts/makeSubmissionZip.sh     # writes middleman-submission.zip without node_modules, .env, data/ or .git
```
