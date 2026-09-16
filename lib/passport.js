import {
  EARTH_CIRCUMFERENCE_KM,
  MOON_DISTANCE_KM,
  blockHours,
  greatCircleKm,
} from './geo.js';

/**
 * Passport derivation: turns the raw API records into every number the
 * passport overlay renders. Pure, no fetch, no React, no date mutation —
 * all date maths runs on UTC day numbers so a westward timezone cannot
 * shift a flight into the neighbouring day.
 */

/**
 * @typedef {Object} FlightInput
 * @property {number} [id]
 * @property {string} date                ISO `YYYY-MM-DD`
 * @property {string} src
 * @property {string} dest
 * @property {string|null} [flightno]
 * @property {string|null} [carrier]
 */

/**
 * @typedef {Object} AirportInput
 * @property {string} code
 * @property {string} name
 * @property {string} city
 * @property {string} country
 * @property {number} lat
 * @property {number} lng
 */

/**
 * @typedef {Object} CountryInput
 * @property {string} code
 * @property {string} name
 * @property {string} continent
 */

/**
 * @typedef {Object} AirlineInput
 * @property {string} code
 * @property {string} name
 * @property {string} country
 */

/**
 * @typedef {Object} PassportTotals
 * @property {number} flights
 * @property {number} distanceKm
 * @property {number} hoursInAir
 * @property {number} earthCircuits
 * @property {number} moonPercent
 * @property {number} airports
 * @property {number} cities
 * @property {number} countries
 * @property {number} continents
 * @property {number} carriers
 * @property {number} trips
 * @property {number} daysAbroad
 * @property {number} daysTravelling
 * @property {number} worldPercent
 * @property {string|null} firstFlight
 * @property {string|null} lastFlight
 */

/**
 * @typedef {Object} Stamp
 * @property {string} country
 * @property {string} name
 * @property {string} flag
 * @property {string} continent
 * @property {string} continentName
 * @property {number} entries
 * @property {number} legs
 * @property {string} firstVisit
 * @property {string} lastVisit
 * @property {string[]} airports
 * @property {string[]} cities
 * @property {number} distanceKm
 * @property {number} lat
 * @property {number} lng
 * @property {boolean} home
 */

/**
 * @typedef {Object} ContinentStat
 * @property {string} code
 * @property {string} name
 * @property {number} countries
 * @property {number} legs
 * @property {number} distanceKm
 */

/**
 * @typedef {Object} CarrierStat
 * @property {string|null} code
 * @property {string} name
 * @property {string|null} country
 * @property {string} flag
 * @property {number} flights
 * @property {number} distanceKm
 * @property {number} hours
 * @property {number} share
 */

/**
 * @typedef {Object} TripFocus
 * @property {string} code
 * @property {string} city
 * @property {string} country
 * @property {string} name
 */

/**
 * @typedef {Object} Trip
 * @property {number} id
 * @property {string} start
 * @property {string} end
 * @property {number} days
 * @property {number} legs
 * @property {number} distanceKm
 * @property {string[]} path
 * @property {string[]} countries
 * @property {string[]} carriers
 * @property {TripFocus} focus
 * @property {boolean} international
 * @property {boolean} openJaw
 */

/**
 * @typedef {Object} AirportStat
 * @property {string} code
 * @property {string} name
 * @property {string} city
 * @property {string} country
 * @property {string} flag
 * @property {number} visits
 * @property {number} departures
 * @property {number} arrivals
 * @property {number} lat
 * @property {number} lng
 * @property {string} firstVisit
 * @property {string} lastVisit
 */

/**
 * @typedef {Object} RouteStat
 * @property {string} a
 * @property {string} b
 * @property {number} flights
 * @property {number} distanceKm
 */

/**
 * @typedef {Object} MonthCell
 * @property {string} month
 * @property {number} year
 * @property {number} monthIndex
 * @property {number} flights
 * @property {number} distanceKm
 */

/**
 * @typedef {Object} YearStat
 * @property {number} year
 * @property {number} flights
 * @property {number} distanceKm
 * @property {number} hours
 * @property {number} countries
 * @property {number} airports
 * @property {number} trips
 */

/**
 * @typedef {Object} RecordItem
 * @property {string} id
 * @property {string} label
 * @property {string} value
 * @property {string} detail
 */

/**
 * @typedef {Object} ExtremePoint
 * @property {string} code
 * @property {string} name
 * @property {string} city
 * @property {string} country
 * @property {string} flag
 * @property {number} lat
 * @property {number} lng
 * @property {number} distanceKm
 */

/**
 * @typedef {Object} Extremes
 * @property {ExtremePoint|null} north
 * @property {ExtremePoint|null} south
 * @property {ExtremePoint|null} east
 * @property {ExtremePoint|null} west
 * @property {ExtremePoint|null} farthest
 */

