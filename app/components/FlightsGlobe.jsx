'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { EARTH_CIRCUMFERENCE_KM, arcAltitude, greatCircleKm } from '../../lib/geo';
import { buildPassport } from '../../lib/passport';
import Passport from './Passport';

const REGULAR_GLOBE_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BLACK_GLOBE_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-dark.jpg';
const COUNTRIES_GEOJSON = 'https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';
const FOCUS_RING_MS = 6000;

/**
 * @typedef {Object} Airport
 * @property {string} code
 * @property {string} name
 * @property {string} city
 * @property {string} country
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} Flight
 * @property {number} [id]
 * @property {string} dateStr
 * @property {Date|null} date
 * @property {string} src
 * @property {string} dest
 * @property {string|null} [flightno]
 * @property {string|null} [carrier]
 * @property {number} startLat
 * @property {number} startLng
 * @property {number} endLat
 * @property {number} endLng
 * @property {number} altitude
 * @property {number|null} year
 * @property {number} distanceKm
 */

/**
 * Parse `YYYY-MM-DD` at local midnight. `new Date('2025-01-01')` is parsed as
 * UTC, which lands on the previous year west of Greenwich and would drop the
 * flight into the wrong year bucket.
 * @param {string} value
 * @returns {Date|null}
 */
function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function configureArcAnimation(globeInstance, staticMode) {
  if (!globeInstance) return;
  if (staticMode) {
    globeInstance
      .arcDashLength(1)
      .arcDashGap(0)
      .arcDashInitialGap(() => 0)
      .arcDashAnimateTime(0);
  } else {
    globeInstance
      .arcDashLength(0.25)
      .arcDashGap(0.7)
      .arcDashInitialGap(() => Math.random())
      .arcDashAnimateTime(2000);
  }
}

/**
 * Reshape the globe's arc rows back into the row shape the API serves, which is
 * what `buildPassport` consumes.
 * @param {Flight[]} flights
 * @param {{airports: Airport[], countries: Object[], airlines: Object[]}} reference
 * @param {string[]} [homeBases]
 */
function passportInput(flights, reference, homeBases) {
  return {
    flights: flights.map(f => ({
      id: f.id,
      date: f.dateStr,
      src: f.src,
      dest: f.dest,
      flightno: f.flightno,
      carrier: f.carrier
    })),
    airports: reference.airports,
    countries: reference.countries,
    airlines: reference.airlines,
    homeBases
  };
}

