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
 * Spherical centroid of a set of points — the camera target that frames a whole
 * trip. Averaging the unit vectors avoids the wrap-around bug of averaging
 * degrees, and a round trip centres between its stops instead of on its origin.
 * @param {GeoPoint[]} points
 * @returns {GeoPoint|null}
 */
export function centroid(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  let count = 0;
  for (const point of points) {
    const lat = point.lat * DEG_TO_RAD;
    const lng = point.lng * DEG_TO_RAD;
    const cosLat = Math.cos(lat);
    x += cosLat * Math.cos(lng);
    y += cosLat * Math.sin(lng);
    z += Math.sin(lat);
    count += 1;
  }
  if (count === 0) return null;
  x /= count;
  y /= count;
  z /= count;
  const hyp = Math.hypot(x, y);
  if (hyp < 1e-9 && Math.abs(z) < 1e-9) return { lat: points[0].lat, lng: points[0].lng };
  return { lat: Math.atan2(z, hyp) / DEG_TO_RAD, lng: Math.atan2(y, x) / DEG_TO_RAD };
}

/**
 * Block-hours estimate for a leg of `km` kilometres.
 * @param {number} km
 * @returns {number}
 */
export function blockHours(km) {
  return km / CRUISE_SPEED_KMH + GROUND_TIME_H;
}
