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
| `0788000001` | Client | Amina, Kimironko | Discover → Electrician shows all three trust tiers |
| `0788000004` | Client | Jean Paul, Gikondo | Same search, different personalised ranking |
| `0788000103` | Worker | Jean Bosco, Gikondo electrician | Open jobs near you |
| `0788000104` | Worker | Emmanuel, Kwa Nayinzira electrician | Open jobs near you |

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

- **Data models** (`server/models/`) — matches the ERD in Chapter 3 of the proposal:
  User, Job, Quote, Transaction, Rating, TrustEdge.
- **Trust propagation algorithm** (`server/services/trustPropagation.js`) — the
  actual decay-weighted BFS traversal described in Section 3.2.3, including the
  `referredFlag` boost and bidirectional rating support.
- **Area-level trust fallback** (`server/routes/discover.js`) — workers the
  client's graph can't reach are scored by ratings from their own area, before
  falling back to the verification floor (path → area → floor, Section 3.2.3).
- **Seed script** (`server/seed.js`) — 16 users across Kimironko, Kwa Nayinzira,
  Remera and Gikondo, with completed and rated jobs plus open jobs.
- **Discover page** (`client/src/pages/Discover.jsx`) — trust-ranked worker
  search.
- **Demo login + role routing** — log in with a seeded phone number
  (`POST /api/auth/login`, no password; not production security). Clients land
  on Discover / Post a job, workers on "Open jobs near you" (`/jobs`), a
  read-only list of open jobs matching their skills and area.
- **Post Job** — submits to `POST /api/jobs` as the logged-in client, with an
  optional budget in RWF. The confirmation names the workers who can now see it
  (same skill + same area), and the page lists the client's own posted jobs.
- **Landing page** — hero and "how it works" explainer.
- **Post Job page** — form scaffold, not yet wired to the API.

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

- Quote submission + accept flow
- Escrow/Paypack integration
- Rating submission UI (backend route exists: `POST /api/ratings`)
- The synthetic dataset generator described in Chapter 3, Section 3.2.1/3.2.2

## Design system

Palette and type choices are documented inline in `client/tailwind.config.js`.
Grounded in the actual materials of the trades this serves (steel roofing,
brick, work-wear) rather than a generic SaaS look — see the proposal's
Chapter 3 if you need to explain the rationale to David.
