#!/usr/bin/env node
/**
 * Build step: validates data/flights.csv against data/airports.json,
 * data/countries.json and data/airlines.json, then writes data/flights.json for
 * the app to import. Runs via predev/prebuild.
 *
 * `--fmt` instead rewrites the CSV and the reference tables in canonical form:
 * ISO dates, lowercase codes, chronological order, keys sorted.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FLIGHTS_CSV = path.join(DATA_DIR, 'flights.csv');
const AIRPORTS_JSON = path.join(DATA_DIR, 'airports.json');
const COUNTRIES_JSON = path.join(DATA_DIR, 'countries.json');
const AIRLINES_JSON = path.join(DATA_DIR, 'airlines.json');
const OUT = path.join(DATA_DIR, 'flights.json');

const CONTINENTS = new Set(['af', 'an', 'as', 'eu', 'na', 'oc', 'sa']);

/** `{ "dk": { "name": "Denmark", "continent": "eu" } }` keyed by ISO 3166-1 alpha-2. */
export function parseCountries(json) {
  const raw = JSON.parse(json);
  return Object.entries(raw).map(([code, value]) => {
    const iso = code.trim().toLowerCase();
    if (!/^[a-z]{2}$/.test(iso)) {
      throw new Error(`countries.json: "${code}" is not an ISO 3166-1 alpha-2 code`);
    }
    const continent = String(value.continent || '').toLowerCase();
    if (!CONTINENTS.has(continent)) {
      throw new Error(`countries.json: "${iso}" has unknown continent "${value.continent}" (${[...CONTINENTS].join(', ')})`);
    }
    return { code: iso, name: String(value.name), continent };
  });
}

/** `{ "dl": { "name": "Delta Air Lines", "country": "us" } }` keyed by IATA carrier code. */
export function parseAirlines(json, countries) {
  const knownCountry = new Set(countries.map(c => c.code));
  const raw = JSON.parse(json);
  return Object.entries(raw).map(([code, value]) => {
    const carrier = code.trim().toLowerCase();
    if (!/^[a-z0-9]{2}$/.test(carrier)) {
      throw new Error(`airlines.json: "${code}" is not a two-character IATA carrier code`);
    }
    const country = String(value.country || '').toLowerCase();
    if (!knownCountry.has(country)) {
      throw new Error(`airlines.json: "${carrier}" has unknown country "${value.country}" (add it to countries.json)`);
    }
    return { code: carrier, name: String(value.name), country };
  });
}

/** `b62101` -> `b6`, `7c131` -> `7c`, bare `3190` -> null (unknown operator). */
export function parseCarrier(flightno) {
  const match = /^([a-z]{2}|[a-z]\d|\d[a-z])\d{1,4}[a-z]?$/.exec((flightno || '').trim().toLowerCase());
  return match ? match[1] : null;
}

export function parseAirports(json, countries) {
  const knownCountry = new Set(countries.map(c => c.code));
  const raw = JSON.parse(json);
  return Object.entries(raw).map(([code, value]) => {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`airports.json: "${code}" has non-numeric coordinates`);
    }
    const country = String(value.country || '').toLowerCase();
    if (!knownCountry.has(country)) {
      throw new Error(`airports.json: "${code}" has unknown country "${value.country}" (add it to countries.json)`);
    }
    return {
      code: code.trim().toLowerCase(),
      name: String(value.name),
      city: String(value.city),
      country,
      lat,
      lng
    };
  });
}

/** Accepts ISO `YYYY-MM-DD` plus the legacy `M/D/YY` and `M/D/YYYY` forms. */
export function normalizeDate(value) {
  const raw = (value || '').trim();
  if (!raw) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw);
  let y;
  let m;
  let d;
  if (iso) {
    [, y, m, d] = iso.map(Number);
  } else if (us) {
    m = Number(us[1]);
    d = Number(us[2]);
    y = Number(us[3]);
    if (y < 100) y += 2000;
  } else {
    throw new Error(`unrecognized date "${raw}" (use YYYY-MM-DD)`);
  }

  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`impossible date "${raw}"`);
  }
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parses + validates the log, reporting every problem at once with line
 * numbers. This is the check SQLite used to make as a FOREIGN KEY constraint.
 */
