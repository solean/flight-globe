#!/usr/bin/env node
/**
 * Build step: validates data/flights.csv against data/airports.json and writes
 * data/flights.json for the app to import. Runs via predev/prebuild.
 *
 * `--fmt` instead rewrites the CSV and airports.json in canonical form:
 * ISO dates, lowercase codes, chronological order, airports sorted by code.
 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FLIGHTS_CSV = path.join(DATA_DIR, 'flights.csv');
const AIRPORTS_JSON = path.join(DATA_DIR, 'airports.json');
const OUT = path.join(DATA_DIR, 'flights.json');

export function parseAirports(json) {
  const raw = JSON.parse(json);
  return Object.entries(raw).map(([code, value]) => {
    const lat = Number(value.lat);
    const lng = Number(value.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error(`airports.json: "${code}" has non-numeric coordinates`);
    }
    return { code: code.trim().toLowerCase(), name: String(value.name), lat, lng };
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
export function parseFlights(csv, airports) {
  const known = new Set(airports.map(a => a.code));
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

    rows.push({ date, src, dest, flightno: record.flightno || null });
  });

  if (problems.length) {
    throw new Error(`flights.csv has ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
  }

  rows.sort((a, b) => (a.date === b.date ? 0 : (a.date || '') < (b.date || '') ? -1 : 1));
  return rows.map((row, i) => ({ id: i + 1, ...row }));
}

for (const file of [FLIGHTS_CSV, AIRPORTS_JSON]) {
  if (!fs.existsSync(file)) {
    console.error(`build-data: missing ${path.relative(process.cwd(), file)}`);
    process.exit(1);
  }
}

const airports = parseAirports(fs.readFileSync(AIRPORTS_JSON, 'utf8')).sort((a, b) => a.code.localeCompare(b.code));
const flights = parseFlights(fs.readFileSync(FLIGHTS_CSV, 'utf8'), airports);

if (process.argv.includes('--fmt')) {
  const csv = ['date,src,dest,flightno']
    .concat(flights.map(f => [f.date, f.src, f.dest, f.flightno ?? ''].join(',')))
    .join('\n');
  const byCode = Object.fromEntries(airports.map(a => [a.code, { lat: a.lat, lng: a.lng, name: a.name }]));
  fs.writeFileSync(FLIGHTS_CSV, `${csv}\n`);
  fs.writeFileSync(AIRPORTS_JSON, `${JSON.stringify(byCode, null, 2)}\n`);
  console.log(`build-data: canonicalized ${flights.length} flights, ${airports.length} airports`);
}

fs.writeFileSync(OUT, `${JSON.stringify({ airports, flights }, null, 2)}\n`);
console.log(`build-data: ${flights.length} flights, ${airports.length} airports -> data/flights.json`);
