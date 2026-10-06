import { rampYaw } from "./roadside-placement";

export type HazardKind = "pothole" | "ramp" | "coin";

export interface RoadSample {
  roadId: string;
  highway: string;
  width: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  index: number;
}

export interface HazardSpot {
  kind: HazardKind;
  id: string;
  x: number;
  z: number;
  yaw: number;
  radius: number;
}

export interface KeepClear {
  x: number;
  z: number;
  r: number;
}

const POTHOLE_ROADS = new Set(["residential", "unclassified", "tertiary", "service", "living_street"]);
const RAMP_ROADS = new Set(["residential", "tertiary", "unclassified"]);
const COIN_ROADS = new Set(["residential", "unclassified", "tertiary", "secondary", "service", "living_street"]);

export function hash32(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function allowsPothole(highway: string): boolean {
  return POTHOLE_ROADS.has(highway);
}

export function allowsRamp(highway: string): boolean {
  return RAMP_ROADS.has(highway);
}

function kindFor(segment: RoadSample, bucket: number): HazardKind | null {
  if (segment.length >= 18 && allowsPothole(segment.highway)) {
    const limit = segment.highway === "tertiary" ? 4 : 8;
    if (bucket < limit) return "pothole";
  }
  if (segment.length >= 28 && allowsRamp(segment.highway) && bucket >= 8 && bucket < 12) return "ramp";
  if (segment.length >= 14 && COIN_ROADS.has(segment.highway) && bucket >= 40 && bucket < 52) return "coin";
  return null;
}

function blocked(x: number, z: number, zones: KeepClear[]): boolean {
  for (const zone of zones) {
    if (Math.hypot(x - zone.x, z - zone.z) < zone.r) return true;
  }
  return false;
}

export function planHazards(
  segments: RoadSample[],
  zones: KeepClear[],
  player: { x: number; z: number },
  maxDistance = 170
): HazardSpot[] {
  const spots: (HazardSpot & { dist: number })[] = [];
  for (const segment of segments) {
    if (segment.length < 8) continue;
    const x = (segment.ax + segment.bx) / 2;
    const z = (segment.az + segment.bz) / 2;
    const dist = Math.hypot(x - player.x, z - player.z);
    if (dist < 12 || dist > maxDistance) continue;
    const bucket = hash32(`${segment.roadId}:${segment.index}`) % 100;
    const kind = kindFor(segment, bucket);
    if (!kind) continue;
    const len = segment.length || 1;
    const tx = (segment.bx - segment.ax) / len;
    const tz = (segment.bz - segment.az) / len;
    const nx = -tz;
    const nz = tx;
    const lateral = kind === "coin" ? 1.15 : 0;
    const px = x + nx * lateral;
    const pz = z + nz * lateral;
    if (blocked(px, pz, zones)) continue;
    spots.push({
      kind,
      id: `${kind}:${segment.roadId}:${segment.index}`,
      x: px,
      z: pz,
      yaw: kind === "ramp" ? rampYaw(nx, nz) : Math.atan2(tx, tz),
      radius: kind === "pothole" ? 1.35 : kind === "ramp" ? 1.7 : 1.1,
      dist,
    });
  }
  spots.sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));
  const caps: Record<HazardKind, number> = { pothole: 14, ramp: 5, coin: 18 };
  const counts: Record<HazardKind, number> = { pothole: 0, ramp: 0, coin: 0 };
  const kept: HazardSpot[] = [];
  for (const spot of spots) {
    if (counts[spot.kind] >= caps[spot.kind]) continue;
    counts[spot.kind] += 1;
    const { dist: _dist, ...rest } = spot;
    kept.push(rest);
  }
  return kept;
}
