#!/usr/bin/env python3
"""Simple HTTP server that exposes flights data from a SQLite database."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "flights.db"


def db_rows(query: str, params=()):
    if not DB_PATH.exists():
        raise RuntimeError("flights.db is missing; run scripts/init_db.py first")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.execute(query, params)
        return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def fetch_airports():
    return db_rows(
        "SELECT code, name, latitude AS lat, longitude AS lng FROM airports ORDER BY code"
    )


def fetch_flights():
    return db_rows(
        "SELECT id, date, src, dest, flight_number AS flightno FROM flights ORDER BY date"
    )


class FlightsRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/airports":
            self._send_json(fetch_airports())
            return
        if parsed.path == "/api/flights":
            self._send_json(fetch_flights())
            return

        super().do_GET()

    def _send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run(port: int = 8001):
    server = ThreadingHTTPServer(("0.0.0.0", port), FlightsRequestHandler)
    print(f"Serving on http://localhost:{port} (database: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