/**
 * @typedef {Object} Passport
 * @property {PassportTotals} totals
 * @property {Stamp[]} stamps
 * @property {ContinentStat[]} continents
 * @property {CarrierStat[]} carriers
 * @property {Trip[]} trips
 * @property {AirportStat[]} airports
 * @property {RouteStat[]} routes
 * @property {MonthCell[]} calendar
 * @property {YearStat[]} years
 * @property {RecordItem[]} records
 * @property {Extremes} extremes
 * @property {string|null} homeCountry iso2 of the country with the most leg endpoints
 * @property {string[]} homeBases      airports dwelled at between legs, dwells desc; [0] anchors `extremes`
 */

/**
 * A flight enriched with its resolved airports, distance and UTC day number.
 * @typedef {Object} Leg
 * @property {number} order
 * @property {string} date
 * @property {number} day
 * @property {string} src
 * @property {string} dest
 * @property {AirportInput} from
 * @property {AirportInput} to
 * @property {string|null} carrier
 * @property {number} km
 * @property {number} hours
 */

const DAY_MS = 86400000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COUNTRIES_IN_WORLD = 195;
/** Segmentation: settling at a home base or the trip origin needs a break this long to close a trip. */
const RETURN_GAP_DAYS = 2;
/** Segmentation: any gap this long starts a new trip, wherever we are. */
const BREAK_GAP_DAYS = 21;
/** Home bases: an airport must hold at least this share of all dwell days. */
const HOME_DWELL_SHARE = 0.1;
const UNKNOWN_CARRIER_NAME = 'Unknown operator';
const MAX_ROUTES = 12;
const EMPTY_VALUE = '—';
const REGIONAL_INDICATOR_A = 0x1f1e6;

