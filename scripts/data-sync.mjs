#!/usr/bin/env node
/**
 * Moves the flight log between this machine and the private data repo.
 *
 *   npm run data:pull   private repo -> data/ (local cache)
 *   npm run data:push   data/ -> private repo (validated + canonicalized first)
 *
 * Editing from another machine or a phone needs neither: edit flights.csv in
 * the private repo on github.com and redeploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  AIRPORTS_FILE,
  DATA_DIR,
  FLIGHTS_FILE,
  originLabel,
  dataRepo,
  dataToken,
  fetchDataFile,
  parseAirports,
  parseFlights,
  putDataFile
} from './data-source.mjs';

const mode = process.argv[2];
const repo = dataRepo();
const token = dataToken();

if (mode !== 'pull' && mode !== 'push') {
  console.error('usage: data-sync.mjs <pull|push>');
  process.exit(2);
}
if (!repo) {
  console.error('FLIGHT_DATA_REPO is not set (expected e.g. "owner/flight-data"). Add it to .env.local.');
  process.exit(1);
}
if (!token) {
  console.error('No credentials: set FLIGHT_DATA_TOKEN or run `gh auth login`.');
  process.exit(1);
}

const flightsPath = path.join(DATA_DIR, FLIGHTS_FILE);
const airportsPath = path.join(DATA_DIR, AIRPORTS_FILE);

/** Canonical on-disk form: ISO dates, lowercase codes, chronological. */
function canonicalize(flightsCsv, airportsJson) {
  const airports = parseAirports(airportsJson);
  const flights = parseFlights(flightsCsv, airports);
  const csv = ['date,src,dest,flightno']
    .concat(flights.map(f => [f.date, f.src, f.dest, f.flightno ?? ''].join(',')))
    .join('\n');
  const byCode = Object.fromEntries(
    airports
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(a => [a.code, { lat: a.lat, lng: a.lng, name: a.name }])
  );
  return { csv: `${csv}\n`, json: `${JSON.stringify(byCode, null, 2)}\n`, flights, airports };
}

if (mode === 'pull') {
  const [flightsCsv, airportsJson] = await Promise.all([
    fetchDataFile(FLIGHTS_FILE, { repo, token }),
    fetchDataFile(AIRPORTS_FILE, { repo, token })
  ]);
  const { flights, airports } = canonicalize(flightsCsv, airportsJson);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(flightsPath, flightsCsv);
  fs.writeFileSync(airportsPath, airportsJson);
  console.log(`data:pull  ${flights.length} flights, ${airports.length} airports from ${originLabel(repo)}`);
} else {
  for (const file of [flightsPath, airportsPath]) {
    if (!fs.existsSync(file)) {
      console.error(`Missing ${path.relative(process.cwd(), file)} — nothing to push.`);
      process.exit(1);
    }
  }
  const { csv, json, flights, airports } = canonicalize(
    fs.readFileSync(flightsPath, 'utf8'),
    fs.readFileSync(airportsPath, 'utf8')
  );
  fs.writeFileSync(flightsPath, csv);
  fs.writeFileSync(airportsPath, json);

  const message = `update flight log (${flights.length} flights, ${airports.length} airports)`;
  await putDataFile(FLIGHTS_FILE, csv, { repo, token, message });
  await putDataFile(AIRPORTS_FILE, json, { repo, token, message });
  console.log(`data:push  ${flights.length} flights, ${airports.length} airports -> ${originLabel(repo)}`);
}
