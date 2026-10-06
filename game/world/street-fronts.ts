import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ACCRA_SIGNS, accraSignTexture } from "../textures";
import { distancePointToSegment, pointInPolygon } from "./coordinates";
import type { WorldBuilding, WorldChunk, WorldPoint, WorldRoad } from "./types";

const MAIN_ROADS = new Set(["primary", "secondary", "tertiary", "unclassified", "residential"]);
const SERVICE_ROADS = new Set(["service"]);
const WALLS = [0xf4e4b3, 0xe7d7b1, 0xd85a45, 0xf2e35c, 0x2f6f4e, 0x3d6ea8, 0xf7f4ee, 0xc4552a, 0x6d3b86, 0xefe7d6];
const ROOFS = [0x7d3b32, 0x5c534a, 0x3e4a55, 0x6e4a2e];
const VEHICLE_COLORS = [0xf2c230, 0xf4f1e6, 0x1f8a4c, 0xc0392b, 0x1d4e89, 0xe8a317];
const FRONT_LINE = 3.5;

export type FrontKind = "shop" | "stall" | "kiosk" | "board";
export type ParkedKind = "okada" | "trotro";

export interface FrontPlacement {
  x: number;
  z: number;
  yaw: number;
  kind: FrontKind;
  sign: number;
  color: number;
  roof: number;
  width: number;
  depth: number;
  height: number;
  footprint: WorldPoint[];
}

export interface ParkedPlacement {
  x: number;
  z: number;
  yaw: number;
  kind: ParkedKind;
  color: number;
  footprint: WorldPoint[];
}

export interface StreetFrontPlan {
  fronts: FrontPlacement[];
  parked: ParkedPlacement[];
}

interface RoadCursor {
  road: WorldRoad;
  len: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  margin: number;
}

interface Spot {
  x: number;
  z: number;
  r: number;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01(seed: number): number {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 100000) / 100000;
}

