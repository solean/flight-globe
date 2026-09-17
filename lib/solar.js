/**
 * Solar geometry for the day/night terminator overlay. Pure ESM, no deps and no
 * React, so the globe and any script can share it. Everything here reads the
 * passed `Date` through its `getUTC*` accessors only — no local-timezone
 * dependence and no mutation of the caller's object.
 *
 * Model: NOAA's low-precision solar position equations (the ones behind their
 * solar calculation spreadsheet), driven by the fractional year.
 */

/**
 * @typedef {Object} GeoPoint
 * @property {number} lat
 * @property {number} lng
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const TWO_PI = 2 * Math.PI;
const MS_PER_DAY = 86400000;
/** Mean tropical year in days — the period of the fractional-year angle. */
const TROPICAL_YEAR_DAYS = 365.2422;
/** Phase anchor of the fractional-year angle: 2000-01-01T00:00:00Z. */
const EPOCH_MS = Date.UTC(2000, 0, 1);

/**
 * Validated UTC epoch milliseconds for a solar calculation.
 * @param {Date} date
 * @returns {number}
 */
function epochMs(date) {
  if (!(date instanceof Date)) {
    throw new TypeError('solar: expected a Date instance');
  }
  const ms = date.getTime();
  if (Number.isNaN(ms)) {
    throw new TypeError('solar: expected a valid Date (got an Invalid Date)');
  }
  return ms;
}

/**
 * Fractional year γ in radians — the argument of NOAA's low-precision series.
 *
 * NOAA writes it as `2π/365 · (dayOfYear - 1 + (hour - 12)/24)`, which assumes
 * the calendar year and the tropical year stay in step. They do not: the
 * day-of-year form drifts by up to ±0.6° of declination near the equinoxes
 * depending on where the year sits in the leap cycle. So the day-of-year and
 * time-of-day (both UTC) are folded into days since a fixed epoch and the angle
 * is taken modulo the mean tropical year, which keeps declination inside 0.05°
 * of NOAA's high-precision algorithm for any year in this century.
 *
 * @param {Date} date
 * @returns {number}
 */
function fractionalYear(date) {
  const ms = epochMs(date);
  const year = date.getUTCFullYear();
  const yearStartMs = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((ms - yearStartMs) / MS_PER_DAY) + 1;
  const hours = utcHours(date);
  const days = (yearStartMs - EPOCH_MS) / MS_PER_DAY + (dayOfYear - 1) + hours / 24;
  const turns = days / TROPICAL_YEAR_DAYS;
  return TWO_PI * (turns - Math.floor(turns));
}

/**
 * Declination in degrees from a fractional-year angle.
 * @param {number} g
 * @returns {number}
 */
function declinationFromGamma(g) {
  const radians =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  return radians * RAD_TO_DEG;
}

/**
 * Equation of time in minutes from a fractional-year angle.
 * @param {number} g
 * @returns {number}
 */
function eotFromGamma(g) {
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  );
}

/**
 * Fractional hour of day in UTC.
 * @param {Date} date
 * @returns {number}
 */
function utcHours(date) {
  return (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000
  );
}

/**
 * Solar declination in degrees for an instant (NOAA low-precision model).
 * @param {Date} date
 * @returns {number}
 */
export function solarDeclination(date) {
  return declinationFromGamma(fractionalYear(date));
}

/**
 * Equation of time in minutes (apparent solar time minus mean solar time).
 * @param {Date} date
 * @returns {number}
 */
export function equationOfTimeMinutes(date) {
  return eotFromGamma(fractionalYear(date));
}

/**
 * Wrap a longitude in degrees into [-180, 180).
 * @param {number} lng
 * @returns {number}
 */
function normaliseLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/**
 * Point on Earth where the sun is directly overhead.
 * @param {Date} date
 * @returns {GeoPoint} lat/lng in degrees, lng in [-180, 180)
 */
export function subsolarPoint(date) {
  const g = fractionalYear(date);
  const hours = utcHours(date);
  const eot = eotFromGamma(g);
  return {
    lat: declinationFromGamma(g),
    lng: normaliseLng(-15 * (hours + eot / 60 - 12)),
  };
}

/**
 * Point diametrically opposite the subsolar point (centre of the night side).
 * @param {Date} date
 * @returns {GeoPoint}
 */
export function antisolarPoint(date) {
  const sun = subsolarPoint(date);
  return { lat: -sun.lat, lng: normaliseLng(sun.lng + 180) };
}

/**
 * Closed ring of points 90° of arc from the subsolar point — the day/night
 * terminator. Walked by bearing 0..360, with the first point repeated at the
 * end so the ring closes.
 * @param {Date} date
 * @param {number} [steps] number of distinct points around the ring
 * @returns {GeoPoint[]} `steps + 1` points, lng in [-180, 180)
 */
export function terminatorRing(date, steps = 180) {
  const sun = subsolarPoint(date);
  const count = Math.max(3, Math.floor(steps));
  const lat1 = sun.lat * DEG_TO_RAD;
  const lng1 = sun.lng * DEG_TO_RAD;
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const ring = new Array(count + 1);
  // Destination point at central angle π/2: cos(d) = 0, sin(d) = 1.
  for (let i = 0; i < count; i += 1) {
    const bearing = (TWO_PI * i) / count;
    const sinLat2 = cosLat1 * Math.cos(bearing);
    const lat2 = Math.asin(sinLat2);
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * cosLat1, -sinLat1 * sinLat2);
    ring[i] = { lat: lat2 * RAD_TO_DEG, lng: normaliseLng(lng2 * RAD_TO_DEG) };
  }
  ring[count] = { lat: ring[0].lat, lng: ring[0].lng };
  return ring;
}
