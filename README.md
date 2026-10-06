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

## Getting started

### Backend
```bash
cd server
cp .env.example .env      # fill in MONGO_URI if not using local default
npm install
npm run seed               # wipes the DB and loads demo users + jobs
npm run dev                # runs on http://localhost:4000
```

No local MongoDB? `docker run -d --name mongo -p 27017:27017 mongo:7` works
with the default `MONGO_URI`.

The seed prints the demo phone numbers. Logged in as Amina (`0788000001`),
searching electricians on Discover shows all three trust tiers: network
(Eric, direct; Claudine, 3 hops), area (Jean Bosco, rated by Gikondo clients)
and new (Emmanuel, never rated).

### Frontend
```bash
cd client
npm install
npm run dev                # runs on http://localhost:5173, proxies /api to :4000
```

Requires MongoDB running locally (`mongod`) or a connection string in `.env`.

## What's built so far

- **Data models** — match the ERD in Chapter 3 of the proposal: User, Job,
  Quote, Transaction, Rating, TrustEdge. Code is organised by domain module
  (NFR-08): `server/modules/{auth,users,jobs,trust}`; payments join in Phase 3.
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
  `open → quote_accepted → in_progress → awaiting_confirmation → completed`,
  with `disputed` reachable from in progress or awaiting confirmation. The
  worker starts and marks complete; the client confirms with a required rating
  and an optional "vouch" (FR-12, FR-17); the worker rates the client
  independently (FR-12b). Every rating writes a trust edge (FR-15). Until
  escrow lands (Phase 3), the worker's "Start job" stands in for escrow funding.
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
4. **Vercel** — Add New → Project → import this repo, set **Root Directory**
   to `client` (Vite is auto-detected), and add the environment variable
   `VITE_API_URL=https://<service>.onrender.com` (no trailing slash). Deploy.
   `client/vercel.json` makes deep links like `/discover` work.

## Not built yet (next steps)

- Escrow through a payment provider sandbox (Phase 3)
- The synthetic dataset generator described in Chapter 3, Section 3.2.1/3.2.2

## Design system

Tokens (colour, Inter type scale, radii, shadows) live in
`client/tailwind.config.js` and are the only source of styling values. Shared
components are in `client/src/components/ui/` (Button, Chip, TierBadge, Card,
FormField, Avatar, Switch, TabBar, PageLayout, Sheet, StarRating, ...); screens
use only these. Text on the green `signal` colour uses `on-signal` (dark
forest) rather than white, which fails contrast.
