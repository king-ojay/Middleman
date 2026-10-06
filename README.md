# Middleman

Graph-based trust propagation platform for informal/blue-collar service discovery
in Kigali, Rwanda. Built for the Mission Capstone project — see `/docs` for the
full research proposal this implements.

## Live demo

- **App:** https://middleman-client.vercel.app
- **API:** https://middleman-api-74zb.onrender.com/api/health (free tier, so the
  first request after idle can take ~50s while it wakes up)

Log in with a seeded phone number (no password, demo only):

| Phone | Role | Who | What you'll see |
|---|---|---|---|
| `0788000001` | Client | Amina, Kimironko | My jobs → "Install ceiling fan": three responses ranked by trust, not price |
| `0788000004` | Client | Jean Paul, Gikondo | Discover: same search, different personalised ranking |
| `0788000101` | Worker | Eric, Kimironko electrician | Open jobs: accept or counter; the client's trust tier on each job |
| `0788000118` | Worker | Moses, Kimironko electrician | Area-trusted responder on Amina's job |
| `0788000119` | Worker | Ange, Kimironko electrician | New worker, cheapest offer, still ranked last |
| `0788000111` | Worker | Theoneste, Kimironko carpenter | My jobs: already chosen, can "Start job" |

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
  Quote, Transaction, Rating, TrustEdge. Job and Quote live in
  `server/modules/jobs/`; the rest move into domain modules phase by phase (NFR-08).
- **Trust propagation algorithm** (`server/services/trustPropagation.js`) — the
  actual decay-weighted BFS traversal described in Section 3.2.3, including the
  `referredFlag` boost and bidirectional rating support.
- **Layered ranking** (`rankByTrust` in `server/services/trustPropagation.js`) —
  users the viewer's graph can't reach are scored by ratings from their own
  area, then the verification floor (path → area → floor, Section 3.2.3). The
  same call ranks workers for a client and clients for a worker.
- **Seed script** (`server/seed.js`) — 25 users across Kimironko, Kwa Nayinzira,
  Remera and Gikondo and 12 trades, with 16 completed and rated jobs, 29 open
  jobs, worker responses, and one job with a worker already chosen. Areas and trades are defined once in `server/config/` (models)
  and `client/src/options.js` (dropdowns and labels).
- **Discover page** (`client/src/pages/Discover.jsx`) — trust-ranked worker
  search.
- **Demo login + role routing** — log in with a seeded phone number
  (`POST /api/auth/login`, no password; not production security). API calls
  identify the user with an `x-user-id` header until Phase 7 adds a PIN.
- **Client-anchored bidding** (Section 3.3.3, FR-04/05/05b) — the client posts a
  job with a proposed price; each matching worker accepts it or sends one
  counter-amount, optionally with a materials deposit; the client sees every
  response ranked by trust and chooses one, which fixes the agreed price.
- **Job lifecycle** (`server/modules/jobs/lifecycle.js`, Fig. 5) —
  `open → quote_accepted → in_progress → awaiting_confirmation → completed`,
  with `disputed` reachable from in progress or awaiting confirmation. The
  worker starts and marks complete; the client confirms. Until escrow lands
  (Phase 3), the worker's "Start job" stands in for escrow funding.
- **Screens** — workers: *Open jobs near you* (accept / make an offer, with the
  client's trust tier) and *My jobs*. Clients: *Post a job*, *My jobs*, and a
  job page with trust-ranked responses. Every core flow is 4 steps or fewer.
- **Landing page** — hero and "how it works" explainer.

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
   and prompts for `MONGO_URI`; paste the Atlas string there. Check
   `https://<service>.onrender.com/api/health` returns `{"status":"ok"}`.
   Free services sleep when idle, so the first request can take ~50s.
4. **Vercel** — Add New → Project → import this repo, set **Root Directory**
   to `client` (Vite is auto-detected), and add the environment variable
   `VITE_API_URL=https://<service>.onrender.com` (no trailing slash). Deploy.
   `client/vercel.json` makes deep links like `/discover` work.

## Not built yet (next steps)

- Ratings, referrals and registration (Phase 2)
- Escrow/Paypack sandbox integration (Phase 3)
- The synthetic dataset generator described in Chapter 3, Section 3.2.1/3.2.2

## Design system

Palette and type choices are documented inline in `client/tailwind.config.js`.
Grounded in the actual materials of the trades this serves (steel roofing,
brick, work-wear) rather than a generic SaaS look — see the proposal's
Chapter 3 if you need to explain the rationale to David.
