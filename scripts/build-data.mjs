#!/usr/bin/env node
/**
 * Build step: pulls the flight log from its source, validates it, and writes
 * data/flights.json for the app to import. Runs via predev/prebuild.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, loadSources, parseAirports, parseFlights } from './data-source.mjs';

const OUT = path.join(DATA_DIR, 'flights.json');

const source = await loadSources();
const airports = parseAirports(source.airportsJson).sort((a, b) => a.code.localeCompare(b.code));
const flights = parseFlights(source.flightsCsv, airports);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ airports, flights }, null, 2)}\n`);

if (source.sample) {
  console.warn('build-data: no private data source configured — built from bundled sample data.');
  console.warn('build-data: set FLIGHT_DATA_REPO (+ FLIGHT_DATA_TOKEN in CI) to use the real log.');
}
console.log(`build-data: ${flights.length} flights, ${airports.length} airports from ${source.origin} -> data/flights.json`);
