'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';

const EARTH_RADIUS_KM = 6371;
const AVERAGE_SPEED_KMH = 900;

interface Airport {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

interface Flight {
  id?: number;
  dateStr: string;
  date: Date | null;
  src: string;
  dest: string;
  flightno?: string | null;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  altitude: number;
  year: number | null;
  distanceKm: number;
}

interface Stats {
  totalFlights: number;
  totalHours: number;
  topAirports: string[];
  topRoute: { a: string; b: string; count: number } | null;
}

function greatCircleDistance(a: Airport, b: Airport) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lng - a.lng) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function altitudeFor(a: Airport, b: Airport) {
  const d = greatCircleDistance(a, b);
  return 0.06 + 0.24 * (d / Math.PI);
}

function computeStats(flights: Flight[]): Stats {
  const airportCounts = new Map<string, number>();
  const routeCounts = new Map<string, number>();
  let totalKm = 0;

  for (const f of flights) {
    airportCounts.set(f.src, (airportCounts.get(f.src) || 0) + 1);
    airportCounts.set(f.dest, (airportCounts.get(f.dest) || 0) + 1);
    totalKm += f.distanceKm || 0;

    const key = [f.src, f.dest].sort().join('-');
    routeCounts.set(key, (routeCounts.get(key) || 0) + 1);
  }

  const totalFlights = flights.length;
  const totalHours = totalKm / AVERAGE_SPEED_KMH;

  const topAirports = Array.from(airportCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => `${code.toUpperCase()} (${count})`);

  let topRoute: Stats['topRoute'] = null;
  for (const [key, count] of routeCounts.entries()) {
    if (!topRoute || count > topRoute.count) {
      const [a, b] = key.split('-');
      topRoute = { a: a.toUpperCase(), b: b.toUpperCase(), count };
    }
  }

  return { totalFlights, totalHours, topAirports, topRoute };
}

export default function FlightsGlobe(): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [legendYears, setLegendYears] = useState<number[]>([]);
  const [yearColor, setYearColor] = useState<d3.ScaleOrdinal<number, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let globe: any;

    async function init() {
      try {
        const [airportsRes, flightsRes] = await Promise.all([
          fetch('/api/airports'),
          fetch('/api/flights')
        ]);

        if (!airportsRes.ok) {
          throw new Error(`Failed to load airports: ${airportsRes.status}`);
        }
        if (!flightsRes.ok) {
          throw new Error(`Failed to load flights: ${flightsRes.status}`);
        }

        const airportsRaw: Airport[] = (await airportsRes.json()).map((a: any) => ({
          code: a.code,
          name: a.name,
          lat: Number(a.lat),
          lng: Number(a.lng)
        }));

        const airportMap = new Map<string, Airport>(airportsRaw.map(a => [a.code, a]));

        const flightsRaw = await flightsRes.json();
        const flights: Flight[] = flightsRaw
          .map((row: any) => {
            const src = airportMap.get(row.src);
            const dest = airportMap.get(row.dest);
            if (!src || !dest) {
              return null;
            }

            const dateStr = row.date || '';
            const dateObj = dateStr ? new Date(dateStr) : null;

            return {
              id: row.id,
              dateStr,
              date: dateObj,
              src: row.src,
              dest: row.dest,
              flightno: row.flightno ?? null,
              startLat: src.lat,
              startLng: src.lng,
              endLat: dest.lat,
              endLng: dest.lng,
              altitude: altitudeFor(src, dest),
              year: dateObj ? dateObj.getFullYear() : null,
              distanceKm: greatCircleDistance(src, dest) * EARTH_RADIUS_KM
            } satisfies Flight;
          })
          .filter(Boolean) as Flight[];

        if (!mounted) return;

        const years = Array.from(new Set(flights.map(f => f.year).filter(Boolean))).sort() as number[];
        const palette = (d3.schemeTableau10 as readonly string[]) || (d3.schemeCategory10 as readonly string[]);
        const range = palette && palette.length >= years.length
          ? palette.slice(0, years.length)
          : years.map((_, i) => d3.interpolateTurbo(i / Math.max(1, years.length - 1)));
        const scale = d3.scaleOrdinal<number, string>().domain(years).range(range as string[]);

        setLegendYears(years);
        setYearColor(() => scale);
        setStats(computeStats(flights));

        if (!containerRef.current) {
          return;
        }

        const { default: Globe } = await import('globe.gl');
        if (!mounted || !containerRef.current) return;

        const globeInstance = Globe()
          (containerRef.current)
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
          .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
          .backgroundColor('#000000')
          .arcStroke(0.75)
          .arcAltitude((d: Flight) => d.altitude)
          .arcDashLength(0.25)
          .arcDashGap(0.7)
          .arcDashInitialGap(() => Math.random())
          .arcDashAnimateTime(2000)
          .arcLabel((d: Flight) => `${d.src.toUpperCase()} → ${d.dest.toUpperCase()} (${d.flightno || '—'})\n${d.dateStr}`)
          .pointAltitude(0.01)
          .pointRadius(0.1)
          .pointColor(() => '#69b3a2')
          .pointLabel((d: Airport) => `${d.code.toUpperCase()} — ${d.name}`);

        globe = globeInstance;

        const focus = airportMap.get('phx');
        if (focus) {
          globeInstance.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.8 }, 0);
        }

        globeInstance
          .arcColor((d: Flight) => (d.year && scale.domain().includes(d.year) ? scale(d.year) : '#999'))
          .arcsData(flights)
          .pointsData(airportsRaw);
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      globe = null;
    };
  }, []);

  const legend = useMemo(() => {
    if (!yearColor || legendYears.length === 0) return null;
    return legendYears.map(year => ({ year, color: yearColor(year) }));
  }, [legendYears, yearColor]);

  return (
    <>
      <div id="globe-container" ref={containerRef} />
      <div className="hud">
        <div>
          <b>Flights Globe</b>
        </div>
        {error ? (
          <div style={{ marginTop: 6 }}>Unable to load flight data: {error}</div>
        ) : stats ? (
          <div style={{ marginTop: 6, lineHeight: 1.4 }}>
            <div>Total flights: <b>{stats.totalFlights}</b></div>
            <div>Total hours (est.): <b>{stats.totalHours.toFixed(1)}h</b></div>
            <div>
              Most flown route:{' '}
              <b>{stats.topRoute ? `${stats.topRoute.a} ↔ ${stats.topRoute.b} (${stats.topRoute.count})` : '—'}</b>
            </div>
            <div>Top airports: <b>{stats.topAirports.join(', ')}</b></div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>Loading flight data…</div>
        )}
        {legend && legend.length > 0 && (
          <div style={{ marginTop: 6, lineHeight: 1.4 }}>
            <div>Colors by year:</div>
            <div>
              {legend.map(item => (
                <span key={item.year} style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8, marginBottom: 4 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, background: item.color, marginRight: 6, borderRadius: 2 }} />
                  <span>{item.year}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