const CONTINENT_NAMES = {
  af: 'Africa',
  an: 'Antarctica',
  as: 'Asia',
  eu: 'Europe',
  na: 'North America',
  oc: 'Oceania',
  sa: 'South America',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const RECORD_LABELS = {
  longestFlight: 'Longest flight',
  shortestFlight: 'Shortest flight',
  longestTrip: 'Longest trip',
  busiestYear: 'Busiest year',
  busiestMonth: 'Busiest month',
  longestGap: 'Longest gap',
  mostVisitedAirport: 'Most visited airport',
  busiestRoute: 'Busiest route',
  topCarrier: 'Top carrier',
  farthestPoint: 'Farthest point',
  northernmost: 'Northernmost',
  southernmost: 'Southernmost',
};

/**
 * Turn an ISO 3166-1 alpha-2 code into its flag emoji (two regional indicators).
 * @param {string|null|undefined} iso2
 * @returns {string} '' when the code is not two ASCII letters
 */
export function flagEmoji(iso2) {
  if (typeof iso2 !== 'string' || iso2.length !== 2) return '';
  const first = iso2.toUpperCase().charCodeAt(0) - 65;
  const second = iso2.toUpperCase().charCodeAt(1) - 65;
  if (first < 0 || first > 25 || second < 0 || second > 25) return '';
  return String.fromCodePoint(REGIONAL_INDICATOR_A + first, REGIONAL_INDICATOR_A + second);
}

/**
 * @param {string} value ISO `YYYY-MM-DD`
 * @returns {number|null} days since the epoch, or null when unparseable
 */
function dayNumber(value) {
  const match = ISO_DATE.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

/**
 * @template {{code: string}} T
 * @param {T[]|undefined|null} records
 * @returns {Map<string, T>}
 */
function toMap(records) {
  const map = new Map();
  if (!Array.isArray(records)) return map;
  for (const record of records) {
    if (record && typeof record.code === 'string') map.set(record.code, record);
  }
  return map;
}

/**
 * @param {Map<string, number>} counts
 * @param {string} key
 */
function bump(counts, key) {
  counts.set(key, (counts.get(key) || 0) + 1);
}

/** @param {number} km */
function formatKm(km) {
  return `${km.toLocaleString(undefined, { maximumFractionDigits: 0 })} km`;
}

/** @param {number} hours */
function formatHours(hours) {
  return hours.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * @param {number} count
 * @param {string} noun
 */
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** @param {string} code */
function upper(code) {
  return typeof code === 'string' ? code.toUpperCase() : '';
}

/**
 * Deterministic ascending comparator for the string tie-breakers.
 * @param {string} a
 * @param {string} b
 */
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Normalise, enrich and order the raw flights. Legs whose airports or date
 * cannot be resolved are dropped — they cannot be placed on the globe or the
 * timeline, and guessing would corrupt every downstream total.
 * @param {FlightInput[]|undefined|null} flights
 * @param {Map<string, AirportInput>} airportByCode
 * @returns {Leg[]}
 */
function orderLegs(flights, airportByCode) {
  /** @type {Leg[]} */
  const legs = [];
  if (!Array.isArray(flights)) return legs;
  for (let index = 0; index < flights.length; index += 1) {
    const flight = flights[index];
    if (!flight) continue;
    const from = airportByCode.get(flight.src);
    const to = airportByCode.get(flight.dest);
    if (!from || !to) continue;
    const day = dayNumber(flight.date);
    if (day === null) continue;
    const km = greatCircleKm(from, to);
    legs.push({
      order: typeof flight.id === 'number' ? flight.id : index,
      date: flight.date,
      day,
      src: flight.src,
      dest: flight.dest,
      from,
      to,
      carrier: flight.carrier == null ? null : flight.carrier,
      km,
      hours: blockHours(km),
    });
  }
  legs.sort((a, b) => a.day - b.day || a.order - b.order);
  return legs;
}

/**
 * Walk the itinerary a calendar day at a time, carrying the country of the
 * most recent arrival, and count the days spent outside `homeCountry`.
 * @param {Leg[]} legs
 * @param {string|null} homeCountry
 * @returns {number}
 */
function countDaysAbroad(legs, homeCountry) {
  if (!legs.length || !homeCountry) return 0;
  const lastDay = legs[legs.length - 1].day;
  let position = homeCountry;
  let index = 0;
  let abroad = 0;
  for (let day = legs[0].day; day <= lastDay; day += 1) {
    while (index < legs.length && legs[index].day === day) {
      position = legs[index].to.country;
      index += 1;
    }
    if (position !== homeCountry) abroad += 1;
  }
  return abroad;
}

/**
 * Build one trip from `legs[from..to]`.
 * @param {number} id
 * @param {Leg[]} legs
 * @param {number} from
 * @param {number} to
 * @param {string|null} homeCountry
 * @returns {Trip}
 */
function makeTrip(id, legs, from, to, homeCountry) {
  const first = legs[from];
  const last = legs[to];
  const path = [first.src];
  /** @type {string[]} */
  const countries = [first.from.country];
  /** @type {string[]} */
  const carriers = [];
  let distanceKm = 0;
  let international = false;
  let openJaw = false;
  let focus = first.from;
  let focusKm = 0;

  for (let i = from; i <= to; i += 1) {
    const leg = legs[i];
    distanceKm += leg.km;
    path.push(leg.dest);
    if (countries[countries.length - 1] !== leg.to.country) countries.push(leg.to.country);
    if (leg.carrier && !carriers.includes(leg.carrier)) carriers.push(leg.carrier);
    if (leg.from.country !== homeCountry || leg.to.country !== homeCountry) international = true;
    if (i > from && legs[i - 1].dest !== leg.src) openJaw = true;
    const reach = greatCircleKm(first.from, leg.to);
    if (reach > focusKm) {
      focusKm = reach;
      focus = leg.to;
    }
  }

  return {
    id,
    start: first.date,
    end: last.date,
    days: last.day - first.day + 1,
    legs: to - from + 1,
    distanceKm,
    path,
    countries,
    carriers,
    focus: { code: focus.code, city: focus.city, country: focus.country, name: focus.name },
    international,
    openJaw,
  };
}

/**
 * Segment the ordered legs into trips. A trip closes after leg *i* when the gap
 * to the next leg is long enough to be a journey of its own, or when the leg
 * settles — lands at a home base or back at the trip origin — and a real break
 * follows. The last leg always closes the final trip. Ground travel between two
 * legs (prev.dest !== next.src) never splits a trip.
 * @param {Leg[]} legs
 * @param {string|null} homeCountry
 * @param {string[]} homeBases
 * @returns {Trip[]}
 */
function buildTrips(legs, homeCountry, homeBases) {
  /** @type {Trip[]} */
  const trips = [];
  const bases = new Set(homeBases);
  let start = 0;
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    const next = i + 1 < legs.length ? legs[i + 1] : null;
    const gap = next ? next.day - leg.day : Infinity;
    const settled = bases.has(leg.dest) || leg.dest === legs[start].src;
    if (!next || gap >= BREAK_GAP_DAYS || (gap >= RETURN_GAP_DAYS && settled)) {
      trips.push(makeTrip(trips.length + 1, legs, start, i, homeCountry));
      start = i + 1;
    }
  }
  return trips;
}

/**
 * Airports the traveller actually lives out of. A dwell is an arrival at X whose
 * next leg departs X again after a real break; it weighs as many days as that
 * break lasts, so months at home outrank a fortnight on holiday. Keeps the
 * airports holding a meaningful share of all dwell days, ranked desc, and falls
 * back to the most visited airport when nothing dwells. Must run before
 * segmentation — the bases are what close a trip.
 * @param {Leg[]} legs
 * @param {AirportStat[]} airports visits desc
 * @returns {string[]}
 */
function rankHomeBases(legs, airports) {
  /** @type {Map<string, number>} */
  const dwellDays = new Map();
  let total = 0;
  for (let i = 0; i + 1 < legs.length; i += 1) {
    const leg = legs[i];
    const days = legs[i + 1].day - leg.day;
    if (leg.dest !== legs[i + 1].src || days < RETURN_GAP_DAYS) continue;
    dwellDays.set(leg.dest, (dwellDays.get(leg.dest) || 0) + days);
    total += days;
  }
  const floor = HOME_DWELL_SHARE * total;
  const ranked = Array.from(dwellDays.entries())
    .filter((entry) => entry[1] >= floor)
    .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
    .map((entry) => entry[0]);
  if (ranked.length) return ranked;
  return airports.length ? [airports[0].code] : [];
}

/**
 * Calendar days covered by at least one trip window (windows never overlap,
 * but the clamp keeps the count honest if segmentation ever changes).
 * @param {Trip[]} trips
 * @returns {number}
 */
function countDaysTravelling(trips) {
  let days = 0;
  let coveredThrough = -Infinity;
  for (const trip of trips) {
    const startDay = dayNumber(trip.start);
    const endDay = dayNumber(trip.end);
    if (startDay === null || endDay === null) continue;
    const from = Math.max(startDay, coveredThrough + 1);
    if (endDay >= from) days += endDay - from + 1;
    if (endDay > coveredThrough) coveredThrough = endDay;
  }
  return days;
}

/**
 * @param {Map<string, {flights: number, distanceKm: number}>} monthAcc
 * @param {string|null} firstDate
 * @param {string|null} lastDate
 * @returns {MonthCell[]}
 */
function buildCalendar(monthAcc, firstDate, lastDate) {
  /** @type {MonthCell[]} */
  const cells = [];
  if (!firstDate || !lastDate) return cells;
  const endYear = Number(lastDate.slice(0, 4));
  const endMonth = Number(lastDate.slice(5, 7)) - 1;
  let year = Number(firstDate.slice(0, 4));
  let monthIndex = Number(firstDate.slice(5, 7)) - 1;
  while (year < endYear || (year === endYear && monthIndex <= endMonth)) {
    const month = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const bucket = monthAcc.get(month);
    cells.push({
      month,
      year,
      monthIndex,
      flights: bucket ? bucket.flights : 0,
      distanceKm: bucket ? bucket.distanceKm : 0,
    });
    monthIndex += 1;
    if (monthIndex === 12) {
      monthIndex = 0;
      year += 1;
    }
  }
  return cells;
}

/**
 * @param {AirportStat} airport
 * @param {number} distanceKm
 * @returns {ExtremePoint}
 */
function extremePoint(airport, distanceKm) {
  return {
    code: airport.code,
    name: airport.name,
    city: airport.city,
    country: airport.country,
    flag: airport.flag,
    lat: airport.lat,
    lng: airport.lng,
    distanceKm,
  };
}

/**
 * @param {string} id
 * @param {string} value
 * @param {string} detail
 * @returns {RecordItem}
 */
function record(id, value, detail) {
  return { id, label: RECORD_LABELS[id], value, detail };
}

/**
 * @param {string} id
 * @returns {RecordItem}
 */
function blankRecord(id) {
  return { id, label: RECORD_LABELS[id], value: EMPTY_VALUE, detail: '' };
}

/**
 * Derive the passport from the records served by the API routes.
 *
 * `homeBases` is optional: pass the codes derived from the whole log when
 * building a filtered window, otherwise a single year re-derives them from too
 * little data and starts closing trips at holiday airports. Unknown codes are
 * ignored; an empty or missing list falls back to `rankHomeBases`.
 * @param {{flights?: FlightInput[], airports?: AirportInput[], countries?: CountryInput[], airlines?: AirlineInput[], homeBases?: string[]}} input
 * @returns {Passport}
 */
export function buildPassport(input) {
  const source = input || {};
  const airportByCode = toMap(source.airports);
  const countryByCode = toMap(source.countries);
  const airlineByCode = toMap(source.airlines);
  const legs = orderLegs(source.flights, airportByCode);

  /** @type {Map<string, AirportStat & {}>} */
  const airportAcc = new Map();
  /** @type {Map<string, {code: string, legs: number, entries: number, distanceKm: number, firstArrival: string|null, firstDeparture: string|null, lastVisit: string|null, airports: Set<string>, cities: Map<string, number>}>} */
  const countryAcc = new Map();
  /** @type {Map<string, {code: string, legs: number, distanceKm: number, countries: Set<string>}>} */
  const continentAcc = new Map();
  /** @type {Map<string|null, {code: string|null, flights: number, distanceKm: number, hours: number}>} */
  const carrierAcc = new Map();
  /** @type {Map<string, RouteStat>} */
  const routeAcc = new Map();
  /** @type {Map<string, {flights: number, distanceKm: number}>} */
  const monthAcc = new Map();
  /** @type {Map<number, {year: number, flights: number, distanceKm: number, hours: number, countries: Set<string>, airports: Set<string>, trips: number}>} */
  const yearAcc = new Map();
  /** @type {Map<string, number>} */
  const endpointCounts = new Map();
  /** @type {Set<string>} */
  const cityKeys = new Set();

  let distanceKm = 0;
  let hoursInAir = 0;
  /** @type {Leg|null} */
  let longestLeg = null;
  /** @type {Leg|null} */
  let shortestLeg = null;
  /** @type {{days: number, from: string, to: string}|null} */
  let longestGap = null;

  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    distanceKm += leg.km;
    hoursInAir += leg.hours;

    touchAirport(airportAcc, leg.from, leg.date, false);
    touchAirport(airportAcc, leg.to, leg.date, true);
    cityKeys.add(`${leg.from.city}, ${leg.from.country}`);
    cityKeys.add(`${leg.to.city}, ${leg.to.country}`);
    bump(endpointCounts, leg.from.country);
    bump(endpointCounts, leg.to.country);

    const fromCountry = countryEntry(countryAcc, leg.from.country);
    const toCountry = leg.from.country === leg.to.country
      ? fromCountry
      : countryEntry(countryAcc, leg.to.country);
    fromCountry.legs += 1;
    if (!fromCountry.firstDeparture) fromCountry.firstDeparture = leg.date;
    fromCountry.lastVisit = leg.date;
    fromCountry.airports.add(leg.src);
    bump(fromCountry.cities, leg.from.city);
    if (toCountry !== fromCountry) toCountry.legs += 1;
    toCountry.entries += 1;
    toCountry.distanceKm += leg.km;
    if (!toCountry.firstArrival) toCountry.firstArrival = leg.date;
    toCountry.lastVisit = leg.date;
    toCountry.airports.add(leg.dest);
    bump(toCountry.cities, leg.to.city);

    const fromContinent = continentOf(countryByCode, leg.from.country);
    const toContinent = continentOf(countryByCode, leg.to.country);
    if (fromContinent) {
      const entry = continentEntry(continentAcc, fromContinent);
      entry.legs += 1;
      entry.countries.add(leg.from.country);
    }
    if (toContinent) {
      const entry = continentEntry(continentAcc, toContinent);
      if (toContinent !== fromContinent) entry.legs += 1;
      entry.distanceKm += leg.km;
      entry.countries.add(leg.to.country);
    }

    let carrier = carrierAcc.get(leg.carrier);
    if (!carrier) {
      carrier = { code: leg.carrier, flights: 0, distanceKm: 0, hours: 0 };
      carrierAcc.set(leg.carrier, carrier);
    }
    carrier.flights += 1;
    carrier.distanceKm += leg.km;
    carrier.hours += leg.hours;

    const routeKey = leg.src < leg.dest ? `${leg.src}-${leg.dest}` : `${leg.dest}-${leg.src}`;
    let route = routeAcc.get(routeKey);
    if (!route) {
      route = {
        a: leg.src < leg.dest ? leg.src : leg.dest,
        b: leg.src < leg.dest ? leg.dest : leg.src,
        flights: 0,
        distanceKm: 0,
      };
      routeAcc.set(routeKey, route);
    }
    route.flights += 1;
    route.distanceKm += leg.km;

    const monthKey = leg.date.slice(0, 7);
    let month = monthAcc.get(monthKey);
    if (!month) {
      month = { flights: 0, distanceKm: 0 };
      monthAcc.set(monthKey, month);
    }
    month.flights += 1;
    month.distanceKm += leg.km;

    const yearNumber = Number(leg.date.slice(0, 4));
    let year = yearAcc.get(yearNumber);
    if (!year) {
      year = {
        year: yearNumber,
        flights: 0,
        distanceKm: 0,
        hours: 0,
        countries: new Set(),
        airports: new Set(),
        trips: 0,
      };
      yearAcc.set(yearNumber, year);
    }
    year.flights += 1;
    year.distanceKm += leg.km;
    year.hours += leg.hours;
    year.countries.add(leg.from.country);
    year.countries.add(leg.to.country);
    year.airports.add(leg.src);
    year.airports.add(leg.dest);

    if (!longestLeg || leg.km > longestLeg.km) longestLeg = leg;
    if (!shortestLeg || leg.km < shortestLeg.km) shortestLeg = leg;

    const next = i + 1 < legs.length ? legs[i + 1] : null;
    if (next) {
      const gap = next.day - leg.day;
      if (!longestGap || gap > longestGap.days) {
        longestGap = { days: gap, from: leg.date, to: next.date };
      }
    }
  }

  const firstFlight = legs.length ? legs[0].date : null;
  const lastFlight = legs.length ? legs[legs.length - 1].date : null;

  let homeCountry = null;
  let homeEndpoints = 0;
  for (const [country, count] of endpointCounts) {
    if (count > homeEndpoints || (count === homeEndpoints && homeCountry !== null && country < homeCountry)) {
      homeCountry = country;
      homeEndpoints = count;
    }
  }

  const airports = Array.from(airportAcc.values())
    .sort((a, b) => b.visits - a.visits || compareText(a.code, b.code));

  const givenBases = Array.isArray(source.homeBases)
    ? source.homeBases.filter((code) => airportByCode.has(code))
    : [];
  const homeBases = givenBases.length ? givenBases : rankHomeBases(legs, airports);
  const trips = buildTrips(legs, homeCountry, homeBases);
  for (const trip of trips) {
    const year = yearAcc.get(Number(trip.start.slice(0, 4)));
    if (year) year.trips += 1;
  }

  const stamps = Array.from(countryAcc.values())
    .map((entry) => {
      const meta = countryByCode.get(entry.code);
      const continent = meta ? meta.continent : '';
      let latSum = 0;
      let lngSum = 0;
      for (const code of entry.airports) {
        const airport = airportByCode.get(code);
        latSum += airport.lat;
        lngSum += airport.lng;
      }
      return {
        country: entry.code,
        name: meta ? meta.name : upper(entry.code),
        flag: flagEmoji(entry.code),
        continent,
        continentName: CONTINENT_NAMES[continent] || '',
        entries: entry.entries,
        legs: entry.legs,
        firstVisit: entry.firstArrival || entry.firstDeparture || '',
        lastVisit: entry.lastVisit || '',
        airports: Array.from(entry.airports)
          .sort((a, b) => visitsOf(airportAcc, b) - visitsOf(airportAcc, a) || compareText(a, b)),
        cities: Array.from(entry.cities.entries())
          .sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))
          .map((city) => city[0]),
        distanceKm: entry.distanceKm,
        lat: entry.airports.size ? latSum / entry.airports.size : 0,
        lng: entry.airports.size ? lngSum / entry.airports.size : 0,
        home: entry.code === homeCountry,
      };
    })
    .sort((a, b) => compareText(a.firstVisit, b.firstVisit) || compareText(a.country, b.country));

  const continents = Array.from(continentAcc.values())
    .map((entry) => ({
      code: entry.code,
      name: CONTINENT_NAMES[entry.code] || upper(entry.code),
      countries: entry.countries.size,
      legs: entry.legs,
      distanceKm: entry.distanceKm,
    }))
    .sort((a, b) => b.countries - a.countries || b.legs - a.legs || compareText(a.code, b.code));

  const carriers = Array.from(carrierAcc.values())
    .map((entry) => {
      const airline = entry.code ? airlineByCode.get(entry.code) : null;
      const country = airline && airline.country ? airline.country : null;
      return {
        code: entry.code,
        name: airline ? airline.name : entry.code ? upper(entry.code) : UNKNOWN_CARRIER_NAME,
        country,
        flag: country ? flagEmoji(country) : '',
        flights: entry.flights,
        distanceKm: entry.distanceKm,
        hours: entry.hours,
        share: distanceKm > 0 ? entry.distanceKm / distanceKm : 0,
      };
    })
    .sort((a, b) => b.distanceKm - a.distanceKm || b.flights - a.flights || compareText(a.name, b.name));

  const routes = Array.from(routeAcc.values())
    .sort((a, b) => b.flights - a.flights || b.distanceKm - a.distanceKm
      || compareText(a.a, b.a) || compareText(a.b, b.b))
    .slice(0, MAX_ROUTES);

  const years = Array.from(yearAcc.values())
    .map((entry) => ({
      year: entry.year,
      flights: entry.flights,
      distanceKm: entry.distanceKm,
      hours: entry.hours,
      countries: entry.countries.size,
      airports: entry.airports.size,
      trips: entry.trips,
    }))
    .sort((a, b) => a.year - b.year);

  const calendar = buildCalendar(monthAcc, firstFlight, lastFlight);

  const baseCode = homeBases.length ? homeBases[0] : airports.length ? airports[0].code : null;
  const base = baseCode ? airportByCode.get(baseCode) : null;
  /** @type {Extremes} */
  const extremes = { north: null, south: null, east: null, west: null, farthest: null };
  let north = null;
  let south = null;
  let east = null;
  let west = null;
  let farthest = null;
  let farthestKm = -1;
  for (const airport of airports) {
    const reach = base ? greatCircleKm(base, airport) : 0;
    if (!north || airport.lat > north.lat) north = airport;
    if (!south || airport.lat < south.lat) south = airport;
    if (!east || airport.lng > east.lng) east = airport;
    if (!west || airport.lng < west.lng) west = airport;
    if (reach > farthestKm) {
      farthestKm = reach;
      farthest = airport;
    }
  }
  if (north) extremes.north = extremePoint(north, base ? greatCircleKm(base, north) : 0);
  if (south) extremes.south = extremePoint(south, base ? greatCircleKm(base, south) : 0);
  if (east) extremes.east = extremePoint(east, base ? greatCircleKm(base, east) : 0);
  if (west) extremes.west = extremePoint(west, base ? greatCircleKm(base, west) : 0);
  if (farthest) extremes.farthest = extremePoint(farthest, farthestKm);

  const daysAbroad = countDaysAbroad(legs, homeCountry);
  const daysTravelling = countDaysTravelling(trips);
  const knownCarriers = carriers.reduce((count, carrier) => count + (carrier.code ? 1 : 0), 0);

  /** @type {PassportTotals} */
  const totals = {
    flights: legs.length,
    distanceKm,
    hoursInAir,
    earthCircuits: distanceKm / EARTH_CIRCUMFERENCE_KM,
    moonPercent: (distanceKm / MOON_DISTANCE_KM) * 100,
    airports: airports.length,
    cities: cityKeys.size,
    countries: stamps.length,
    continents: continents.length,
    carriers: knownCarriers,
    trips: trips.length,
    daysAbroad,
    daysTravelling,
    worldPercent: (stamps.length / COUNTRIES_IN_WORLD) * 100,
    firstFlight,
    lastFlight,
  };

  return {
    totals,
    stamps,
    continents,
    carriers,
    trips,
    airports,
    routes,
    calendar,
    years,
    records: buildRecords({
      longestLeg,
      shortestLeg,
      trips,
      years,
      calendar,
      longestGap,
      airports,
      routes,
      carriers,
      extremes,
      baseCode,
    }),
    extremes,
    homeCountry,
    homeBases,
  };
}

