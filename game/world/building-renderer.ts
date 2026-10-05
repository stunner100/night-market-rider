import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { textTexture } from "../textures";
import type { WorldBuilding } from "./types";

// More saturated, sun-faded Ghanaian facade colours instead of a single beige city.
const PALETTE = [
  0xe1d2b4, // sand
  0xd9c79f, // warm cream
  0xc8b38e, // ochre plaster
  0xe7dfcd, // chalk
  0xb9c7b1, // faded sage
  0xb5c8d0, // faded blue
  0xd9b6a8, // faded coral
  0xcac1b4, // weathered concrete
  0xefd8a5, // pale yellow
  0xb7aaa0, // cement brown
];
const WINDOW = 0x24333b;
const SHOP_PALETTE = [0xf2d34b, 0xd8583d, 0x2871b5, 0x23885e, 0x70468f];

function hashInt(n: number): number {
  let x = n | 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  return (x >>> 16) ^ x;
}

function footprintShape(building: WorldBuilding): THREE.Shape | null {
  const pts = building.footprint;
  if (pts.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, -pts[0].z);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, -pts[i].z);
  shape.closePath();
  return shape;
}

function centroid(building: WorldBuilding) {
  const pts = building.footprint;
  let x = 0, z = 0;
  for (const p of pts) { x += p.x; z += p.z; }
  return { x: x / Math.max(1, pts.length), z: z / Math.max(1, pts.length) };
}

function paletteIndex(building: WorldBuilding, seed: number): number {
  const tags = building.tags ?? {};
  const name = (tags.name ?? "").toLowerCase();
  const type = (tags.building ?? "").toLowerCase();
  if (name.includes("university") || name.includes("faculty") || name.includes("department")) return 3;
  if (name.includes("post office") || name.includes("bank")) return 5;
  if (type === "commercial" || tags.shop) return 8;
  if (type === "dormitory" || type === "apartments") return 0;
  return Math.abs(seed) % PALETTE.length;
}

function addBuildingLabel(group: THREE.Group, building: WorldBuilding, height: number, seed: number): void {
  const name = building.tags?.name;
  if (!name || name.length < 4) return;
  // Keep labels selective so the city reads as named places rather than a wall of text.
  const important = /University|Faculty|Department|Hall|Library|Post Office|Bookshop|Centre|Bank|UPSA/i.test(name);
  if (!important && (seed & 7) !== 0) return;
  const c = centroid(building);
  const tex = textTexture(name.toUpperCase(), {
    bg: "rgba(12,14,16,.84)",
    fg: "#ffffff",
    border: "#f2e35c",
    w: 768,
    h: 112,
    font: 34,
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  const width = Math.min(18, Math.max(7, name.length * 0.34));
  sprite.scale.set(width, 2.0, 1);
  sprite.position.set(c.x, height + 2.4, c.z);
  sprite.userData.osmBuildingLabel = true;
  group.add(sprite);
}

function addFacadeDetails(group: THREE.Group, building: WorldBuilding, height: number, seed: number, mobile: boolean): void {
  if (mobile || building.footprint.length < 3) return;
  const pts = building.footprint;
  const windowMat = new THREE.MeshStandardMaterial({ color: WINDOW, roughness: 0.38, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf0e8da, roughness: 0.8, metalness: 0 });
  const shopMat = new THREE.MeshStandardMaterial({ color: SHOP_PALETTE[Math.abs(seed) % SHOP_PALETTE.length], roughness: 0.7 });
  const isCommercial = !!building.tags?.shop || building.tags?.building === "commercial";

  const maxEdges = Math.min(6, pts.length - 1);
  for (let i = 0; i < maxEdges; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 5) continue;

    const levels = Math.max(1, Math.min(5, Math.round(height / 3.2)));
    const windows = Math.max(1, Math.min(5, Math.floor(len / 5.5)));
    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;
    const yaw = Math.atan2(dx, dz);

    for (let level = 0; level < levels; level++) {
      for (let w = 0; w < windows; w++) {
        if (((seed + i * 17 + level * 11 + w * 7) & 3) === 0) continue;
        const t = (w + 1) / (windows + 1);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.15), windowMat);
        pane.position.set(
          a.x + dx * t + nx * 0.055,
          Math.min(height - 0.8, 1.45 + level * 3.0),
          a.z + dz * t + nz * 0.055,
        );
        pane.rotation.y = yaw + Math.PI;
        group.add(pane);
      }
    }

    if (i === 0 && len > 6) {
      const t = 0.5;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.15), trimMat);
      door.position.set(a.x + ux * len * t + nx * 0.06, 1.08, a.z + uz * len * t + nz * 0.06);
      door.rotation.y = yaw + Math.PI;
      group.add(door);

      if (isCommercial) {
        const awning = new THREE.Mesh(new THREE.BoxGeometry(Math.min(6, len * 0.55), 0.12, 1.25), shopMat);
        awning.position.set(a.x + ux * len * 0.5 + nx * 0.65, 2.65, a.z + uz * len * 0.5 + nz * 0.65);
        awning.rotation.y = yaw;
        awning.rotation.x = -0.08;
        awning.castShadow = true;
        group.add(awning);
      }
    }
  }
}

