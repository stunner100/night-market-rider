import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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
    // Keep road ribbons visible while we stream adjacent segments with mixed OSM
    // directionality. The vertex winding is also corrected below so normals face up.
    side: THREE.DoubleSide,
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
  // Previous winding produced -Y normals, so MeshStandardMaterial culled the
  // asphalt when viewed from the rider camera. Wind both triangles toward +Y.
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildRoadGroup(roads: WorldRoad[], mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-roads";
  const byClass = new Map<string, THREE.BufferGeometry[]>();

  for (const road of roads) {
    const width = road.width * (mobile ? 0.98 : 1);
    const geometries = byClass.get(road.highway) ?? [];
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const geo = segmentGeometry(a.x, a.z, b.x, b.z, width);
      if (geo) geometries.push(geo);
    }
    if (geometries.length) byClass.set(road.highway, geometries);
  }

  for (const [highway, geometries] of Array.from(byClass.entries())) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, roadMaterial(highway));
    // Lift the road slightly above the terrain to avoid z-fighting with the
    // streamed Accra ground plane.
    mesh.position.y = 0.055;
    mesh.receiveShadow = true;
    mesh.userData.roadClass = highway;
    group.add(mesh);
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
