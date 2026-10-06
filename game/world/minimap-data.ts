import type { WorldPoint, WorldRoad } from "./types";

export interface MinimapSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  highway: string;
}

export interface MinimapLandmark {
  x: number;
  z: number;
  name: string;
}

export interface MinimapFrame {
  radius: number;
  roads: MinimapSegment[];
  route: WorldPoint[];
  pickup: WorldPoint | null;
  drop: WorldPoint | null;
  fuel: WorldPoint[];
  landmarks: MinimapLandmark[];
}

function near(x: number, z: number, px: number, pz: number, radius: number): boolean {
  return Math.hypot(x - px, z - pz) <= radius;
}

/** Stations inside the map, plus the nearest one farther out so it can sit on the rim. */
export function visibleFuel(stations: WorldPoint[], px: number, pz: number, radius: number, guideReach = 800): WorldPoint[] {
  const inside = stations.filter(station => near(station.x, station.z, px, pz, radius));
  let nearest: WorldPoint | null = null;
  let best = guideReach;
  for (const station of stations) {
    const distance = Math.hypot(station.x - px, station.z - pz);
    if (distance < best) { best = distance; nearest = station; }
  }
  if (!nearest || best <= radius) return inside;
  return inside.concat([nearest]);
}

export function buildMinimapFrame(input: {
  px: number;
  pz: number;
  roads: WorldRoad[];
  route: WorldPoint[];
  pickup: WorldPoint | null;
  drop: WorldPoint | null;
  fuel: WorldPoint[];
  landmarks: MinimapLandmark[];
  radius?: number;
}): MinimapFrame {
  const radius = input.radius ?? 130;
  const reach = radius + 24;
  const roads: MinimapSegment[] = [];
  for (const road of input.roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      if (!near(a.x, a.z, input.px, input.pz, reach) && !near(b.x, b.z, input.px, input.pz, reach)) continue;
      roads.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, highway: road.highway });
    }
  }
  const route = input.route.filter((point, index) => {
    if (index === 0 || index === input.route.length - 1) return near(point.x, point.z, input.px, input.pz, reach);
    return near(point.x, point.z, input.px, input.pz, reach);
  });
  const landmarks = input.landmarks
    .map(mark => ({ ...mark, dist: Math.hypot(mark.x - input.px, mark.z - input.pz) }))
    .filter(mark => mark.dist <= radius)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4)
    .map(({ x, z, name }) => ({ x, z, name }));
  return {
    radius,
    roads,
    route,
    pickup: input.pickup,
    drop: input.drop,
    fuel: visibleFuel(input.fuel, input.px, input.pz, radius),
    landmarks,
  };
}