export function buildBuildingGroup(buildings: WorldBuilding[], mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-buildings";
  const facadeBuckets = PALETTE.map(() => [] as THREE.BufferGeometry[]);
  const roofBuckets = [[], [], []] as THREE.BufferGeometry[][];
  let labels = 0;

  for (const building of buildings) {
    const shape = footprintShape(building);
    if (!shape) continue;
    const height = Math.max(2.8, Math.min(building.height || 3.6, mobile ? 36 : 60));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    const seed = hashInt(building.osmId ?? building.id.length * 2654435761);
    facadeBuckets[paletteIndex(building, seed)].push(geometry);
    addFacadeDetails(group, building, height, seed, mobile);
    if (!mobile && labels < 7 && building.tags?.name) {
      addBuildingLabel(group, building, height, seed);
      labels++;
    }

    if (!mobile && geometry.boundingBox) {
      const box = geometry.boundingBox;
      const sx = Math.max(0.5, box.max.x - box.min.x);
      const sz = Math.max(0.5, box.max.z - box.min.z);
      const cx = (box.min.x + box.max.x) * 0.5;
      const cz = (box.min.z + box.max.z) * 0.5;

      const roof = new THREE.BoxGeometry(sx * 0.96, 0.18, sz * 0.96);
      roof.translate(cx, height + 0.09, cz);
      roofBuckets[Math.abs(seed >>> 3) % roofBuckets.length].push(roof);

      if (height > 6 && ((seed >>> 2) & 1) === 0) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.72, 1.3, 10),
          new THREE.MeshStandardMaterial({ color: ((seed >>> 6) & 1) ? 0x20262c : 0x31566f, roughness: 0.72, metalness: 0.08 }),
        );
        tank.position.set(cx + sx * 0.18, height + 0.84, cz - sz * 0.12);
        tank.castShadow = true;
        group.add(tank);
      }

      if (height > 9 && ((seed >>> 4) & 3) === 1) {
        const room = new THREE.Mesh(
          new THREE.BoxGeometry(Math.min(4.5, sx * 0.28), 2.1, Math.min(4.5, sz * 0.28)),
          new THREE.MeshStandardMaterial({ color: 0xc6b9a6, roughness: 0.88 }),
        );
        room.position.set(cx - sx * 0.18, height + 1.05, cz + sz * 0.14);
        room.castShadow = true;
        room.receiveShadow = true;
        group.add(room);
      }
    }
  }

  facadeBuckets.forEach((geometries, index) => {
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!merged) return;
    const material = new THREE.MeshStandardMaterial({ color: PALETTE[index], roughness: 0.84, metalness: 0.02 });
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = !mobile;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  const roofColors = [0x835146, 0x756a60, 0x5c6870];
  roofBuckets.forEach((geometries, index) => {
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!merged) return;
    const roofs = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: roofColors[index], roughness: 0.92 }));
    roofs.castShadow = true;
    roofs.receiveShadow = true;
    group.add(roofs);
  });

  return group;
}

export function disposeBuildingGroup(group: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  group.traverse(obj => {
    if (obj instanceof THREE.Sprite) {
      const m = obj.material as THREE.SpriteMaterial;
      m.map?.dispose();
      materials.add(m);
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    if (Array.isArray(obj.material)) obj.material.forEach(m => materials.add(m));
    else materials.add(obj.material);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(material => material.dispose());
}
