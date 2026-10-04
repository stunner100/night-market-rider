import * as THREE from "three";
import type { WorldRoad } from "./types";

const ROAD_COLORS: Record<string, number> = {
  motorway: 0x34373d,
  trunk: 0x373a40,
  primary: 0x3a3d43,
  secondary: 0x3d4046,
  tertiary: 0x42454b,
  residential: 0x45484e,
  service: 0x4a4a47,
  living_street: 0x50504c,
  track: 0x8c6b43,
  footway: 0x9b958b,
  path: 0x8f877a,
};

function roadMaterial(highway: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: ROAD_COLORS[highway] ?? 0x44474d,
    roughness: highway === "track" ? 0.98 : 0.9,
    metalness: 0.02,
  });
}

function segmentGeometry(ax: number, az: number, bx: number, bz: number, width: number): THREE.BufferGeometry | null {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;
  const nx = -dz / len * width * 0.5;
  const nz = dx / len * width * 0.5;
  const positions = new Float32Array([
    ax + nx, 0, az + nz,
    ax - nx, 0, az - nz,
    bx + nx, 0, bz + nz,
    bx - nx, 0, bz - nz,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildRoadGroup(roads: WorldRoad[], mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-roads";
  const mats = new Map<string, THREE.MeshStandardMaterial>();

  for (const road of roads) {
    let mat = mats.get(road.highway);
    if (!mat) {
      mat = roadMaterial(road.highway);
      mats.set(road.highway, mat);
    }
    const width = road.width * (mobile ? 0.98 : 1);
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const geo = segmentGeometry(a.x, a.z, b.x, b.z, width);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.035;
      mesh.receiveShadow = true;
      mesh.userData.roadId = road.id;
      mesh.userData.sharedMaterial = true;
      group.add(mesh);
    }
  }
  return group;
}

export function disposeRoadGroup(group: THREE.Group): void {
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.geometry.dispose();
    if (Array.isArray(obj.material)) obj.material.forEach(m => materials.add(m));
    else materials.add(obj.material);
  });
  Array.from(materials).forEach(material => material.dispose());
}