/**
 * @param {Map<string, AirportStat>} acc
 * @param {AirportInput} airport
 * @param {string} date
 * @param {boolean} arrival
 */
function touchAirport(acc, airport, date, arrival) {
  let entry = acc.get(airport.code);
  if (!entry) {
    entry = {
      code: airport.code,
      name: airport.name,
      city: airport.city,
      country: airport.country,
      flag: flagEmoji(airport.country),
      visits: 0,
      departures: 0,
      arrivals: 0,
      lat: airport.lat,
      lng: airport.lng,
      firstVisit: date,
      lastVisit: date,
    };
    acc.set(airport.code, entry);
  }
  entry.visits += 1;
  if (arrival) entry.arrivals += 1;
  else entry.departures += 1;
  entry.lastVisit = date;
}

/**
 * @param {Map<string, AirportStat>} acc
 * @param {string} code
 */
function visitsOf(acc, code) {
  const entry = acc.get(code);
  return entry ? entry.visits : 0;
}

/**
 * @param {Map<string, {code: string, legs: number, entries: number, distanceKm: number, firstArrival: string|null, firstDeparture: string|null, lastVisit: string|null, airports: Set<string>, cities: Map<string, number>}>} acc
 * @param {string} code
 */
function countryEntry(acc, code) {
  let entry = acc.get(code);
  if (!entry) {
    entry = {
      code,
      legs: 0,
      entries: 0,
      distanceKm: 0,
      firstArrival: null,
      firstDeparture: null,
      lastVisit: null,
      airports: new Set(),
      cities: new Map(),
    };
    acc.set(code, entry);
  }
  return entry;
}

