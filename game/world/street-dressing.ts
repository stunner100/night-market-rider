import * as THREE from "three";
import { accraSignTexture, ACCRA_SIGNS } from "../textures";
import type { WorldChunk, WorldRoad } from "./types";

const URBAN_ROADS = new Set([
  "primary", "secondary", "tertiary", "unclassified", "residential", "service",
]);
const LIT_ROADS = new Set(["primary", "secondary", "tertiary", "unclassified", "residential", "service"]);

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

interface Placement {
  x: number;
  z: number;
  yaw: number;
  scale?: number;
  seed: number;
}

function sampleRoad(
  road: WorldRoad,
  segmentIndex: number,
  spacing: number,
  offset: number,
  callback: (placement: Placement) => void,
): void {
  const a = road.points[segmentIndex];
  const b = road.points[segmentIndex + 1];
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < Math.max(8, spacing * 0.45)) return;

  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;
  const baseSeed = hashString(`${road.id}:${segmentIndex}`);
  const start = Math.min(spacing * 0.7, 6 + rand01(baseSeed) * spacing * 0.45);

  for (let d = start, n = 0; d < len - 3; d += spacing, n++) {
    const seed = baseSeed ^ Math.imul(n + 1, 0x9e3779b1);
    const side = rand01(seed ^ 0x51ed270b) > 0.5 ? 1 : -1;
    const jitter = (rand01(seed ^ 0x27d4eb2d) - 0.5) * 1.8;
    callback({
      x: a.x + ux * d + nx * (offset * side + jitter),
      z: a.z + uz * d + nz * (offset * side + jitter),
      yaw: Math.atan2(dx, dz),
      scale: 0.86 + rand01(seed ^ 0x165667b1) * 0.36,
      seed,
    });
  }
}

function createInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
  apply: (dummy: THREE.Object3D, p: Placement, index: number) => void,
): THREE.InstancedMesh | null {
  if (!placements.length) {
    geometry.dispose();
    material.dispose();
    return null;
  }
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    apply(dummy, p, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function addTrees(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const trunks = createInstanced(
    new THREE.CylinderGeometry(0.22, 0.32, 4.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4d32, roughness: 0.96 }),
    placements,
    (d, p) => {
      const s = p.scale ?? 1;
      d.position.set(p.x, 2.1 * s, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(s, s, s);
    },
  );
  if (trunks) {
    trunks.castShadow = !mobile;
    trunks.receiveShadow = true;
    trunks.name = "accra-tree-trunks";
    group.add(trunks);
  }

  const crowns = createInstanced(
    new THREE.IcosahedronGeometry(1.75, 1),
    new THREE.MeshStandardMaterial({ color: 0x2a4a30, roughness: 0.95 }),
    placements,
    (d, p) => {
      const s = p.scale ?? 1;
      d.position.set(p.x, 4.75 * s, p.z);
      d.rotation.set(0, rand01(p.seed) * Math.PI, 0);
      d.scale.set(1.15 * s, 0.9 * s, 1.05 * s);
    },
  );
  if (crowns) {
    crowns.castShadow = !mobile;
    crowns.receiveShadow = true;
    crowns.name = "accra-tree-crowns";
    group.add(crowns);
  }
}

function addPoles(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const poles = createInstanced(
    new THREE.CylinderGeometry(0.09, 0.12, 7.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x56534d, roughness: 0.88, metalness: 0.12 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 3.6, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (poles) {
    poles.castShadow = !mobile;
    poles.name = "accra-utility-poles";
    group.add(poles);
  }

  const arms = createInstanced(
    new THREE.BoxGeometry(1.55, 0.1, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x4b4a46, roughness: 0.82, metalness: 0.15 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 6.75, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (arms) {
    arms.castShadow = !mobile;
    arms.name = "accra-pole-arms";
    group.add(arms);
  }
}

function addStreetlights(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const posts = createInstanced(
    new THREE.CylinderGeometry(0.055, 0.085, 6.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.55, metalness: 0.55 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 3.25, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (posts) {
    posts.castShadow = !mobile;
    posts.name = "accra-streetlight-posts";
    group.add(posts);
  }

  const heads = createInstanced(
    new THREE.BoxGeometry(0.95, 0.16, 0.32),
    new THREE.MeshBasicMaterial({ color: 0xffd48a }),
    placements,
    (d, p) => {
      d.position.set(p.x, 6.25, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (heads) {
    heads.name = "accra-streetlight-heads";
    group.add(heads);
  }
}

function kioskColor(seed: number): number {
  const options = [0xf2e35c, 0x1d8f6e, 0x702963, 0xe36b2c, 0x2d64a8];
  return options[Math.floor(rand01(seed) * options.length) % options.length];
}

function addKiosks(group: THREE.Group, chunk: WorldChunk, mobile: boolean): void {
  const max = mobile ? 4 : 9;
  const candidates = chunk.pois
    .filter(p => p.tags?.shop || p.tags?.amenity)
    .slice(0, max);

  for (const poi of candidates) {
    const seed = hashString(poi.id);
    const kiosk = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.35, 2.1),
      new THREE.MeshStandardMaterial({ color: kioskColor(seed), roughness: 0.82, metalness: 0.04 }),
    );
    body.position.y = 1.175;
    body.castShadow = !mobile;
    body.receiveShadow = true;
    kiosk.add(body);

    const opening = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1d2327, roughness: 0.45, metalness: 0.08 }),
    );
    opening.position.set(0, 1.35, 1.06);
    kiosk.add(opening);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(3.15, 0.12, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xf4df52, roughness: 0.75 }),
    );
    awning.position.set(0, 2.34, 0.62);
    awning.rotation.x = -0.12;
    awning.castShadow = !mobile;
    kiosk.add(awning);

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.35, 0.78),
      new THREE.MeshBasicMaterial({ map: accraSignTexture(seed % ACCRA_SIGNS.length), side: THREE.DoubleSide }),
    );
    sign.position.set(0, 2.62, 1.08);
    kiosk.add(sign);

    kiosk.position.set(poi.x + (rand01(seed ^ 19) - 0.5) * 4, 0.02, poi.z + (rand01(seed ^ 47) - 0.5) * 4);
    kiosk.rotation.y = rand01(seed ^ 91) * Math.PI * 2;
    kiosk.name = `accra-kiosk-${poi.id}`;
    group.add(kiosk);
  }
}

export function buildStreetDressingGroup(chunk: WorldChunk, mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-street-dressing";

  const trees: Placement[] = [];
  const poles: Placement[] = [];
  const lights: Placement[] = [];

  const maxTrees = mobile ? 28 : 56;
  const maxPoles = mobile ? 18 : 42;
  const maxLights = mobile ? 22 : 64;

  for (const road of chunk.roads) {
    if (!URBAN_ROADS.has(road.highway)) continue;
    const edge = road.width * 0.5;
    for (let i = 0; i < road.points.length - 1; i++) {
      if (trees.length < maxTrees) {
        sampleRoad(road, i, mobile ? 72 : 48, edge + 8.8, p => {
          if (trees.length < maxTrees && rand01(p.seed ^ 0x93ab) > 0.22) trees.push(p);
        });
      }
      if (poles.length < maxPoles) {
        sampleRoad(road, i, mobile ? 105 : 82, edge + 2.7, p => {
          if (poles.length < maxPoles && rand01(p.seed ^ 0x8191) > 0.35) poles.push(p);
        });
      }
      if (LIT_ROADS.has(road.highway) && lights.length < maxLights) {
        sampleRoad(road, i, mobile ? 64 : 36, edge + 1.7, p => {
          if (lights.length < maxLights) lights.push(p);
        });
      }
    }
  }

  addTrees(group, trees, mobile);
  addPoles(group, poles, mobile);
  addStreetlights(group, lights, mobile);
  addKiosks(group, chunk, mobile);

  return group;
}

export function disposeStreetDressingGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    if (Array.isArray(obj.material)) obj.material.forEach(m => materials.add(m));
    else materials.add(obj.material);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}
