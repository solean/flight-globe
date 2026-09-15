# Flights Globe (Next.js)

Web app that plots my flight history on an interactive globe.

## Where the data lives

The flight log is **not** in this repo. This repo is public; the log is private.

| | |
| --- | --- |
| Source of truth | `flights.csv` + `airports.json` in a private data repo (`FLIGHT_DATA_REPO`) |
| Build input | `scripts/build-data.mjs` fetches, validates, and writes `data/flights.json` |
| Runtime | `lib/flight-data.js` imports that JSON — no database, no native modules, no runtime filesystem access |
| Public fallback | `data/sample/` so a fresh clone runs without access to the private log |

`data/flights.csv`, `data/airports.json`, and `data/flights.json` are gitignored. The
first two are a local cache of the private repo; the third is generated.

## Getting started

```bash
npm install
npm run dev          # predev regenerates data/flights.json first
```

Without `FLIGHT_DATA_REPO` (or without access to it) the build falls back to the
sample data in `data/sample/` and says so.

## Editing the flight log

**From anywhere:** edit `flights.csv` in the private data repo on github.com and
redeploy. Nothing is machine-specific.

**From a checkout:**

```bash
npm run data:pull    # private repo -> data/flights.csv, data/airports.json
$EDITOR data/flights.csv
npm run data:push    # validate, canonicalize, commit back to the private repo
npm run dev
```

`data:push` refuses to upload a log that fails validation, and rewrites the files
in canonical form first: ISO `YYYY-MM-DD` dates, lowercase airport codes,
chronological order, airports sorted by code.

CSV columns are `date,src,dest,flightno`. A new airport code must exist in
`airports.json` or the build fails with the offending line numbers — the check
that used to be a SQLite `FOREIGN KEY` constraint.

## Deployment (Vercel)

1. Environment variables on the app project:
   - `FLIGHT_DATA_REPO` — e.g. `solean/flight-data`
   - `FLIGHT_DATA_TOKEN` — fine-grained PAT, read-only `Contents` on that repo only
   - `FLIGHT_DATA_REF` — optional; defaults to the data repo's default branch
2. The API routes are statically prerendered at build time, so **updating the log
   requires a redeploy**. To automate: create a Vercel Deploy Hook and call it from
   a push workflow in the private data repo.
3. `/api/flights` serves the full log to anyone who can reach the site. If the data
   should stay private, enable Vercel password protection (or auth) on the deployment.

## Scripts

- `npm run dev` / `npm run build` – `predev`/`prebuild` regenerate `data/flights.json` first.
- `npm run data:build` – regenerate `data/flights.json` only.
- `npm run data:pull` / `npm run data:push` – sync the log with the private data repo.
- `npm run lint` – Next.js lint.

Local `data:pull`/`data:push` authenticate with your `gh auth token`; only CI needs
`FLIGHT_DATA_TOKEN`.
