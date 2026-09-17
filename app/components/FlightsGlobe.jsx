'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { arcAltitude, centroid, greatCircleKm } from '../../lib/geo';
import { buildPassport } from '../../lib/passport';
import { antisolarPoint, subsolarPoint, terminatorRing } from '../../lib/solar';
import Passport from './Passport';

const REGULAR_GLOBE_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const BLACK_GLOBE_TEXTURE = 'https://unpkg.com/three-globe/example/img/earth-dark.jpg';
const COUNTRIES_GEOJSON = 'https://unpkg.com/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';
const FOCUS_RING_MS = 6000;
/** The terminator only needs to move a quarter of a degree at a time. */
const TERMINATOR_REFRESH_MS = 60000;
/** globe.gl works in units of one globe radius; the night cap sits just above the surface. */
const NIGHT_CAP_ALTITUDE = 0.005;
const ARC_STROKE = 0.75;
const UNKNOWN_COLOR = '#8a8a8a';

const COLOR_MODES = [
  { id: 'year', label: 'Year' },
  { id: 'carrier', label: 'Airline' },
  { id: 'continent', label: 'Continent' }
];

const CONTINENT_COLORS = {
  af: '#e2725b',
  an: '#cfd8dc',
  as: '#e8b959',
  eu: '#8f7fd4',
  na: '#69b3a2',
  oc: '#5f9ed1',
  sa: '#4f9d69'
};

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
  const nightCapRef = useRef(null);
  const arcColorRef = useRef(() => UNKNOWN_COLOR);
  const [flights, setFlights] = useState(null);
  const [reference, setReference] = useState({ airports: [], countries: [], airlines: [] });
  const [selectedYear, setSelectedYear] = useState('all');
  const [legendYears, setLegendYears] = useState([]);
  const [yearColor, setYearColor] = useState(null);
  const [error, setError] = useState(null);
  const [staticPaths, setStaticPaths] = useState(false);
  const [blackGlobe, setBlackGlobe] = useState(false);
  const [showCountries, setShowCountries] = useState(true);
  const [countriesError, setCountriesError] = useState(null);
  const [showSpikes, setShowSpikes] = useState(true);
  const [showTerminator, setShowTerminator] = useState(false);
  const [colorMode, setColorMode] = useState('year');
  const [focusTrip, setFocusTrip] = useState(null);
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
        const continentByCountry = new Map(countriesRaw.map(c => [c.code, c.continent]));

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
              srcCity: src.city,
              destCity: dest.city,
              flightno: row.flightno ?? null,
              carrier: row.carrier ?? null,
              continent: continentByCountry.get(dest.country) ?? null,
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
          .arcStroke(ARC_STROKE)
          .arcAltitude(d => d.altitude)
          .arcColor(d => arcColorRef.current(d))
          .arcLabel(d => `${d.src.toUpperCase()} → ${d.dest.toUpperCase()} (${d.flightno || '—'})\n${d.dateStr}`)
          .pointAltitude(d => d.altitude ?? 0.01)
          .pointRadius(d => d.radius ?? 0.1)
          .pointColor(d => d.color ?? '#69b3a2')
          .pointLabel(d => `${d.code.toUpperCase()} — ${d.name}${d.detail ? `\n${d.detail}` : ''}`)
          .polygonAltitude(0.007)
          .polygonSideColor(() => 'rgba(105, 179, 162, 0.12)')
          .polygonStrokeColor(d => (d.__home ? '#e8b959' : '#69b3a2'))
          .polygonCapColor(d => (d.__home ? 'rgba(232, 185, 89, 0.22)' : 'rgba(105, 179, 162, 0.26)'))
          .polygonLabel(d => `${d.__flag} ${d.__name}\n${d.__detail}`)
          .pathColor(() => ['rgba(255, 215, 106, 0.05)', 'rgba(255, 215, 106, 0.85)'])
          .pathStroke(1.1)
          .pathTransitionDuration(0)
          .pathLabel('Day / night terminator')
          .labelText(d => d.text)
          .labelSize(d => d.size ?? 1)
          .labelDotRadius(0.45)
          .labelColor(() => '#ffd76a')
          .labelResolution(2)
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

        // Arc colours, point spikes and the terminator are owned by the layer
        // effects below, which run as soon as `globeReady` flips.

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
      const nightCap = nightCapRef.current;
      if (nightCap) {
        nightCap.parent?.remove(nightCap);
        nightCap.geometry.dispose();
        nightCap.material.dispose();
        nightCapRef.current = null;
      }
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

  /** Trips are contiguous in time and never share a date, so the window is exact. */
  const tripLegs = useMemo(() => {
    if (!focusTrip) return [];
    return filteredFlights.filter(f => f.dateStr >= focusTrip.start && f.dateStr <= focusTrip.end);
  }, [focusTrip, filteredFlights]);

  /** A focused trip narrows the arcs; otherwise the year window decides. */
  const displayedFlights = useMemo(() => {
    if (focusTrip) return tripLegs;
    return filteredFlights;
  }, [focusTrip, tripLegs, filteredFlights]);

  /** `{ color(flight), legend: [{ key, label, title, color }], title }` for the active mode. */
  const palette = useMemo(() => {
    if (colorMode === 'carrier') {
      const flown = new Map();
      for (const f of filteredFlights) {
        if (f.carrier) flown.set(f.carrier, (flown.get(f.carrier) || 0) + 1);
      }
      const codes = Array.from(flown.keys()).sort((a, b) => flown.get(b) - flown.get(a) || a.localeCompare(b));
      // Sampled around the hue wheel rather than a categorical scheme: 15 flown
      // carriers exhaust Tableau10 and start handing out greys.
      const range = codes.map((_, index) => d3.interpolateSinebow((index / Math.max(1, codes.length)) % 1));
      const scale = d3.scaleOrdinal().domain(codes).range(range);
      const nameByCode = new Map(reference.airlines.map(a => [a.code, a.name]));
      return {
        title: 'Airline mapping',
        color: f => (f.carrier && flown.has(f.carrier) ? scale(f.carrier) : UNKNOWN_COLOR),
        legend: codes.map(code => ({
          key: code,
          label: code.toUpperCase(),
          title: `${nameByCode.get(code) ?? code.toUpperCase()} — ${flown.get(code)} flights`,
          color: scale(code)
        }))
      };
    }

    if (colorMode === 'continent') {
      const present = new Map();
      for (const f of filteredFlights) {
        if (f.continent) present.set(f.continent, (present.get(f.continent) || 0) + 1);
      }
      const nameByContinent = new Map((passport?.continents ?? []).map(c => [c.code, c.name]));
      const codes = Array.from(present.keys()).sort((a, b) => present.get(b) - present.get(a));
      return {
        title: 'Continent mapping',
        color: f => CONTINENT_COLORS[f.continent] ?? UNKNOWN_COLOR,
        legend: codes.map(code => ({
          key: code,
          label: nameByContinent.get(code) ?? code.toUpperCase(),
          title: `${present.get(code)} arrivals`,
          color: CONTINENT_COLORS[code] ?? UNKNOWN_COLOR
        }))
      };
    }

    return {
      title: 'Year mapping',
      color: f => (yearColor && f.year ? yearColor(f.year) : UNKNOWN_COLOR),
      legend: legendYears.map(year => ({
        key: year,
        label: String(year),
        title: `${year}`,
        color: yearColor ? yearColor(year) : UNKNOWN_COLOR
      }))
    };
  }, [colorMode, filteredFlights, reference, legendYears, yearColor, passport]);

  useEffect(() => {
    arcColorRef.current = f => palette.color(f);
  }, [palette]);

  useEffect(() => {
    if (!globeReady || !globeRef.current) return;
    // A fresh array each time so globe.gl re-reads the colour accessor.
    globeRef.current.arcsData(displayedFlights.slice());
  }, [displayedFlights, palette, globeReady]);

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

  /** Airports as flat dots, or as spikes whose height and colour track visits. */
  const pointLayer = useMemo(() => {
    const stats = passport?.airports ?? [];
    if (!showSpikes) {
      return reference.airports.map(a => ({ ...a, altitude: 0.01, radius: 0.1, color: '#69b3a2' }));
    }
    const max = stats.reduce((peak, a) => (a.visits > peak ? a.visits : peak), 0) || 1;
    const heat = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, max]);
    return stats.map(a => ({
      code: a.code,
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      altitude: 0.012 + 0.4 * (a.visits / max),
      radius: 0.3,
      color: heat(a.visits),
      detail: `${a.visits} visit${a.visits === 1 ? '' : 's'} · ${a.departures} dep · ${a.arrivals} arr`
    }));
  }, [showSpikes, passport, reference]);

  useEffect(() => {
    if (!globeReady || !globeRef.current) return;
    globeRef.current.pointsData(pointLayer);
  }, [pointLayer, globeReady]);

  useEffect(() => {
    if (!globeReady) return undefined;
    const globeInstance = globeRef.current;
    if (!globeInstance) return undefined;

    if (!showTerminator) {
      const cap = nightCapRef.current;
      cap?.parent?.remove(cap);
      globeInstance.pathsData([]);
      globeInstance.labelsData([]);
      return undefined;
    }

    let cancelled = false;
    let timer = null;

    async function applyTerminator() {
      const THREE = await import('three');
      if (cancelled || !globeRef.current) return;
      const globe = globeRef.current;

      if (!nightCapRef.current) {
        // A hemisphere cap centred on the antisolar point *is* the night side,
        // so the shadow needs no shader — just the right orientation.
        const radius = 100 * (1 + NIGHT_CAP_ALTITUDE);
        nightCapRef.current = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: 0x02040c,
            transparent: true,
            opacity: 0.62,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        );
      }

      const cap = nightCapRef.current;
      if (cap.parent !== globe.scene()) globe.scene().add(cap);

      const up = new THREE.Vector3(0, 1, 0);
      const axis = new THREE.Vector3();

      const update = () => {
        if (!globeRef.current) return;
        const now = new Date();
        const night = antisolarPoint(now);
        const coords = globeRef.current.getCoords(night.lat, night.lng, 0);
        axis.set(coords.x, coords.y, coords.z).normalize();
        cap.quaternion.setFromUnitVectors(up, axis);

        const sun = subsolarPoint(now);
        globeRef.current
          .pathsData([terminatorRing(now, 180).map(p => [p.lat, p.lng, 0.012])])
          .labelsData([{ lat: sun.lat, lng: sun.lng, text: 'subsolar', size: 0.9 }]);
      };

      update();
      timer = setInterval(update, TERMINATOR_REFRESH_MS);
    }

    applyTerminator();

    return () => {
      cancelled = true;
      clearInterval(timer);
      const cap = nightCapRef.current;
      cap?.parent?.remove(cap);
      globeRef.current?.pathsData([]).labelsData([]);
    };
  }, [showTerminator, globeReady]);

  const focusTripOnGlobe = useCallback(trip => {
    if (!trip) return;
    setPassportOpen(false);
    setFocusTrip({ id: trip.id, start: trip.start, end: trip.end, label: trip.focus?.city ?? trip.start });

    const index = airportIndexRef.current;
    const globeInstance = globeRef.current;
    if (!index || !globeInstance) return;
    const stops = (trip.path ?? []).map(code => index.get(code)).filter(Boolean);
    if (stops.length === 0) return;
    const centre = centroid(stops) ?? stops[0];
    const spread = stops.reduce((peak, stop) => Math.max(peak, greatCircleKm(centre, stop)), 0);
    globeInstance.pointOfView({ lat: centre.lat, lng: centre.lng, altitude: Math.min(2.6, 0.75 + spread / 3600) }, 1400);
  }, []);

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

  const legend = palette.legend;

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
              <span className="hud-status-metric">flights</span>
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
            {focusTrip && (
              <button type="button" className="hud-focus-chip" onClick={() => setFocusTrip(null)}>
                <span className="hud-focus-label">Trip · {focusTrip.label}</span>
                <span className="hud-focus-dates">
                  {focusTrip.start} → {focusTrip.end}
                </span>
                <span className="hud-focus-clear" aria-hidden="true">
                  ✕
                </span>
              </button>
            )}
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
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={showSpikes}
                  onChange={event => setShowSpikes(event.target.checked)}
                />
                <span className="hud-toggle-label">Airport spikes</span>
              </label>
              <label className="hud-toggle">
                <input
                  type="checkbox"
                  checked={showTerminator}
                  onChange={event => setShowTerminator(event.target.checked)}
                />
                <span className="hud-toggle-label">Day / night</span>
              </label>
              <label className="hud-select">
                <span className="hud-select-label">Colour by</span>
                <select value={colorMode} onChange={event => setColorMode(event.target.value)}>
                  {COLOR_MODES.map(mode => (
                    <option key={mode.id} value={mode.id}>
                      {mode.label}
                    </option>
                  ))}
                </select>
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
            {legend.length > 0 && (
              <div className="hud-legend">
                <div className="hud-legend-title">{palette.title}</div>
                <div className="hud-legend-items">
                  {legend.map(item => (
                    <span key={item.key} className="hud-legend-item" title={item.title}>
                      <span className="hud-legend-swatch" style={{ background: item.color }} />
                      <span>{item.label}</span>
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
        onFocusTrip={focusTripOnGlobe}
      />
    </>
  );
}
