#!/usr/bin/env python3
"""Initialize the SQLite database used by the flights globe demo."""

import csv
import json
import sqlite3
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "flights.db"
AIRPORTS_JS = ROOT / "airports.js"
FLIGHTS_CSV = ROOT / "data.csv"


def load_airports():
    """Extract airport metadata from the legacy airports.js file via Node."""
    if not AIRPORTS_JS.exists():
        raise SystemExit(f"Missing {AIRPORTS_JS} – cannot seed airports table")

    node_script = (
        "global.window = {};"
        "require('./airports.js');"
        "console.log(JSON.stringify(window.AIRPORTS));"
    )

    try:
        output = subprocess.check_output(
            ["node", "-e", node_script],
            cwd=ROOT,
            text=True,
        )
    except FileNotFoundError as exc:
        raise SystemExit("Node.js is required to extract airport data") from exc

    try:
        airports = json.loads(output)
    except json.JSONDecodeError as exc:
        raise SystemExit("Failed to parse airport data from airports.js") from exc

    return airports


def load_flights():
    """Load flight rows from the legacy CSV file."""
    if not FLIGHTS_CSV.exists():
        raise SystemExit(f"Missing {FLIGHTS_CSV} – cannot seed flights table")

    flights = []
    with FLIGHTS_CSV.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            src = (row.get("src") or "").strip().lower()
            dest = (row.get("dest") or "").strip().lower()
            if not src or not dest:
                continue

            flights.append(
                {
                    "date": (row.get("date") or "").strip() or None,
                    "src": src,
                    "dest": dest,
                    "flightno": (row.get("flightno") or "").strip() or None,
                }
            )

    return flights


def create_schema(conn: sqlite3.Connection):
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        DROP TABLE IF EXISTS flights;
        DROP TABLE IF EXISTS airports;

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
        """
    )


def seed_airports(conn: sqlite3.Connection, airports: dict):
    rows = [
        (code, data["name"], float(data["lat"]), float(data["lng"]))
        for code, data in sorted(airports.items())
    ]
    conn.executemany(
        "INSERT INTO airports (code, name, latitude, longitude) VALUES (?, ?, ?, ?)",
        rows,
    )


def seed_flights(conn: sqlite3.Connection, flights: list):
    rows = [
        (item["date"], item["src"], item["dest"], item["flightno"])
        for item in flights
    ]
    conn.executemany(
        "INSERT INTO flights (date, src, dest, flight_number) VALUES (?, ?, ?, ?)",
        rows,
    )


def main():
    airports = load_airports()
    flights = load_flights()

    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    try:
        create_schema(conn)
        seed_airports(conn, airports)
        seed_flights(conn, flights)
        conn.commit()
    finally:
        conn.close()

    print(f"Created {DB_PATH} with {len(airports)} airports and {len(flights)} flights")


if __name__ == "__main__":
    main()
