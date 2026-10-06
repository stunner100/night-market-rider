export interface RoadFrame {
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  width: number;
  highway: string;
  roadId: string;
  t: number;
  segmentLength: number;
  segmentIndex: number;
}

export interface RoadsideSpot {
  x: number;
  z: number;
  yaw: number;
}

export interface PlacementQuery {
  nearestFrame(x: number, z: number, maxDistance: number): RoadFrame | null;
  blocked(x: number, z: number): boolean;
}

export function offsetSide(frame: RoadFrame, side: 1 | -1, extra: number): { x: number; z: number } {
  const distance = frame.width * 0.5 + extra;
  return {
    x: frame.x + frame.normalX * side * distance,
    z: frame.z + frame.normalZ * side * distance,
  };
}

/** Face back toward the carriageway from a sidewalk on `side`. */
export function yawTowardRoad(frame: RoadFrame, side: 1 | -1): number {
  return Math.atan2(-frame.normalX * side, -frame.normalZ * side);
}

/** Long axis of a speed ramp should run across the carriageway. */
export function rampYaw(normalX: number, normalZ: number): number {
  return Math.atan2(-normalZ, normalX);
}

export function chooseRoadside(query: PlacementQuery, x: number, z: number): RoadsideSpot | null {
  const frame = query.nearestFrame(x, z, 48);
  if (frame) {
    for (const extra of [1.6, 2.8, 4.4]) {
      for (const side of [1, -1] as const) {
        const spot = offsetSide(frame, side, extra);
        if (query.blocked(spot.x, spot.z)) continue;
        return { x: spot.x, z: spot.z, yaw: yawTowardRoad(frame, side) };
      }
    }
  }
  return scanAround(query, x, z);
}

function scanAround(query: PlacementQuery, x: number, z: number): RoadsideSpot | null {
  for (const extra of [4.5, 7, 10]) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const px = x + Math.sin(angle) * extra;
      const pz = z + Math.cos(angle) * extra;
      if (query.blocked(px, pz)) continue;
      return { x: px, z: pz, yaw: Math.atan2(x - px, z - pz) };
    }
  }
  return null;
}
