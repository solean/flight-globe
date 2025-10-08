import path from 'node:path';
import Database from 'better-sqlite3';
import type { Database as DatabaseInstance } from 'better-sqlite3';

type AirportRow = {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
};

type FlightRow = {
  id: number;
  date: string | null;
  src: string;
  dest: string;
  flight_number: string | null;
};

let dbInstance: DatabaseInstance | null = null;

function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    const dbPath = path.join(process.cwd(), 'data', 'flights.db');
    dbInstance = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return dbInstance;
}

export function getAirports() {
  const db = getDatabase();
  return db
    .prepare<[], AirportRow>('SELECT code, name, latitude, longitude FROM airports ORDER BY code')
    .all()
    .map(row => ({
      code: row.code,
      name: row.name,
      lat: row.latitude,
      lng: row.longitude
    }));
}

export function getFlights() {
  const db = getDatabase();
  return db
    .prepare<[], FlightRow>('SELECT id, date, src, dest, flight_number FROM flights ORDER BY date')
    .all()
    .map(row => ({
      id: row.id,
      date: row.date,
      src: row.src,
      dest: row.dest,
      flightno: row.flight_number
    }));
}
