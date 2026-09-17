'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './passport.css';

/**
 * @typedef {Object} PassportPage
 * @property {string} id
 * @property {string} label
 */

/** @type {PassportPage[]} */
const PAGES = [
  { id: 'stamps', label: 'Stamps' },
  { id: 'records', label: 'Records' },
  { id: 'trips', label: 'Trips' },
  { id: 'carriers', label: 'Carriers' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'airports', label: 'Airports' }
];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Ink colours for the rubber stamps; index derived from the country code. */
const STAMP_INKS = ['#69b3a2', '#c4544b', '#5f7fbf', '#c9a227', '#9b6bbf', '#4f9d69'];

const NO_FRACTION = { maximumFractionDigits: 0 };

/**
 * Stable 32-bit-ish string hash so stamp rotation/ink never changes between renders.
 * @param {string} value
 * @returns {number}
 */
function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100003;
  }
  return hash;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatInt(value) {
  return Number(value || 0).toLocaleString(undefined, NO_FRACTION);
}

/**
 * `1 leg` / `2 legs`, so counted values never read as "1 days".
 * @param {number} value
 * @param {string} unit
 * @param {string} [plural] Irregular plural, e.g. `cities`.
 * @returns {string}
 */
function pluralize(value, unit, plural) {
  const count = Number(value || 0);
  return `${formatInt(count)} ${count === 1 ? unit : plural || `${unit}s`}`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatKm(value) {
  return `${formatInt(value)} km`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatHours(value) {
  return `${Number(value || 0).toFixed(1)} h`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

/**
 * Bucket a month cell into one of five heat levels.
 * @param {number} flights
 * @param {number} max
 * @returns {number} 0..4
 */
function heatLevel(flights, max) {
  if (!flights || max <= 0) return 0;
  const level = 1 + Math.floor((flights / max) * 3.999);
  return level > 4 ? 4 : level;
}

/**
 * Full-screen Flighty-style passport overlay.
 *
 * @param {Object} props
 * @param {Object|null} props.passport Passport record from `lib/passport.js`, or null while loading.
 * @param {string} props.yearLabel Active year window label, e.g. `All years` or `2025`.
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(code: string) => void} [props.onFocusAirport] Optional globe fly-to callback.
 * @param {(trip: Object) => void} [props.onFocusTrip] Optional globe trip-isolation callback.
 */
export default function Passport({ passport, yearLabel, open, onClose, onFocusAirport, onFocusTrip }) {
  const [page, setPage] = useState('stamps');
  const dialogRef = useRef(null);

  const close = useCallback(() => {
    if (typeof onClose === 'function') onClose();
  }, [onClose]);

  const focusAirport = useCallback(
    /** @param {string} code */
    code => {
      if (code && typeof onFocusAirport === 'function') onFocusAirport(code);
    },
    [onFocusAirport]
  );

  const focusTrip = useCallback(
    /** @param {Object} trip */
    trip => {
      if (trip && typeof onFocusTrip === 'function') onFocusTrip(trip);
    },
    [onFocusTrip]
  );

  const handleBackdropClick = useCallback(
    /** @param {import('react').MouseEvent<HTMLDivElement>} event */
    event => {
      if (event.target === event.currentTarget) close();
    },
    [close]
  );

  useEffect(() => {
    if (!open) return undefined;
    /** @param {KeyboardEvent} event */
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (open && dialogRef.current) dialogRef.current.focus();
  }, [open]);

  const totals = passport?.totals ?? null;
  const stamps = passport?.stamps ?? [];
  const continents = passport?.continents ?? [];
  const carriers = passport?.carriers ?? [];
  const airports = passport?.airports ?? [];
  const records = passport?.records ?? [];
  const calendar = passport?.calendar ?? [];
  const years = passport?.years ?? [];

  /** Newest trip first; the contract delivers them chronologically. */
  const trips = useMemo(() => {
    const source = passport?.trips ?? [];
    return source.slice().reverse();
  }, [passport]);

  /** iso2 -> flag emoji, harvested from the stamps so no emoji maths is duplicated here. */
  const flagByCountry = useMemo(() => {
    /** @type {Record<string, string>} */
    const map = {};
    for (const stamp of passport?.stamps ?? []) map[stamp.country] = stamp.flag;
    return map;
  }, [passport]);

  /** Deterministic ink + rotation per stamp, computed once per stamp list. */
  const stampStyles = useMemo(
    () =>
      (passport?.stamps ?? []).map(stamp => {
        const hash = hashString(stamp.country || stamp.name || '');
        return {
          transform: `rotate(${((hash % 101) / 20 - 2.5).toFixed(1)}deg)`,
          '--passport-ink': STAMP_INKS[hash % STAMP_INKS.length]
        };
      }),
    [passport]
  );

  /** `${year}-${monthIndex}` -> month cell, plus the busiest month for heat scaling. */
  const heatmap = useMemo(() => {
    /** @type {Record<string, Object>} */
    const byCell = {};
    let max = 0;
    for (const cell of passport?.calendar ?? []) {
      byCell[`${cell.year}-${cell.monthIndex}`] = cell;
      if (cell.flights > max) max = cell.flights;
    }
    return { byCell, max };
  }, [passport]);

  if (!open) return null;

  const headline = totals
    ? [
        { id: 'flights', label: 'Flights', value: formatInt(totals.flights) },
        { id: 'distance', label: 'Distance', value: formatKm(totals.distanceKm) },
        { id: 'hours', label: 'In the air', value: formatHours(totals.hoursInAir) },
        { id: 'countries', label: 'Countries', value: formatInt(totals.countries) },
        { id: 'airports', label: 'Airports', value: formatInt(totals.airports) },
        { id: 'trips', label: 'Trips', value: formatInt(totals.trips) }
      ]
    : [];

  return (
    <div className="passport-overlay" onClick={handleBackdropClick}>
      <div
        className="passport-document"
        role="dialog"
        aria-modal="true"
        aria-label="Flight passport"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="passport-header">
          <div className="passport-identity">
            <span className="passport-eyebrow">Travel document</span>
            <h2 className="passport-title">Passport</h2>
            <span className="passport-year">{yearLabel}</span>
          </div>
          <button type="button" className="passport-close" aria-label="Close passport" onClick={close}>
            ✕
          </button>
        </header>

        {passport === null ? (
          <div className="passport-loading">Reading travel history…</div>
        ) : (
          <>
            <div className="passport-headline">
              {headline.map(item => (
                <div key={item.id} className="passport-headline-item">
                  <span className="passport-headline-label">{item.label}</span>
                  <span className="passport-headline-value">{item.value}</span>
                </div>
              ))}
            </div>

            {totals && (
              <div className="passport-meta">
                <span className="passport-meta-item">{pluralize(totals.cities, 'city', 'cities')}</span>
                <span className="passport-meta-item">{pluralize(totals.continents, 'continent')}</span>
                <span className="passport-meta-item">{pluralize(totals.carriers, 'carrier')}</span>
                <span className="passport-meta-item">{pluralize(totals.daysTravelling, 'day')} travelling</span>
                <span className="passport-meta-item">{pluralize(totals.daysAbroad, 'day')} abroad</span>
                <span className="passport-meta-item">{Number(totals.earthCircuits || 0).toFixed(2)} × Earth</span>
                <span className="passport-meta-item">{formatPercent(totals.moonPercent)} to the Moon</span>
                {totals.firstFlight && totals.lastFlight && (
                  <span className="passport-meta-item">
                    {totals.firstFlight} → {totals.lastFlight}
                  </span>
                )}
              </div>
            )}

            <div className="passport-tabs" role="tablist" aria-label="Passport pages">
              {PAGES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  id={`passport-tab-${item.id}`}
                  aria-controls={`passport-panel-${item.id}`}
                  aria-selected={page === item.id}
                  className={`passport-tab${page === item.id ? ' is-active' : ''}`}
                  onClick={() => setPage(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div
              className="passport-page"
              role="tabpanel"
              id={`passport-panel-${page}`}
              aria-labelledby={`passport-tab-${page}`}
            >
              {page === 'stamps' && (
                <section className="passport-section">
                  <div className="passport-world">
                    <span className="passport-world-value">{formatPercent(totals?.worldPercent)}</span>
                    <span className="passport-world-label">
                      of the world seen · {formatInt(totals?.countries)} of 195 countries
                    </span>
                  </div>
                  {continents.length > 0 && (
                    <div className="passport-chips">
                      {continents.map(continent => (
                        <span
                          key={continent.code}
                          className="passport-chip"
                          title={`${continent.name} · ${formatInt(continent.legs)} legs · ${formatKm(continent.distanceKm)}`}
                        >
                          <span className="passport-chip-name">{continent.name}</span>
                          <span className="passport-chip-value">{formatInt(continent.countries)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {stamps.length === 0 ? (
                    <p className="passport-empty">No countries stamped in this window.</p>
                  ) : (
                    <div className="passport-stamp-grid">
                      {stamps.map((stamp, index) => (
                        <button
                          key={stamp.country}
                          type="button"
                          className={`passport-stamp${stamp.home ? ' is-home' : ''}`}
                          style={stampStyles[index]}
                          title={(stamp.cities ?? []).join(' · ') || stamp.name}
                          onClick={() => focusAirport((stamp.airports ?? [])[0])}
                        >
                          <span className="passport-stamp-flag" aria-hidden="true">
                            {stamp.flag}
                          </span>
                          <span className="passport-stamp-name">{stamp.name}</span>
                          <span className="passport-stamp-continent">{stamp.continentName}</span>
                          <span className="passport-stamp-codes">
                            {(stamp.airports ?? []).map(code => code.toUpperCase()).join(' · ') || '—'}
                          </span>
                          <span className="passport-stamp-dates">
                            {stamp.firstVisit} → {stamp.lastVisit}
                          </span>
                          <span className="passport-stamp-count">
                            {pluralize(stamp.entries, 'entry', 'entries')} · {pluralize(stamp.legs, 'leg')}
                          </span>
                          <span className="passport-stamp-distance">{formatKm(stamp.distanceKm)}</span>
                          {stamp.home && <span className="passport-stamp-badge">Home</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {page === 'records' && (
                <section className="passport-section">
                  {records.length === 0 ? (
                    <p className="passport-empty">No records in this window.</p>
                  ) : (
                    <div className="passport-record-grid">
                      {records.map(record => (
                        <div key={record.id} className="passport-record">
                          <span className="passport-record-label">{record.label}</span>
                          <span className="passport-record-value">{record.value}</span>
                          {record.detail && <span className="passport-record-detail">{record.detail}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {page === 'trips' && (
                <section className="passport-section">
                  {trips.length === 0 ? (
                    <p className="passport-empty">No trips in this window.</p>
                  ) : (
                    <ol className="passport-trip-list">
                      {trips.map(trip => (
                        <li key={trip.id} className="passport-trip">
                          <div className="passport-trip-head">
                            <span className="passport-trip-focus">{trip.focus?.city ?? '—'}</span>
                            <span className="passport-trip-dates">
                              {trip.start} → {trip.end}
                            </span>
                            <button
                              type="button"
                              className="passport-trip-fly"
                              onClick={() => focusTrip(trip)}
                              aria-label={`Show ${trip.focus?.city ?? 'this trip'} on the globe`}
                            >
                              Fly on globe
                            </button>
                          </div>
                          <div className="passport-trip-stats">
                            <span className="passport-trip-stat">{pluralize(trip.days, 'day')}</span>
                            <span className="passport-trip-stat">{pluralize(trip.legs, 'leg')}</span>
                            <span className="passport-trip-stat">{formatKm(trip.distanceKm)}</span>
                            {(trip.countries ?? []).length > 0 && (
                              <span className="passport-trip-flags" aria-hidden="true">
                                {(trip.countries ?? []).map((code, index) => (
                                  <span key={`${code}-${index}`}>{flagByCountry[code] ?? code.toUpperCase()}</span>
                                ))}
                              </span>
                            )}
                            {trip.international && <span className="passport-flag-tag">International</span>}
                            {trip.openJaw && <span className="passport-flag-tag is-openjaw">Open jaw</span>}
                          </div>
                          <div className="passport-trip-path">
                            {(trip.path ?? []).map((code, index) => (
                              <span className="passport-path-step" key={`${code}-${index}`}>
                                {index > 0 && <span className="passport-path-arrow" aria-hidden="true">›</span>}
                                <button
                                  type="button"
                                  className="passport-path-chip"
                                  onClick={() => focusAirport(code)}
                                >
                                  {code.toUpperCase()}
                                </button>
                              </span>
                            ))}
                          </div>
                          {(trip.carriers ?? []).length > 0 && (
                            <div className="passport-trip-carriers">
                              {(trip.carriers ?? []).map(code => (
                                <span key={code} className="passport-trip-carrier">
                                  {code ? code.toUpperCase() : '—'}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )}

              {page === 'carriers' && (
                <section className="passport-section">
                  {carriers.length === 0 ? (
                    <p className="passport-empty">No carriers in this window.</p>
                  ) : (
                    <ul className="passport-carrier-list">
                      {carriers.map((carrier, index) => (
                        <li key={carrier.code ?? `unknown-${index}`} className="passport-carrier">
                          <div className="passport-carrier-head">
                            <span className="passport-carrier-name">
                              {carrier.flag && (
                                <span className="passport-carrier-flag" aria-hidden="true">
                                  {carrier.flag}
                                </span>
                              )}
                              {carrier.name}
                              {carrier.code && (
                                <span className="passport-carrier-code">{carrier.code.toUpperCase()}</span>
                              )}
                            </span>
                            <span className="passport-carrier-share">{formatPercent((carrier.share || 0) * 100)}</span>
                          </div>
                          <div className="passport-bar">
                            <div
                              className="passport-bar-fill"
                              style={{ width: `${Math.max(1, (carrier.share || 0) * 100).toFixed(2)}%` }}
                            />
                          </div>
                          <div className="passport-carrier-stats">
                            <span>{pluralize(carrier.flights, 'flight')}</span>
                            <span>{formatKm(carrier.distanceKm)}</span>
                            <span>{formatHours(carrier.hours)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {page === 'timeline' && (
                <section className="passport-section">
                  {years.length === 0 ? (
                    <p className="passport-empty">No timeline in this window.</p>
                  ) : (
                    <>
                      <div className="passport-heatmap-scroll">
                        <div className="passport-heatmap">
                          <div className="passport-heatmap-row passport-heatmap-head">
                            <span className="passport-heatmap-label" />
                            {MONTH_LABELS.map(month => (
                              <span key={month} className="passport-heatmap-month">
                                {month}
                              </span>
                            ))}
                          </div>
                          {years.map(yearStat => (
                            <div key={yearStat.year} className="passport-heatmap-row">
                              <span className="passport-heatmap-label">{yearStat.year}</span>
                              {MONTH_LABELS.map((month, monthIndex) => {
                                const cell = heatmap.byCell[`${yearStat.year}-${monthIndex}`];
                                const flights = cell ? cell.flights : 0;
                                return (
                                  <span
                                    key={month}
                                    className={`passport-heatmap-cell level-${heatLevel(flights, heatmap.max)}`}
                                    title={`${month} ${yearStat.year} · ${pluralize(flights, 'flight')} · ${formatKm(
                                      cell ? cell.distanceKm : 0
                                    )}`}
                                  />
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="passport-heatmap-legend">
                        <span className="passport-heatmap-legend-label">Fewer</span>
                        {[0, 1, 2, 3, 4].map(level => (
                          <span key={level} className={`passport-heatmap-cell level-${level}`} />
                        ))}
                        <span className="passport-heatmap-legend-label">More</span>
                      </div>
                      <div className="passport-year-grid">
                        {years.map(yearStat => (
                          <div key={yearStat.year} className="passport-year-card">
                            <span className="passport-year-card-title">{yearStat.year}</span>
                            <span className="passport-year-card-main">{pluralize(yearStat.flights, 'flight')}</span>
                            <span className="passport-year-card-detail">
                              {formatKm(yearStat.distanceKm)} · {formatHours(yearStat.hours)}
                            </span>
                            <span className="passport-year-card-detail">
                              {pluralize(yearStat.countries, 'country', 'countries')} ·{' '}
                              {pluralize(yearStat.airports, 'airport')} · {pluralize(yearStat.trips, 'trip')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </section>
              )}

              {page === 'airports' && (
                <section className="passport-section">
                  {airports.length === 0 ? (
                    <p className="passport-empty">No airports in this window.</p>
                  ) : (
                    <div className="passport-table-scroll">
                      <table className="passport-table">
                        <thead>
                          <tr>
                            <th scope="col">Code</th>
                            <th scope="col">City</th>
                            <th scope="col">Visits</th>
                            <th scope="col">Dep</th>
                            <th scope="col">Arr</th>
                            <th scope="col">First</th>
                            <th scope="col">Last</th>
                          </tr>
                        </thead>
                        <tbody>
                          {airports.map(airport => (
                            <tr
                              key={airport.code}
                              className="passport-table-row"
                              tabIndex={0}
                              title={airport.name}
                              onClick={() => focusAirport(airport.code)}
                              onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  focusAirport(airport.code);
                                }
                              }}
                            >
                              <td className="passport-table-code">{airport.code.toUpperCase()}</td>
                              <td>
                                <span className="passport-table-flag" aria-hidden="true">
                                  {airport.flag}
                                </span>
                                {airport.city}
                              </td>
                              <td>{formatInt(airport.visits)}</td>
                              <td>{formatInt(airport.departures)}</td>
                              <td>{formatInt(airport.arrivals)}</td>
                              <td>{airport.firstVisit}</td>
                              <td>{airport.lastVisit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