function forward(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

function toWorld(x: number, z: number, yaw: number, lx: number, lz: number): WorldPoint {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

function rectFootprint(x: number, z: number, yaw: number, width: number, depth: number): WorldPoint[] {
  const hx = width * 0.5;
  const hz = depth * 0.5;
  return [
    toWorld(x, z, yaw, -hx, -hz),
    toWorld(x, z, yaw, hx, -hz),
    toWorld(x, z, yaw, hx, hz),
    toWorld(x, z, yaw, -hx, hz),
  ];
}

function faceRoad(nx: number, nz: number, side: 1 | -1): number {
  return Math.atan2(-nx * side, -nz * side);
}

function crowded(spots: Spot[], x: number, z: number, radius: number): boolean {
  for (const spot of spots) {
    const dx = spot.x - x;
    const dz = spot.z - z;
    const reach = spot.r + radius;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  return false;
}

function hitsBuilding(footprint: WorldPoint[], buildings: WorldBuilding[]): boolean {
  const cx = footprint.reduce((sum, p) => sum + p.x, 0) / footprint.length;
  const cz = footprint.reduce((sum, p) => sum + p.z, 0) / footprint.length;
  for (const building of buildings) {
    const poly = building.footprint;
    if (poly.length < 3) continue;
    if (pointInPolygon(cx, cz, poly)) return true;
    for (const point of footprint) {
      if (pointInPolygon(point.x, point.z, poly)) return true;
    }
    for (const point of poly) {
      if (pointInPolygon(point.x, point.z, footprint)) return true;
    }
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (distancePointToSegment(cx, cz, a.x, a.z, b.x, b.z) < 1.05) return true;
    }
  }
  return false;
}

function clearsCarriageway(
  footprint: WorldPoint[],
  cursor: RoadCursor,
  padding: number,
): boolean {
  const limit = cursor.road.width * 0.5 + padding;
  for (const point of footprint) {
    if (distancePointToSegment(point.x, point.z, cursor.ax, cursor.az, cursor.bx, cursor.bz) < limit) return false;
  }
  return true;
}

function cursorsFor(roads: WorldRoad[], allowed: Set<string>): RoadCursor[] {
  const cursors: RoadCursor[] = [];
  for (const road of roads) {
    if (!allowed.has(road.highway)) continue;
    const a = road.points[0];
    const b = road.points[1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 7) continue;
    cursors.push({
      road,
      len,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      ux: dx / len,
      uz: dz / len,
      nx: -dz / len,
      nz: dx / len,
      margin: Math.min(3.4, len * 0.18),
    });
  }
  cursors.sort((a, b) => b.len - a.len);
  return cursors;
}

function pickKind(wide: boolean, seed: number, along: number): FrontKind {
  const pattern: FrontKind[] = wide
    ? ["shop", "shop", "stall", "shop", "kiosk", "shop", "board", "stall"]
    : ["stall", "kiosk", "stall", "shop", "board", "kiosk", "stall"];
  const index = (Math.floor(along) + (seed % pattern.length)) % pattern.length;
  return pattern[index];
}

function sizeFor(kind: FrontKind, seed: number): { width: number; depth: number; height: number } {
  const roll = rand01(seed);
  switch (kind) {
    case "shop":
      return {
        width: 4.15 + roll * 0.7,
        depth: 3.05,
        height: roll > 0.62 ? 5.5 + rand01(seed ^ 0x51) * 2.2 : 3.2 + rand01(seed ^ 0x17) * 0.55,
      };
    case "stall":
      return { width: 2.75, depth: 2.05, height: 2.35 };
    case "kiosk":
      return { width: 2.45, depth: 2.15, height: 2.65 };
    case "board":
      return { width: 2.2, depth: 0.22, height: 3.05 };
    default: {
      const unknown: never = kind;
      return unknown;
    }
  }
}

export function planStreetFronts(chunk: WorldChunk, mobile = false): StreetFrontPlan {
  const maxFronts = mobile ? 52 : 140;
  const mainCap = Math.round(maxFronts * 0.72);
  const maxOkada = mobile ? 8 : 20;
  const maxTrotro = mobile ? 2 : 6;
  const fronts: FrontPlacement[] = [];
  const parked: ParkedPlacement[] = [];
  const occupied: Spot[] = [];
  const main = cursorsFor(chunk.roads, MAIN_ROADS);
  const service = cursorsFor(chunk.roads, SERVICE_ROADS);

  const placeVehicle = (cursor: RoadCursor, distance: number, side: 1 | -1, kind: ParkedKind) => {
    const wide = kind === "trotro";
    const edge = wide ? 1.75 : 1.15;
    const width = wide ? 2.15 : 0.72;
    const depth = wide ? 5.05 : 1.75;
    const seed = hashString(`${cursor.road.id}:${kind}:${distance.toFixed(1)}:${side}`);
    const yaw = Math.atan2(cursor.ux, cursor.uz);
    const dist = cursor.road.width * 0.5 + edge;
    const x = cursor.ax + cursor.ux * distance + cursor.nx * dist * side;
    const z = cursor.az + cursor.uz * distance + cursor.nz * dist * side;
    if (crowded(occupied, x, z, wide ? 3.2 : 1.5)) return;
    const footprint = rectFootprint(x, z, yaw, width, depth);
    if (!clearsCarriageway(footprint, cursor, 0.35)) return;
    if (hitsBuilding(footprint, chunk.buildings)) return;
    parked.push({
      x,
      z,
      yaw,
      kind,
      color: VEHICLE_COLORS[seed % VEHICLE_COLORS.length],
      footprint,
    });
    occupied.push({ x, z, r: wide ? 3.1 : 1.45 });
  };

  const vehicleRoads = main.concat(service);
  for (const cursor of vehicleRoads) {
    if (parked.filter(item => item.kind === "okada").length >= maxOkada) break;
    placeVehicle(cursor, cursor.len * 0.34, rand01(hashString(cursor.road.id)) > 0.5 ? 1 : -1, "okada");
    if (cursor.len > 34 && parked.filter(item => item.kind === "okada").length < maxOkada) {
      placeVehicle(cursor, cursor.len * 0.72, 1, "okada");
    }
  }
  for (const cursor of main) {
    if (parked.filter(item => item.kind === "trotro").length >= maxTrotro) break;
    if (cursor.road.width < 6 || cursor.len < 22) continue;
    placeVehicle(cursor, cursor.len * 0.56, -1, "trotro");
  }

  const tryFront = (cursor: RoadCursor, distance: number, side: 1 | -1): number => {
    if (fronts.length >= maxFronts) return 0;
    const seed = hashString(`${cursor.road.id}:${Math.round(distance * 10)}:${side}`);
    const wide = cursor.road.width >= 6;
    const kind = pickKind(wide, seed, distance + side);
    const size = sizeFor(kind, seed ^ 0x9e37);
    const yaw = faceRoad(cursor.nx, cursor.nz, side);
    const edge = FRONT_LINE + size.depth * 0.5;
    const dist = cursor.road.width * 0.5 + edge;
    const x = cursor.ax + cursor.ux * distance + cursor.nx * dist * side;
    const z = cursor.az + cursor.uz * distance + cursor.nz * dist * side;
    if (crowded(occupied, x, z, size.width * 0.48)) return 0;
    const footprint = rectFootprint(x, z, yaw, size.width * 0.96, size.depth);
    if (!clearsCarriageway(footprint, cursor, 0.7)) return 0;
    if (hitsBuilding(footprint, chunk.buildings)) return 0;
    fronts.push({
      x,
      z,
      yaw,
      kind,
      sign: seed % ACCRA_SIGNS.length,
      color: WALLS[seed % WALLS.length],
      roof: ROOFS[(seed >>> 4) % ROOFS.length],
      width: size.width,
      depth: size.depth,
      height: size.height,
      footprint,
    });
    occupied.push({ x, z, r: Math.max(size.width, size.depth) * 0.48 });
    return size.width;
  };

  const fill = (list: RoadCursor[], cap: number) => {
    for (const cursor of list) {
      if (fronts.length >= cap) return;
      const mid = cursor.len * 0.5;
      tryFront(cursor, mid, 1);
      tryFront(cursor, mid, -1);
    }
    for (const cursor of list) {
      for (let distance = cursor.margin; distance <= cursor.len - cursor.margin && fronts.length < cap;) {
        const left = tryFront(cursor, distance, 1);
        const right = tryFront(cursor, distance, -1);
        distance += Math.max(3.2, Math.max(left, right) + 0.28);
      }
    }
  };

  fill(main, Math.min(maxFronts, mainCap));
  fill(service, maxFronts);
  return { fronts, parked };
}

function stallFrameGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-1.2, -0.82], [1.2, -0.82], [-1.2, 0.82], [1.2, 0.82]] as const) {
    const post = new THREE.CylinderGeometry(0.055, 0.07, 2.2, 5);
    post.translate(x, 1.1, z);
    parts.push(post);
  }
  const table = new THREE.BoxGeometry(2.35, 0.1, 1.45);
  table.translate(0, 0.92, 0.05);
  parts.push(table);
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  return merged ?? new THREE.BoxGeometry(2.4, 2.2, 2);
}

