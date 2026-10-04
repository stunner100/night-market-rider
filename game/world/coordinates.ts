import type { WorldPoint } from "./types";

export const EARTH_RADIUS_M = 6378137;

export function latLonToWorld(
  lat: number,
  lon: number,
  origin: { lat: number; lon: number }
): WorldPoint {
  const lat0 = origin.lat * Math.PI / 180;
  return {
    x: (lon - origin.lon) * Math.PI / 180 * EARTH_RADIUS_M * Math.cos(lat0),
    z: -(lat - origin.lat) * Math.PI / 180 * EARTH_RADIUS_M,
  };
}

export function worldToLatLon(
  x: number,
  z: number,
  origin: { lat: number; lon: number }
): { lat: number; lon: number } {
  const lat0 = origin.lat * Math.PI / 180;
  return {
    lat: origin.lat - (z / EARTH_RADIUS_M) * 180 / Math.PI,
    lon: origin.lon + (x / (EARTH_RADIUS_M * Math.cos(lat0))) * 180 / Math.PI,
  };
}

export function chunkCoord(v: number, chunkSize: number): number {
  return Math.floor(v / chunkSize);
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx}_${cz}`;
}

export function chunkForPoint(x: number, z: number, chunkSize: number): { cx: number; cz: number; key: string } {
  const cx = chunkCoord(x, chunkSize);
  const cz = chunkCoord(z, chunkSize);
  return { cx, cz, key: chunkKey(cx, cz) };
}

export function distancePointToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 <= 1e-8) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / len2));
  const qx = ax + abx * t;
  const qz = az + abz * t;
  return Math.hypot(px - qx, pz - qz);
}

export function nearestPointOnSegment(
  px: number,
  pz: number,
  a: WorldPoint,
  b: WorldPoint
): { point: WorldPoint; t: number; distance: number } {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  const t = len2 <= 1e-8 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * abx + (pz - a.z) * abz) / len2));
  const point = { x: a.x + abx * t, z: a.z + abz * t };
  return { point, t, distance: Math.hypot(px - point.x, pz - point.z) };
}