export default function FlightsGlobe() {
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const airportIndexRef = useRef(null);
  const countryFeaturesRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const [flights, setFlights] = useState(null);
  const [reference, setReference] = useState({ airports: [], countries: [], airlines: [] });
  const [selectedYear, setSelectedYear] = useState('all');
  const [legendYears, setLegendYears] = useState([]);
  const [yearColor, setYearColor] = useState(null);
  const [error, setError] = useState(null);
  const [staticPaths, setStaticPaths] = useState(false);
  const [blackGlobe, setBlackGlobe] = useState(false);
  const [showCountries, setShowCountries] = useState(false);
  const [countriesError, setCountriesError] = useState(null);
  const [hudExpanded, setHudExpanded] = useState(true);
  const [passportOpen, setPassportOpen] = useState(false);
  const [globeReady, setGlobeReady] = useState(false);
  const staticPathsRef = useRef(staticPaths);
  const blackGlobeRef = useRef(blackGlobe);

  useEffect(() => {
    let mounted = true;
    const containerEl = containerRef.current;

    async function init() {
      try {
        const [airportsRes, flightsRes, countriesRes, airlinesRes] = await Promise.all([
          fetch('/api/airports'),
          fetch('/api/flights'),
          fetch('/api/countries'),
          fetch('/api/airlines')
        ]);

        if (!airportsRes.ok) {
          throw new Error(`Failed to load airports: ${airportsRes.status}`);
        }
        if (!flightsRes.ok) {
          throw new Error(`Failed to load flights: ${flightsRes.status}`);
        }
        if (!countriesRes.ok) {
          throw new Error(`Failed to load countries: ${countriesRes.status}`);
        }
        if (!airlinesRes.ok) {
          throw new Error(`Failed to load airlines: ${airlinesRes.status}`);
        }

        const airportsRaw = (await airportsRes.json()).map(a => ({
          code: a.code,
          name: a.name,
          city: a.city,
          country: a.country,
          lat: Number(a.lat),
          lng: Number(a.lng)
        }));

        const airportMap = new Map(airportsRaw.map(a => [a.code, a]));
        airportIndexRef.current = airportMap;

        const [countriesRaw, airlinesRaw] = await Promise.all([countriesRes.json(), airlinesRes.json()]);

        const flightsRaw = await flightsRes.json();
        const flights = flightsRaw
          .map(row => {
            const src = airportMap.get(row.src);
            const dest = airportMap.get(row.dest);
            if (!src || !dest) {
              return null;
            }

            const dateStr = row.date || '';
            const dateObj = parseLocalDate(dateStr);

            return {
              id: row.id,
              dateStr,
              date: dateObj,
              src: row.src,
              dest: row.dest,
              flightno: row.flightno ?? null,
              carrier: row.carrier ?? null,
              startLat: src.lat,
              startLng: src.lng,
              endLat: dest.lat,
              endLng: dest.lng,
              altitude: arcAltitude(src, dest),
              year: dateObj ? dateObj.getFullYear() : null,
              distanceKm: greatCircleKm(src, dest)
            };
          })
          .filter(Boolean);

        if (!mounted) return;

        const years = Array.from(new Set(flights.map(f => f.year).filter(Boolean))).sort((a, b) => a - b);
        const palette = d3.schemeTableau10 || d3.schemeCategory10;
        const range = palette && palette.length >= years.length
          ? palette.slice(0, years.length)
          : years.map((_, i) => d3.interpolateTurbo(i / Math.max(1, years.length - 1)));
        const scale = d3.scaleOrdinal().domain(years).range(range);

        setLegendYears(years);
        setYearColor(() => scale);
        setFlights(flights);
        setReference({ airports: airportsRaw, countries: countriesRaw, airlines: airlinesRaw });

        if (!containerEl) {
          return;
        }

        const { default: Globe } = await import('globe.gl');
        if (!mounted || !containerEl) return;

        const globeInstance = Globe()
          (containerEl)
          .globeImageUrl(blackGlobeRef.current ? BLACK_GLOBE_TEXTURE : REGULAR_GLOBE_TEXTURE)
          .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
          .backgroundColor('#000000')
          .arcStroke(0.75)
          .arcAltitude(d => d.altitude)
          .arcLabel(d => `${d.src.toUpperCase()} → ${d.dest.toUpperCase()} (${d.flightno || '—'})\n${d.dateStr}`)
          .pointAltitude(0.01)
          .pointRadius(0.1)
          .pointColor(() => '#69b3a2')
          .pointLabel(d => `${d.code.toUpperCase()} — ${d.name}`)
          .polygonAltitude(0.007)
          .polygonSideColor(() => 'rgba(105, 179, 162, 0.12)')
          .polygonStrokeColor(d => (d.__home ? '#e8b959' : '#69b3a2'))
          .polygonCapColor(d => (d.__home ? 'rgba(232, 185, 89, 0.22)' : 'rgba(105, 179, 162, 0.26)'))
          .polygonLabel(d => `${d.__flag} ${d.__name}\n${d.__detail}`)
          .ringColor(() => t => `rgba(232, 185, 89, ${1 - t})`)
          .ringMaxRadius(5)
          .ringPropagationSpeed(2.4)
          .ringRepeatPeriod(700);

        globeRef.current = globeInstance;
        configureArcAnimation(globeInstance, staticPathsRef.current);

        const focus = airportMap.get('phx');
        if (focus) {
          globeInstance.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: 1.8 }, 0);
        }

        globeInstance
          .arcColor(d => (d.year && scale.domain().includes(d.year) ? scale(d.year) : '#999'))
          .arcsData(flights)
          .pointsData(airportsRaw);

        setGlobeReady(true);
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
      globeRef.current = null;
      setGlobeReady(false);
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
      if (containerEl) {
        containerEl.innerHTML = '';
      }
    };
  }, []);

  useEffect(() => {
    staticPathsRef.current = staticPaths;
    configureArcAnimation(globeRef.current, staticPaths);
  }, [staticPaths]);

  useEffect(() => {
    blackGlobeRef.current = blackGlobe;
    if (!globeRef.current) return;
    globeRef.current.globeImageUrl(blackGlobe ? BLACK_GLOBE_TEXTURE : REGULAR_GLOBE_TEXTURE);
  }, [blackGlobe]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 700) {
      setHudExpanded(false);
    }
  }, []);

  const filteredFlights = useMemo(() => {
    if (!flights) {
      return [];
    }
    if (selectedYear === 'all') {
      return flights;
    }
    const yearNum = Number(selectedYear);
    return flights.filter(f => f.year === yearNum);
  }, [flights, selectedYear]);

  const fullPassport = useMemo(() => {
    if (!flights || reference.airports.length === 0) return null;
    return buildPassport(passportInput(flights, reference));
  }, [flights, reference]);

  /**
   * Everything the HUD and the passport display is derived from this one
   * object. A year window reuses the home bases derived from the whole log —
   * re-deriving them from a single year starts closing trips at holiday
   * airports that happen to dominate that year's dwell time.
   */
  const passport = useMemo(() => {
    if (!fullPassport) return null;
    if (selectedYear === 'all') return fullPassport;
    return buildPassport(passportInput(filteredFlights, reference, fullPassport.homeBases));
  }, [fullPassport, filteredFlights, reference, selectedYear]);

  useEffect(() => {
    if (!globeReady || !globeRef.current) return;
    globeRef.current.arcsData(filteredFlights);
  }, [filteredFlights, globeReady]);

  const visitedCountries = useMemo(() => {
    if (!passport) return [];
    return passport.stamps.map(stamp => ({
      code: stamp.country,
      name: stamp.name,
      flag: stamp.flag,
      home: stamp.home,
      detail: `${stamp.entries} arrival${stamp.entries === 1 ? '' : 's'} · ${stamp.airports.map(c => c.toUpperCase()).join(', ')}`
    }));
  }, [passport]);

  useEffect(() => {
    if (!globeReady) return;
    const globeInstance = globeRef.current;
    if (!globeInstance) return;

    if (!showCountries) {
      globeInstance.polygonsData([]);
      return undefined;
    }

    let cancelled = false;

    async function applyCountryLayer() {
      if (!countryFeaturesRef.current) {
        try {
          const res = await fetch(COUNTRIES_GEOJSON);
          if (!res.ok) throw new Error(`countries geometry: ${res.status}`);
          const geo = await res.json();
          countryFeaturesRef.current = geo.features || [];
        } catch (err) {
          console.error(err);
          if (!cancelled) setCountriesError(err instanceof Error ? err.message : 'Unknown error');
          return;
        }
      }

      if (cancelled || !globeRef.current) return;

      const byIso = new Map(visitedCountries.map(c => [c.code, c]));
      const features = [];
      for (const feature of countryFeaturesRef.current) {
        const iso = String(feature.properties?.ISO_A2 || '').toLowerCase();
        const visit = byIso.get(iso);
        if (!visit) continue;
        features.push({
          ...feature,
          __home: visit.home,
          __name: visit.name,
          __flag: visit.flag,
          __detail: visit.detail
        });
      }

      setCountriesError(null);
      globeRef.current.polygonsData(features);
    }

    applyCountryLayer();

    return () => {
      cancelled = true;
    };
  }, [showCountries, visitedCountries, globeReady]);

  const focusAirport = useCallback(code => {
    const airport = airportIndexRef.current?.get(code);
    const globeInstance = globeRef.current;
    if (!airport || !globeInstance) return;

    setPassportOpen(false);
    globeInstance.pointOfView({ lat: airport.lat, lng: airport.lng, altitude: 1.1 }, 1200);
    globeInstance.ringsData([{ lat: airport.lat, lng: airport.lng }]);

    clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = setTimeout(() => {
      ringTimeoutRef.current = null;
      if (globeRef.current) globeRef.current.ringsData([]);
    }, FOCUS_RING_MS);
  }, []);

  const legend = useMemo(() => {
    if (!yearColor || legendYears.length === 0) return null;
    return legendYears.map(year => ({ year, color: yearColor(year) }));
  }, [legendYears, yearColor]);

  const yearLabel = selectedYear === 'all' ? 'All years' : selectedYear;

  const statCards = useMemo(() => {
    if (!passport) return [];
    const { totals, airports, records } = passport;
    const busiestRoute = records.find(r => r.id === 'busiestRoute');
    const airportsDetailParts = [];
    const top = airports.slice(0, 5).map(a => `${a.code.toUpperCase()} (${a.visits})`);
    if (top.length > 0) {
      airportsDetailParts.push(`Top: ${top.join(', ')}`);
    }
    if (busiestRoute && busiestRoute.value !== '—') {
      airportsDetailParts.push(`Busiest Route: ${busiestRoute.value} (${busiestRoute.detail})`);
    }
    const airportsDetail =
      airportsDetailParts.length === 0
        ? null
        : airportsDetailParts.length === 1
          ? airportsDetailParts[0]
          : airportsDetailParts;
    return [
      {
        id: 'flightSummary',
        label: 'Flight Summary',
        value: `${totals.flights.toLocaleString()} flights`,
        detail: `${totals.hoursInAir.toFixed(1)} hours`
      },
      {
        id: 'totalDistance',
        label: 'Distance Traveled',
        value: `${totals.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`,
        detail: `Earth circuits: ${totals.earthCircuits.toFixed(2)}`
      },
      {
        id: 'uniqueAirports',
        label: 'Airports Visited',
        value: totals.airports.toString(),
        detail: airportsDetail
      },
      {
        id: 'passportCoverage',
        label: 'Passport',
        value: `${totals.countries} countries`,
        detail: [
          `${totals.continents} continents · ${totals.worldPercent.toFixed(1)}% of the world`,
          `${totals.trips} trips · ${totals.daysAbroad} days abroad`
        ]
      }
    ];
  }, [passport]);

  return (
    <>
      <div id="globe-container" ref={containerRef} />
      <div
        className={`hud ${hudExpanded ? 'is-expanded' : 'is-collapsed'}`}
        onClick={!hudExpanded ? () => setHudExpanded(true) : undefined}
      >
        <div className="hud-header">
          <div className="hud-header-text">
            <div className="hud-title">Flight Paths</div>
          </div>
          <button
            type="button"
            className="hud-visibility-toggle"
            onClick={() => setHudExpanded(value => !value)}
            aria-expanded={hudExpanded}
          >
            {hudExpanded ? 'Hide' : 'Show'}
          </button>
        </div>
        {hudExpanded ? (
          <>
            <div className="hud-status-row">
              <span className="hud-status-tag">sync</span>
              <span className="hud-status-value">{filteredFlights.length.toString().padStart(3, '0')}</span>
              <span className="hud-status-metric">active traces</span>
            </div>
            <div className="hud-divider" />
            <button
              type="button"
              className="hud-passport-button"
              onClick={() => setPassportOpen(true)}
              disabled={!passport}
            >
              <span className="hud-passport-glyph">✦</span>
              <span className="hud-passport-text">Open passport</span>
              <span className="hud-passport-meta">
                {passport ? `${passport.totals.countries} stamps` : 'loading'}
              </span>
            </button>
            <div className="hud-divider" />
            <div className="hud-controls">
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={blackGlobe}
                  onChange={event => setBlackGlobe(event.target.checked)}
                />
                <span className="hud-toggle-label">Black globe</span>
              </label>
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={staticPaths}
                  onChange={event => setStaticPaths(event.target.checked)}
                />
                <span className="hud-toggle-label">Static flight paths</span>
              </label>
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={showCountries}
                  onChange={event => setShowCountries(event.target.checked)}
                />
                <span className="hud-toggle-label">Visited countries</span>
              </label>
              {legendYears.length > 0 && (
                <label className="hud-select">
                  <span className="hud-select-label">Year window</span>
                  <select value={selectedYear} onChange={event => setSelectedYear(event.target.value)}>
                    <option value="all">All years</option>
                    {legendYears.map(year => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="hud-divider" />
            {error ? (
              <div className="hud-error">Unable to load flight data: {error}</div>
            ) : passport ? (
              <div className="hud-stats">
                {statCards.map(card => (
                  <div key={card.id} className="hud-stat-card">
                    <span className="hud-stat-label">{card.label}</span>
                    <span className="hud-stat-value">{card.value}</span>
                    {Array.isArray(card.detail)
                      ? card.detail.map((line, index) => (
                          <span key={index} className="hud-stat-detail">
                            {line}
                          </span>
                        ))
                      : card.detail && <span className="hud-stat-detail">{card.detail}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="hud-loading">Loading flight data…</div>
            )}
            {countriesError && (
              <div className="hud-error">Country outlines unavailable: {countriesError}</div>
            )}
            {legend && legend.length > 0 && (
              <div className="hud-legend">
                <div className="hud-legend-title">Spectral mapping</div>
                <div className="hud-legend-items">
                  {legend.map(item => (
                    <span key={item.year} className="hud-legend-item">
                      <span className="hud-legend-swatch" style={{ background: item.color }} />
                      <span>{item.year}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="hud-collapsed-hint">Dashboard hidden</div>
        )}
      </div>
      <Passport
        passport={passport}
        yearLabel={yearLabel}
        open={passportOpen}
        onClose={() => setPassportOpen(false)}
        onFocusAirport={focusAirport}
      />
    </>
  );
}
