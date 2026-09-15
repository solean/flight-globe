import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, 'data');
export const SAMPLE_DIR = path.join(DATA_DIR, 'sample');

export const FLIGHTS_FILE = 'flights.csv';
export const AIRPORTS_FILE = 'airports.json';

const API = 'https://api.github.com';

// Next loads .env.local for the app; these scripts run outside it.
try {
  process.loadEnvFile(path.join(ROOT, '.env.local'));
} catch {
  // no .env.local (CI/Vercel supplies real env vars)
}

/**
 * Private data repo holding the real flight log, e.g. "solean/flight-data".
 * Nothing here is secret: access is gated by the token, not by the name.
 */
export function dataRepo() {
  return process.env.FLIGHT_DATA_REPO || '';
}

/** Empty means "whatever the data repo's default branch is". */
export function dataRef() {
  return process.env.FLIGHT_DATA_REF || '';
}

/** Human-readable source label, e.g. "solean/flight-data" or "…@some-branch". */
export function originLabel(repo = dataRepo(), ref = dataRef()) {
  return ref ? `${repo}@${ref}` : repo;
}

/**
 * FLIGHT_DATA_TOKEN in CI/Vercel; otherwise the local gh session, so a
 * developer machine never needs a PAT lying around in a dotfile.
 */
export function dataToken() {
  if (process.env.FLIGHT_DATA_TOKEN) return process.env.FLIGHT_DATA_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return ''; // gh absent or logged out
  }
}

async function gh(url, { token, accept = 'application/vnd.github+json', method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub ${method} ${url} failed: ${res.status} ${res.statusText} ${detail.slice(0, 300)}`);
  }
  return res;
}

export async function fetchDataFile(file, { repo = dataRepo(), ref = dataRef(), token = dataToken() } = {}) {
  const url = `${API}/repos/${repo}/contents/${file}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;
  const res = await gh(url, { token, accept: 'application/vnd.github.raw' });
  return res.text();
}

export async function putDataFile(file, content, { repo = dataRepo(), ref = dataRef(), token = dataToken(), message } = {}) {
  let sha;
  try {
    const head = await gh(`${API}/repos/${repo}/contents/${file}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`, { token });
    sha = (await head.json()).sha;
  } catch {
    sha = undefined; // new file
  }
  const res = await gh(`${API}/repos/${repo}/contents/${file}`, {
    token,
    method: 'PUT',
    body: {
      message: message || `update ${file}`,
      content: Buffer.from(content, 'utf8').toString('base64'),
      ...(ref ? { branch: ref } : {}),
      ...(sha ? { sha } : {})
    }
  });
  return res.json();
}

/**
 * Source of truth is the private repo. Local files are a cache for offline
 * builds; the bundled sample keeps a fresh public clone runnable.
 */
export async function loadSources({ preferLocal = false } = {}) {
  const repo = dataRepo();
  const token = dataToken();
  const localFlights = path.join(DATA_DIR, FLIGHTS_FILE);
  const localAirports = path.join(DATA_DIR, AIRPORTS_FILE);
  const haveLocal = fs.existsSync(localFlights) && fs.existsSync(localAirports);

  if (repo && token && !(preferLocal && haveLocal)) {
    const [flightsCsv, airportsJson] = await Promise.all([
      fetchDataFile(FLIGHTS_FILE, { repo, token }),
      fetchDataFile(AIRPORTS_FILE, { repo, token })
    ]);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(localFlights, flightsCsv);
    fs.writeFileSync(localAirports, airportsJson);
    return { origin: originLabel(repo), flightsCsv, airportsJson };
  }

  if (haveLocal) {
    return {
      origin: repo ? 'local cache (no token; run `npm run data:pull` when online)' : 'local files',
      flightsCsv: fs.readFileSync(localFlights, 'utf8'),
      airportsJson: fs.readFileSync(localAirports, 'utf8')
    };
  }

  return {
    origin: 'bundled sample data',
    sample: true,
    flightsCsv: fs.readFileSync(path.join(SAMPLE_DIR, FLIGHTS_FILE), 'utf8'),
    airportsJson: fs.readFileSync(path.join(SAMPLE_DIR, AIRPORTS_FILE), 'utf8')
  };
}

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
 * Parses + validates the log. Replaces the old SQLite FOREIGN KEY check with
 * an error that names the offending codes instead of dying as SQLITE_CONSTRAINT.
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
