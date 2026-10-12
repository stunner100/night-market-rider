import * as THREE from "three";
import type { WorldChunk, WorldRoad } from "./types";

interface PersonPlacement {
  x: number;
  z: number;
  yaw: number;
  seed: number;
  scale: number;
}

const WALKABLE = new Set(["primary", "secondary", "tertiary", "unclassified", "residential", "service"]);
const SKIN = [0x5b3828, 0x6f4530, 0x82533a, 0x9b6849, 0xb67e5c, 0xc88f6b];
const SHIRTS = [0xf2e35c, 0xd94d3f, 0x2664a3, 0x1e8b65, 0x7b3f91, 0xf28c35, 0xe8e7df, 0x252a2f];
const TROUSERS = [0x24262a, 0x303944, 0x49372c, 0x1f2730, 0x5a5149];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function random(seed: number): number {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 100000) / 100000;
}

function choose<T>(arr: readonly T[], seed: number): T {
  return arr[Math.floor(random(seed) * arr.length) % arr.length];
}

function addFromRoad(road: WorldRoad, out: PersonPlacement[], limit: number, mobile: boolean): void {
  for (let i = 0; i < road.points.length - 1 && out.length < limit; i++) {
    const a = road.points[i];
    const b = road.points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 14) continue;
    const seed = hash(`${road.id}:${i}:person`);
    if (random(seed ^ 0x7341) < (mobile ? 0.6 : 0.32)) continue;
    const t = 0.18 + random(seed ^ 0xa311) * 0.64;
    const nx = -dz / len;
    const nz = dx / len;
    const side = random(seed ^ 0xf221) > 0.5 ? 1 : -1;
    const offset = road.width * 0.5 + 1.6 + random(seed ^ 0x88a3) * 2.8;
    out.push({
      x: a.x + dx * t + nx * offset * side,
      z: a.z + dz * t + nz * offset * side,
      yaw: Math.atan2(dx, dz) + (side > 0 ? 0 : Math.PI),
      seed,
      scale: 0.9 + random(seed ^ 0x1d13) * 0.22,
    });
    // Small roadside groups chatting, waiting for a trotro or buying from a stall.
    const px = a.x + dx * t + nx * offset * side;
    const pz = a.z + dz * t + nz * offset * side;
    const group = random(seed ^ 0x3c19) < 0.45 ? 1 + Math.floor(random(seed ^ 0x52d7) * 2) : 0;
    for (let k = 0; k < group && out.length < limit; k++) {
      const ks = seed ^ (0x9e3779 * (k + 1));
      const angle = random(ks) * Math.PI * 2;
      const qx = px + Math.cos(angle) * 0.85;
      const qz = pz + Math.sin(angle) * 0.85;
      out.push({ x: qx, z: qz, yaw: Math.atan2(px - qx, pz - qz), seed: ks, scale: 0.88 + random(ks ^ 0x77) * 0.24 });
    }
  }
}

function makeInstances(
  geometry: THREE.BufferGeometry,
  placements: PersonPlacement[],
  colors: readonly number[],
  transform: (dummy: THREE.Object3D, p: PersonPlacement) => void,
  mobile: boolean,
): THREE.InstancedMesh | null {
  if (!placements.length) {
    geometry.dispose();
    return null;
  }
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.01,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    transform(dummy, p);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, new THREE.Color(choose(colors, p.seed ^ (i * 0x9e37))));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = !mobile;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildPeopleGroup(chunk: WorldChunk, mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-people";
  const placements: PersonPlacement[] = [];
  const limit = mobile ? 18 : 48;

  // Put people around actual mapped amenities first so the world feels inhabited
  // at banks, shops, restaurants, university facilities and other POIs.
  for (const poi of chunk.pois) {
    if (placements.length >= limit) break;
    const seed = hash(`${poi.id}:poi-person`);
    if (!poi.tags?.amenity && !poi.tags?.shop) continue;
    placements.push({
      x: poi.x + (random(seed) - 0.5) * 5.5,
      z: poi.z + (random(seed ^ 0xa33f) - 0.5) * 5.5,
      yaw: random(seed ^ 0xd901) * Math.PI * 2,
      seed,
      scale: 0.9 + random(seed ^ 0x51ef) * 0.22,
    });
    if (!mobile && placements.length < limit && random(seed ^ 0x7291) > 0.45) {
      placements.push({
        x: poi.x + (random(seed ^ 0x4421) - 0.5) * 7,
        z: poi.z + (random(seed ^ 0x9421) - 0.5) * 7,
        yaw: random(seed ^ 0x1193) * Math.PI * 2,
        seed: seed ^ 0x123456,
        scale: 0.88 + random(seed ^ 0x8844) * 0.25,
      });
    }
  }

  for (const road of chunk.roads) {
    if (placements.length >= limit) break;
    if (!WALKABLE.has(road.highway)) continue;
    addFromRoad(road, placements, limit, mobile);
  }

  // Instanced anatomically proportioned silhouettes, with separate limbs.
  const parts: Array<{geo:THREE.BufferGeometry; colors:readonly number[]; x:number;y:number;z:number; sx?:number;sy?:number;sz?:number}> = [
    {geo:new THREE.CapsuleGeometry(.19,.32,3,8),colors:SHIRTS,x:0,y:1.18,z:0,sx:1.2,sz:.65},
    {geo:new THREE.SphereGeometry(.14,8,6),colors:SKIN,x:0,y:1.65,z:0,sy:1.22,sz:.92},
    {geo:new THREE.SphereGeometry(.145,8,6),colors:[0x211b16,0x171511,0x31221b],x:0,y:1.73,z:-.025,sy:.6},
  ];
  for(const side of [-1,1]) {
    parts.push({geo:new THREE.CapsuleGeometry(.082,.63,3,6),colors:TROUSERS,x:side*.105,y:.49,z:0});
    parts.push({geo:new THREE.CapsuleGeometry(.057,.43,3,6),colors:SKIN,x:side*.29,y:1.08,z:.01});
    parts.push({geo:new THREE.CapsuleGeometry(.075,.15,3,6),colors:SHIRTS,x:side*.26,y:1.29,z:0});
    parts.push({geo:new THREE.SphereGeometry(.09,6,4),colors:[0x242521],x:side*.105,y:.08,z:.05,sy:.65,sz:1.5});
  }
  for(const part of parts){
    const mesh=makeInstances(part.geo,placements,part.colors,(d,p)=>{
      const x=part.x*p.scale,z=part.z*p.scale;
      d.position.set(p.x+Math.cos(p.yaw)*x+Math.sin(p.yaw)*z,part.y*p.scale,p.z-Math.sin(p.yaw)*x+Math.cos(p.yaw)*z);
      d.rotation.set(0,p.yaw,0);d.scale.set(p.scale*(part.sx??1),p.scale*(part.sy??1),p.scale*(part.sz??1));
    },mobile);
    if(mesh)group.add(mesh);
  }

  return group;
}

export function disposePeopleGroup(group: THREE.Group): void {
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
