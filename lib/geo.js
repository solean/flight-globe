/**
 * Shared geometry + block-time helpers. Imported by the globe and by the
 * passport derivation, so it stays free of React and of any data imports.
 */

/**
 * @typedef {Object} GeoPoint
 * @property {number} lat
 * @property {number} lng
 */

const DEG_TO_RAD = Math.PI / 180;

/** Mean earth radius used for every great-circle distance in the app. */
export const EARTH_RADIUS_KM = 6371;
/** Equatorial circumference — denominator of the "times around the world" stat. */
export const EARTH_CIRCUMFERENCE_KM = 40075.016686;
/** Mean earth-to-moon distance — denominator of the "to the moon" stat. */
export const MOON_DISTANCE_KM = 384400;
/** Block-time model: long-haul cruise speed. */
export const CRUISE_SPEED_KMH = 830;
/** Block-time model: fixed taxi + climb + descent overhead per leg. */
export const GROUND_TIME_H = 0.5;

/**
 * Central angle between two points, in radians (haversine).
 * @param {GeoPoint} a
 * @param {GeoPoint} b
 * @returns {number}
 */
export function greatCircleRadians(a, b) {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Great-circle distance between two points, in kilometres.
 * @param {GeoPoint} a
 * @param {GeoPoint} b
 * @returns {number}
 */
export function greatCircleKm(a, b) {
  return greatCircleRadians(a, b) * EARTH_RADIUS_KM;
}

/**
 * globe.gl arc altitude: short hops stay close to the surface, long hauls bow out.
 * @param {GeoPoint} a
 * @param {GeoPoint} b
 * @returns {number}
 */
export function arcAltitude(a, b) {
  return 0.06 + 0.24 * (greatCircleRadians(a, b) / Math.PI);
}

/**
 * Block-hours estimate for a leg of `km` kilometres.
 * @param {number} km
 * @returns {number}
 */
export function blockHours(km) {
  return km / CRUISE_SPEED_KMH + GROUND_TIME_H;
}