export function parseFlights(csv, airports, airlines) {
  const known = new Set(airports.map(a => a.code));
  const knownCarrier = new Set(airlines.map(a => a.code));
  const unknownCarriers = [];
  const lines = csv.split(/\r?\n/);
  const problems = [];
  const rows = [];

  let columns = null;
  lines.forEach((line, index) => {
    const text = line.trim();
    if (!text) return;
    const values = text.split(',').map(v => v.trim());

    if (!columns) {
      columns = values.map(v => v.toLowerCase());
      for (const required of ['date', 'src', 'dest']) {
        if (!columns.includes(required)) problems.push(`header is missing required column "${required}"`);
      }
      return;
    }

    const lineNo = index + 1;
    const record = Object.fromEntries(columns.map((col, i) => [col, values[i] ?? '']));
    const src = record.src.toLowerCase();
    const dest = record.dest.toLowerCase();

    if (!src || !dest) {
      problems.push(`line ${lineNo}: missing src/dest ("${text}")`);
      return;
    }
    if (!known.has(src)) problems.push(`line ${lineNo}: unknown airport code "${src}" (add it to airports.json)`);
    if (!known.has(dest)) problems.push(`line ${lineNo}: unknown airport code "${dest}" (add it to airports.json)`);

    let date;
    try {
      date = normalizeDate(record.date);
    } catch (err) {
      problems.push(`line ${lineNo}: ${err.message}`);
      return;
    }

    const flightno = record.flightno || null;
    const carrier = parseCarrier(flightno);
    if (flightno && (!carrier || !knownCarrier.has(carrier))) {
      unknownCarriers.push(`line ${lineNo}: "${flightno}"`);
    }

    rows.push({ date, src, dest, flightno, carrier: carrier && knownCarrier.has(carrier) ? carrier : null });
  });

  if (problems.length) {
    throw new Error(`flights.csv has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  }

  if (unknownCarriers.length) {
    console.warn(
      `build-data: ${unknownCarriers.length} flight number(s) with no known carrier prefix — add the code to airlines.json:\n  - ${unknownCarriers.join('\n  - ')}`
    );
  }

  rows.sort((a, b) => (a.date === b.date ? 0 : (a.date || '') < (b.date || '') ? -1 : 1));
  return rows.map((row, i) => ({ id: i + 1, ...row }));
}

for (const file of [FLIGHTS_CSV, AIRPORTS_JSON, COUNTRIES_JSON, AIRLINES_JSON]) {
  if (!fs.existsSync(file)) {
    console.error(`build-data: missing ${path.relative(process.cwd(), file)}`);
    process.exit(1);
  }
}

const byCode = (rows, project) =>
  Object.fromEntries(rows.slice().sort((a, b) => a.code.localeCompare(b.code)).map(row => [row.code, project(row)]));

const countries = parseCountries(fs.readFileSync(COUNTRIES_JSON, 'utf8')).sort((a, b) => a.code.localeCompare(b.code));
const airlines = parseAirlines(fs.readFileSync(AIRLINES_JSON, 'utf8'), countries).sort((a, b) => a.code.localeCompare(b.code));
const airports = parseAirports(fs.readFileSync(AIRPORTS_JSON, 'utf8'), countries).sort((a, b) => a.code.localeCompare(b.code));
const flights = parseFlights(fs.readFileSync(FLIGHTS_CSV, 'utf8'), airports, airlines);

if (process.argv.includes('--fmt')) {
  const csv = ['date,src,dest,flightno']
    .concat(flights.map(f => [f.date, f.src, f.dest, f.flightno ?? ''].join(',')))
    .join('\n');
  fs.writeFileSync(FLIGHTS_CSV, `${csv}\n`);
  fs.writeFileSync(
    AIRPORTS_JSON,
    `${JSON.stringify(byCode(airports, a => ({ city: a.city, country: a.country, lat: a.lat, lng: a.lng, name: a.name })), null, 2)}\n`
  );
  fs.writeFileSync(
    COUNTRIES_JSON,
    `${JSON.stringify(byCode(countries, c => ({ continent: c.continent, name: c.name })), null, 2)}\n`
  );
  fs.writeFileSync(
    AIRLINES_JSON,
    `${JSON.stringify(byCode(airlines, a => ({ country: a.country, name: a.name })), null, 2)}\n`
  );
  console.log(
    `build-data: canonicalized ${flights.length} flights, ${airports.length} airports, ${countries.length} countries, ${airlines.length} airlines`
  );
}

fs.writeFileSync(OUT, `${JSON.stringify({ airports, flights, countries, airlines }, null, 2)}\n`);
console.log(
  `build-data: ${flights.length} flights, ${airports.length} airports, ${countries.length} countries, ${airlines.length} airlines -> data/flights.json`
);
