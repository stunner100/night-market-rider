const MAJOR = new Set(["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary"]);
const BIG_VEHICLE = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "trunk_link", "primary_link", "secondary_link"]);
const TROTRO = new Set(["residential", "unclassified", "tertiary", "secondary", "primary", "trunk"]);
const GOAT = new Set(["residential", "unclassified", "service", "living_street", "track"]);

export function isMajorRoad(highway: string): boolean {
  return MAJOR.has(highway);
}

export function allowsVehicle(kind: "car" | "taxi" | "trotro" | "bus", highway: string): boolean {
  switch (kind) {
    case "bus":
      return BIG_VEHICLE.has(highway);
    case "trotro":
      return TROTRO.has(highway);
    case "car":
    case "taxi":
      return highway !== "track";
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export function goatRoadOk(highway: string): boolean {
  return GOAT.has(highway);
}

export function vehicleSpawnOk(args: {
  x: number;
  z: number;
  playerX: number;
  playerZ: number;
  inBuilding: boolean;
  minPlayer?: number;
}): boolean {
  if (args.inBuilding) return false;
  const min = args.minPlayer ?? 16;
  return Math.hypot(args.x - args.playerX, args.z - args.playerZ) >= min;
}

export function pedestrianSpawnOk(args: {
  x: number;
  z: number;
  playerX: number;
  playerZ: number;
  inBuilding: boolean;
  highway: string;
  distFromCenter: number;
  roadWidth: number;
  minPlayer?: number;
}): boolean {
  if (args.inBuilding) return false;
  const min = args.minPlayer ?? 10;
  if (Math.hypot(args.x - args.playerX, args.z - args.playerZ) < min) return false;
  if (isMajorRoad(args.highway) && args.distFromCenter < args.roadWidth * 0.35) return false;
  return true;
}
