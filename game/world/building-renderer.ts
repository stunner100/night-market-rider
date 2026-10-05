import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldBuilding } from "./types";

const PALETTE = [0xd9cfbd, 0xcbbfa9, 0xd7d2c5, 0xb9b5aa, 0xd4c3a2, 0xc5c0b8, 0xe0d6c5];
const WINDOW = 0x24333b;

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

function addFacadeDetails(group: THREE.Group, building: WorldBuilding, height: number, seed: number, mobile: boolean): void {
  if (mobile || building.footprint.length < 3) return;
  const pts = building.footprint;
  const windowMat = new THREE.MeshStandardMaterial({ color: WINDOW, roughness: 0.38, metalness: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xf0e8da, roughness: 0.8, metalness: 0 });

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
        const wx = a.x + dx * t + nx * 0.055;
        const wz = a.z + dz * t + nz * 0.055;
        const wy = Math.min(height - 0.8, 1.45 + level * 3.0);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1.15), windowMat);
        pane.position.set(wx, wy, wz);
        pane.rotation.y = yaw + Math.PI;
        pane.castShadow = false;
        group.add(pane);
      }
    }

    if (i === 0 && len > 6) {
      const t = 0.5;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 2.15), trimMat);
      door.position.set(a.x + ux * len * t + nx * 0.06, 1.08, a.z + uz * len * t + nz * 0.06);
      door.rotation.y = yaw + Math.PI;
      group.add(door);
    }
  }
}

export function buildBuildingGroup(buildings: WorldBuilding[], mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-buildings";
  const facadeBuckets = PALETTE.map(() => [] as THREE.BufferGeometry[]);
  const roofGeometries: THREE.BufferGeometry[] = [];

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
    facadeBuckets[Math.abs(seed) % PALETTE.length].push(geometry);
    addFacadeDetails(group, building, height, seed, mobile);

    if (!mobile && geometry.boundingBox) {
      const box = geometry.boundingBox;
      const sx = Math.max(0.5, box.max.x - box.min.x);
      const sz = Math.max(0.5, box.max.z - box.min.z);
      const cx = (box.min.x + box.max.x) * 0.5;
      const cz = (box.min.z + box.max.z) * 0.5;

      const roof = new THREE.BoxGeometry(sx * 0.96, 0.18, sz * 0.96);
      roof.translate(cx, height + 0.09, cz);
      roofGeometries.push(roof);

      if (height > 6 && ((seed >>> 2) & 1) === 0) {
        const tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.72, 1.3, 12),
          new THREE.MeshStandardMaterial({ color: 0x20262c, roughness: 0.72, metalness: 0.08 }),
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

  if (roofGeometries.length) {
    const mergedRoofs = mergeGeometries(roofGeometries, false);
    roofGeometries.forEach(g => g.dispose());
    if (mergedRoofs) {
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x766a60, roughness: 0.92 });
      const roofs = new THREE.Mesh(mergedRoofs, roofMat);
      roofs.castShadow = true;
      roofs.receiveShadow = true;
      group.add(roofs);
    }
  }

  return group;
}

export function disposeBuildingGroup(group: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) obj.material.forEach(m => materials.add(m));
    else materials.add(obj.material);
  });
  Array.from(materials).forEach(material => material.dispose());
}