function shifted(x: number, z: number, yaw: number, distance: number): { x: number; z: number } {
  const f = forward(yaw);
  return { x: x + f.x * distance, z: z + f.z * distance };
}

function addInstances(
  group: THREE.Group,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  place: (dummy: THREE.Object3D, index: number) => void,
  colorAt?: (index: number) => number,
): void {
  if (count <= 0) {
    geometry.dispose();
    material.dispose();
    return;
  }
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(dummy, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (colorAt) mesh.setColorAt(i, new THREE.Color(colorAt(i)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.name = name;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

function addSidewalks(group: THREE.Group, chunk: WorldChunk): void {
  const parts: THREE.BufferGeometry[] = [];
  const roads = chunk.roads.filter(road => MAIN_ROADS.has(road.highway) || SERVICE_ROADS.has(road.highway));
  for (const road of roads) {
    const a = road.points[0];
    const b = road.points[1];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 6) continue;
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    for (const side of [1, -1] as const) {
      const inner = road.width * 0.5 + 0.75;
      const outer = road.width * 0.5 + 3.4;
      const cx = (a.x + b.x) * 0.5 + nx * (inner + outer) * 0.5 * side;
      const cz = (a.z + b.z) * 0.5 + nz * (inner + outer) * 0.5 * side;
      if (chunk.buildings.some(building => building.footprint.length >= 3 && pointInPolygon(cx, cz, building.footprint))) continue;
      const positions = new Float32Array([
        a.x + nx * side * inner, 0.045, a.z + nz * side * inner,
        a.x + nx * side * outer, 0.045, a.z + nz * side * outer,
        b.x + nx * side * inner, 0.045, b.z + nz * side * inner,
        b.x + nx * side * outer, 0.045, b.z + nz * side * outer,
      ]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setIndex([0, 2, 1, 2, 3, 1]);
      geometry.computeVertexNormals();
      parts.push(geometry);
    }
  }
  if (!parts.length) return;
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  if (!merged) return;
  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({ color: 0x8b8578, roughness: 0.96, metalness: 0, side: THREE.DoubleSide }),
  );
  mesh.receiveShadow = true;
  mesh.name = "accra-sidewalks";
  group.add(mesh);
}

function addFrontMeshes(group: THREE.Group, fronts: FrontPlacement[]): void {
  const shops = fronts.filter(front => front.kind === "shop" || front.kind === "kiosk");
  const stalls = fronts.filter(front => front.kind === "stall");
  const boards = fronts.filter(front => front.kind === "board");
  const signed = fronts.filter(front => front.kind !== "board");

  addInstances(
    group,
    "accra-shop-bodies",
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.02 }),
    shops.length,
    (dummy, i) => {
      const front = shops[i];
      dummy.position.set(front.x, front.height * 0.5, front.z);
      dummy.rotation.y = front.yaw;
      dummy.scale.set(front.width, front.height, front.depth);
    },
    i => shops[i].color,
  );

  addInstances(
    group,
    "accra-shop-roofs",
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    shops.length,
    (dummy, i) => {
      const front = shops[i];
      dummy.position.set(front.x, front.height + 0.08, front.z);
      dummy.rotation.y = front.yaw;
      dummy.scale.set(front.width * 1.05, 0.16, front.depth * 1.05);
    },
    i => shops[i].roof,
  );

  addInstances(
    group,
    "accra-awnings",
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    shops.length,
    (dummy, i) => {
      const front = shops[i];
      const at = shifted(front.x, front.z, front.yaw, front.depth * 0.5 + 0.28);
      dummy.position.set(at.x, Math.min(2.7, front.height * 0.62), at.z);
      dummy.rotation.y = front.yaw;
      dummy.scale.set(front.width * 1.02, 0.1, 0.7);
    },
    i => WALLS[(shops[i].sign + 3) % WALLS.length],
  );

  const windowCount = shops.reduce((sum, front) => sum + (front.height > 5 ? 2 : 1), 0);
  const windowIndex: { front: FrontPlacement; upper: boolean }[] = [];
  for (const front of shops) {
    windowIndex.push({ front, upper: false });
    if (front.height > 5) windowIndex.push({ front, upper: true });
  }
  addInstances(
    group,
    "accra-shop-windows",
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffc56b }),
    windowCount,
    (dummy, i) => {
      const item = windowIndex[i];
      const at = shifted(item.front.x, item.front.z, item.front.yaw, item.front.depth * 0.5 + 0.04);
      const y = item.upper ? item.front.height * 0.72 : Math.min(1.7, item.front.height * 0.4);
      dummy.position.set(at.x, y, at.z);
      dummy.rotation.y = item.front.yaw;
      dummy.scale.set(item.front.width * 0.42, item.upper ? 0.7 : 0.85, 1);
    },
  );

  addInstances(
    group,
    "accra-stall-frames",
    stallFrameGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.9 }),
    stalls.length,
    (dummy, i) => {
      const front = stalls[i];
      dummy.position.set(front.x, 0, front.z);
      dummy.rotation.y = front.yaw;
    },
  );

  addInstances(
    group,
    "accra-stall-roofs",
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    stalls.length,
    (dummy, i) => {
      const front = stalls[i];
      dummy.position.set(front.x, 2.28, front.z);
      dummy.rotation.y = front.yaw;
      dummy.scale.set(3.05, 0.1, 2.35);
    },
    i => stalls[i].color,
  );

  addInstances(
    group,
    "accra-sign-poles",
    new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.6, metalness: 0.4 }),
    boards.length,
    (dummy, i) => {
      const front = boards[i];
      dummy.position.set(front.x, 1.3, front.z);
      dummy.rotation.y = front.yaw;
    },
  );

  for (let sign = 0; sign < ACCRA_SIGNS.length; sign++) {
    const users = fronts.filter(front => front.sign === sign);
    addInstances(
      group,
      `accra-sign-${sign}`,
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: accraSignTexture(sign), side: THREE.DoubleSide }),
      users.length,
      (dummy, i) => {
        const front = users[i];
        const reach = front.kind === "stall" ? 1.2 : front.kind === "board" ? 0.12 : front.depth * 0.5 + 0.06;
        const at = shifted(front.x, front.z, front.yaw, reach);
        const y = front.kind === "stall" ? 2.15 : front.kind === "board" ? 2.45 : Math.min(3.2, front.height * 0.78);
        const width = front.kind === "board" ? 2.15 : front.kind === "stall" ? 2.2 : front.width * 0.84;
        dummy.position.set(at.x, y, at.z);
        dummy.rotation.y = front.yaw;
        dummy.scale.set(width, front.kind === "stall" ? 0.62 : 0.78, 1);
      },
    );
  }

  const bulbs = signed;
  addInstances(
    group,
    "accra-shop-bulbs",
    new THREE.SphereGeometry(1, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffe1a8 }),
    bulbs.length,
    (dummy, i) => {
      const front = bulbs[i];
      const reach = front.kind === "stall" ? 1.05 : front.depth * 0.5 + 0.16;
      const at = shifted(front.x, front.z, front.yaw, reach);
      dummy.position.set(at.x, front.kind === "stall" ? 1.9 : Math.min(2.45, front.height * 0.55), at.z);
      dummy.scale.set(0.14, 0.14, 0.14);
    },
  );
}

function okadaGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(0.42, 0.48, 1.35);
  body.translate(0, 0.62, 0);
  parts.push(body);
  const seat = new THREE.BoxGeometry(0.38, 0.16, 0.48);
  seat.translate(0, 0.9, -0.28);
  parts.push(seat);
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  return merged ?? new THREE.BoxGeometry(0.4, 0.5, 1.4);
}

function okadaWheels(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.55, 0.55]) {
    const wheel = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 8);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(0, 0.28, z);
    parts.push(wheel);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach(part => part.dispose());
  return merged ?? new THREE.BoxGeometry(0.2, 0.2, 0.2);
}

function addParkedMeshes(group: THREE.Group, parked: ParkedPlacement[]): void {
  const okadas = parked.filter(item => item.kind === "okada");
  const trotros = parked.filter(item => item.kind === "trotro");
  addInstances(
    group,
    "accra-okada-bodies",
    okadaGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.2 }),
    okadas.length,
    (dummy, i) => {
      dummy.position.set(okadas[i].x, 0, okadas[i].z);
      dummy.rotation.y = okadas[i].yaw;
    },
    i => okadas[i].color,
  );
  addInstances(
    group,
    "accra-okada-wheels",
    okadaWheels(),
    new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.7 }),
    okadas.length,
    (dummy, i) => {
      dummy.position.set(okadas[i].x, 0, okadas[i].z);
      dummy.rotation.y = okadas[i].yaw;
    },
  );
  addInstances(
    group,
    "accra-trotro-bodies",
    new THREE.BoxGeometry(2.05, 0.72, 4.7),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.48, metalness: 0.18 }),
    trotros.length,
    (dummy, i) => {
      dummy.position.set(trotros[i].x, 0.5, trotros[i].z);
      dummy.rotation.y = trotros[i].yaw;
    },
    i => trotros[i].color,
  );
  addInstances(
    group,
    "accra-trotro-cabins",
    new THREE.BoxGeometry(1.92, 0.62, 3.05),
    new THREE.MeshBasicMaterial({ color: 0x1b2832 }),
    trotros.length,
    (dummy, i) => {
      dummy.position.set(trotros[i].x, 1.2, trotros[i].z);
      dummy.rotation.y = trotros[i].yaw;
    },
  );
  addInstances(
    group,
    "accra-trotro-roofs",
    new THREE.BoxGeometry(2.16, 0.1, 4.85),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 }),
    trotros.length,
    (dummy, i) => {
      dummy.position.set(trotros[i].x, 1.58, trotros[i].z);
      dummy.rotation.y = trotros[i].yaw;
    },
  );
}

export function buildStreetFrontGroup(chunk: WorldChunk, mobile = false): { group: THREE.Group; footprints: WorldPoint[][] } {
  const plan = planStreetFronts(chunk, mobile);
  const group = new THREE.Group();
  group.name = "osm-street-fronts";
  addSidewalks(group, chunk);
  addFrontMeshes(group, plan.fronts);
  addParkedMeshes(group, plan.parked);
  return {
    group,
    footprints: [
      ...plan.fronts.map(front => front.footprint),
      ...plan.parked.map(item => item.footprint),
    ],
  };
}

export function disposeStreetFrontGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    if (Array.isArray(obj.material)) obj.material.forEach(material => materials.add(material));
    else materials.add(obj.material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
