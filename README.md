# Middleman

Graph-based trust propagation platform for informal/blue-collar service discovery
in Kigali, Rwanda. Built for the Mission Capstone project — see `/docs` for the
full research proposal this implements.

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
- **Landing page** — hero and "how it works" explainer.
- **Post Job page** — form scaffold, not yet wired to the API.

## Not built yet (next steps)

- Wiring PostJob's form to `POST /api/jobs`
- Quote submission + accept flow
- Escrow/Paypack integration
- Rating submission UI (backend route exists: `POST /api/ratings`)
- The synthetic dataset generator described in Chapter 3, Section 3.2.1/3.2.2

## Design system

Palette and type choices are documented inline in `client/tailwind.config.js`.
Grounded in the actual materials of the trades this serves (steel roofing,
brick, work-wear) rather than a generic SaaS look — see the proposal's
Chapter 3 if you need to explain the rationale to David.
