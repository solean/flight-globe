import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'flights.db');
const AIRPORTS_PATH = path.join(DATA_DIR, 'airports.json');
const FLIGHTS_PATH = path.join(DATA_DIR, 'flights.csv');

function loadAirports() {
  if (!fs.existsSync(AIRPORTS_PATH)) {
    throw new Error(`Missing ${AIRPORTS_PATH}`);
  }
  const raw = JSON.parse(fs.readFileSync(AIRPORTS_PATH, 'utf8'));
  return Object.entries(raw).map(([code, value]) => ({
    code,
    name: String(value.name),
    lat: Number(value.lat),
    lng: Number(value.lng)
  }));
}

function loadFlights() {
  if (!fs.existsSync(FLIGHTS_PATH)) {
    throw new Error(`Missing ${FLIGHTS_PATH}`);
  }
  const text = fs.readFileSync(FLIGHTS_PATH, 'utf8');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines.shift();
  if (!header) return [];
  const columns = header.split(',').map(col => col.trim());

  const flights = [];
  for (const line of lines) {
    const values = line.split(',');
    if (values.length < columns.length) {
      continue;
    }
    const record = Object.fromEntries(columns.map((col, idx) => [col, values[idx] ?? '']));
    const src = (record.src || '').trim().toLowerCase();
    const dest = (record.dest || '').trim().toLowerCase();
    if (!src || !dest) continue;
    flights.push({
      date: (record.date || '').trim() || null,
      src,
      dest,
      flightno: (record.flightno || '').trim() || null
    });
  }

  return flights;
}

function initDatabase() {
  const airports = loadAirports();
  const flights = loadFlights();

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);
  db.exec(
    `
    PRAGMA foreign_keys = ON;
    CREATE TABLE airports (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL
    );
    CREATE TABLE flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      src TEXT NOT NULL REFERENCES airports(code),
      dest TEXT NOT NULL REFERENCES airports(code),
      flight_number TEXT
    );
    `
  );

  const insertAirport = db.prepare(
    'INSERT INTO airports (code, name, latitude, longitude) VALUES (@code, @name, @lat, @lng)'
  );
  const insertFlight = db.prepare(
    'INSERT INTO flights (date, src, dest, flight_number) VALUES (@date, @src, @dest, @flightno)'
  );

  const airportTxn = db.transaction(rows => {
    for (const row of rows) {
      insertAirport.run(row);
    }
  });

  const flightTxn = db.transaction(rows => {
    for (const row of rows) {
      insertFlight.run(row);
    }
  });

  airportTxn(airports);
  flightTxn(flights);

  console.log(`Created ${DB_PATH} with ${airports.length} airports and ${flights.length} flights.`);
}

initDatabase();