/**
 * @param {Map<string, CountryInput>} countryByCode
 * @param {string} code
 * @returns {string|null}
 */
function continentOf(countryByCode, code) {
  const meta = countryByCode.get(code);
  return meta && meta.continent ? meta.continent : null;
}

/**
 * @param {Map<string, {code: string, legs: number, distanceKm: number, countries: Set<string>}>} acc
 * @param {string} code
 */
function continentEntry(acc, code) {
  let entry = acc.get(code);
  if (!entry) {
    entry = { code, legs: 0, distanceKm: 0, countries: new Set() };
    acc.set(code, entry);
  }
  return entry;
}

/**
 * The twelve headline records, always in contract order, with the strings the
 * UI prints verbatim.
 * @param {{longestLeg: Leg|null, shortestLeg: Leg|null, trips: Trip[], years: YearStat[], calendar: MonthCell[], longestGap: {days: number, from: string, to: string}|null, airports: AirportStat[], routes: RouteStat[], carriers: CarrierStat[], extremes: Extremes, baseCode: string|null}} parts
 * @returns {RecordItem[]}
 */
function buildRecords(parts) {
  const {
    longestLeg, shortestLeg, trips, years, calendar, longestGap,
    airports, routes, carriers, extremes, baseCode,
  } = parts;

  /** @type {Trip|null} */
  let longestTrip = null;
  for (const trip of trips) {
    if (!longestTrip || trip.days > longestTrip.days || (trip.days === longestTrip.days && trip.distanceKm > longestTrip.distanceKm)) {
      longestTrip = trip;
    }
  }

  /** @type {YearStat|null} */
  let busiestYear = null;
  for (const year of years) {
    if (!busiestYear || year.flights > busiestYear.flights) busiestYear = year;
  }

  /** @type {MonthCell|null} */
  let busiestMonth = null;
  for (const cell of calendar) {
    if (cell.flights > 0 && (!busiestMonth || cell.flights > busiestMonth.flights)) busiestMonth = cell;
  }

  const topAirport = airports.length ? airports[0] : null;
  const topRoute = routes.length ? routes[0] : null;
  const topCarrier = carriers.find((carrier) => carrier.code !== null) || null;
  const north = extremes.north;
  const south = extremes.south;
  const farthest = extremes.farthest;

  return [
    longestLeg
      ? record('longestFlight', `${upper(longestLeg.src)} → ${upper(longestLeg.dest)}`,
        `${formatKm(longestLeg.km)} · ${formatHours(longestLeg.hours)} h · ${longestLeg.date}`)
      : blankRecord('longestFlight'),
    shortestLeg
      ? record('shortestFlight', `${upper(shortestLeg.src)} → ${upper(shortestLeg.dest)}`,
        `${formatKm(shortestLeg.km)} · ${formatHours(shortestLeg.hours)} h · ${shortestLeg.date}`)
      : blankRecord('shortestFlight'),
    longestTrip
      ? record('longestTrip', plural(longestTrip.days, 'day'),
        `${longestTrip.focus.city} · ${plural(longestTrip.legs, 'leg')} · ${formatKm(longestTrip.distanceKm)}`)
      : blankRecord('longestTrip'),
    busiestYear
      ? record('busiestYear', String(busiestYear.year),
        `${plural(busiestYear.flights, 'flight')} · ${formatKm(busiestYear.distanceKm)}`)
      : blankRecord('busiestYear'),
    busiestMonth
      ? record('busiestMonth', `${MONTH_NAMES[busiestMonth.monthIndex]} ${busiestMonth.year}`,
        plural(busiestMonth.flights, 'flight'))
      : blankRecord('busiestMonth'),
    longestGap
      ? record('longestGap', plural(longestGap.days, 'day'), `${longestGap.from} → ${longestGap.to}`)
      : blankRecord('longestGap'),
    topAirport
      ? record('mostVisitedAirport', upper(topAirport.code),
        `${plural(topAirport.visits, 'visit')} · ${topAirport.city}`)
      : blankRecord('mostVisitedAirport'),
    topRoute
      ? record('busiestRoute', `${upper(topRoute.a)} ↔ ${upper(topRoute.b)}`, plural(topRoute.flights, 'flight'))
      : blankRecord('busiestRoute'),
    topCarrier
      ? record('topCarrier', topCarrier.name,
        `${plural(topCarrier.flights, 'flight')} · ${formatKm(topCarrier.distanceKm)}`)
      : blankRecord('topCarrier'),
    farthest && baseCode
      ? record('farthestPoint', upper(farthest.code),
        `${formatKm(farthest.distanceKm)} from ${upper(baseCode)} · ${farthest.city}`)
      : blankRecord('farthestPoint'),
    north
      ? record('northernmost', upper(north.code), `${formatDegrees(north.lat, 'N', 'S')} · ${north.city}`)
      : blankRecord('northernmost'),
    south
      ? record('southernmost', upper(south.code), `${formatDegrees(south.lat, 'N', 'S')} · ${south.city}`)
      : blankRecord('southernmost'),
  ];
}

/**
 * @param {number} value
 * @param {string} positive
 * @param {string} negative
 */
function formatDegrees(value, positive, negative) {
  return `${Math.abs(value).toFixed(1)}° ${value >= 0 ? positive : negative}`;
}
