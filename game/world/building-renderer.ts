import * as THREE from "three";
import type { WorldBuilding } from "./types";

const PALETTE = [0xd9cfbd, 0xcbbfa9, 0xd7d2c5, 0xb9b5aa, 0xd4c3a2, 0xc5c0b8, 0xe0d6c5];

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

export function buildBuildingGroup(buildings: WorldBuilding[], mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-buildings";
  const materials = PALETTE.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.84, metalness: 0.02 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7f6f60, roughness: 0.9 });

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
    const material = materials[Math.abs(seed) % materials.length];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !mobile;
    mesh.receiveShadow = true;
    mesh.userData.buildingId = building.id;
    mesh.userData.sharedMaterial = true;
    group.add(mesh);

    if (!mobile && height > 5.5 && building.footprint.length <= 12) {
      const box = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute("position") as THREE.BufferAttribute);
      const sx = Math.max(0.5, box.max.x - box.min.x);
      const sz = Math.max(0.5, box.max.z - box.min.z);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(sx * 0.94, 0.18, sz * 0.94), roofMat);
      roof.position.set((box.min.x + box.max.x) * 0.5, height + 0.09, (box.min.z + box.max.z) * 0.5);
      roof.castShadow = true;
      roof.userData.sharedMaterial = true;
      group.add(roof);
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
