# Flights Globe (Next.js)

This is a web project that displays my flight data on a globe. Airports and flights are stored in a SQLite database and served via API routes so the app can be deployed (e.g. to Vercel) without hardcoding data in the client bundle.

## Getting started

```bash
npm install
npm run db:init
npm run dev
```

Then open http://localhost:3000 to view the globe.

The `npm run db:init` script regenerates `data/flights.db` from the source files in `data/airports.json` and `data/flights.csv`. Re-run it whenever you update the seed data.

## Deployment notes

- The project uses the Next.js App Router and keeps the SQLite database in `data/flights.db`. Because the database is read-only at runtime, committing it to the repo works for deployment to Vercel.
- If you prefer rebuilding the database during CI, ensure your build environment has Node.js native module support for `better-sqlite3`.
- The REST API is exposed at `/api/airports` and `/api/flights`.

## Scripts

- `npm run dev` – start the Next.js dev server.
- `npm run build` / `npm run start` – build and serve production output.
- `npm run lint` – run Next.js linting.
- `npm run db:init` – regenerate the SQLite database from source data.
