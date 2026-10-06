export type DistanceMode = "osm" | "procedural";

/** Procedural world stored distance in coarse cells. OSM world units are metres. */
export const PROCEDURAL_METRES_PER_UNIT = 8;

export function worldUnitsToMetres(units: number, mode: DistanceMode): number {
  if (!Number.isFinite(units)) return 0;
  const metres = mode === "osm" ? units : units * PROCEDURAL_METRES_PER_UNIT;
  return Math.max(0, metres);
}

export function formatMetres(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "0 m";
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatWorldDistance(units: number, mode: DistanceMode): string {
  return formatMetres(worldUnitsToMetres(units, mode));
}

export function polylineLength(points: { x: number; z: number }[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return total;
}

/** Metres still to travel along a polyline from the closest point to the end. */
export function remainingPolylineMetres(points: { x: number; z: number }[], x: number, z: number): number {
  if (points.length < 2) return 0;
  let bestI = 0;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 <= 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
    const qx = a.x + abx * t;
    const qz = a.z + abz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < bestD) { bestD = d; bestI = i; bestT = t; }
  }
  const a = points[bestI];
  const b = points[bestI + 1];
  let remaining = Math.hypot(b.x - a.x, b.z - a.z) * (1 - bestT);
  for (let i = bestI + 1; i < points.length - 1; i++) {
    remaining += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].z - points[i].z);
  }
  return remaining;
}
