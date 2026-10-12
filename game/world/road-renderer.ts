import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { asphaltTexture, lateriteShoulderTexture, sidewalkTexture } from "../textures";
import type { WorldRoad } from "./types";

const ROAD_COLORS: Record<string, number> = {
  motorway: 0x2f3339,
  trunk: 0x31353b,
  primary: 0x34383e,
  secondary: 0x373b41,
  tertiary: 0x3b3f45,
  unclassified: 0x3f4348,
  residential: 0x42464a,
  service: 0x494a47,
  living_street: 0x50504b,
  track: 0x8c6b43,
  footway: 0x9d978c,
  path: 0x918879,
};

const PAVED = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "unclassified", "residential", "service", "living_street",
]);
const MARKED = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified"]);
const CURBED = new Set(["primary", "secondary", "tertiary", "unclassified", "residential", "service"]);

function roadMaterial(highway: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: PAVED.has(highway) ? 0xb6b4ae : ROAD_COLORS[highway] ?? 0x41454a,
    map: PAVED.has(highway) ? asphaltTexture() : null,
    roughness: highway === "track" ? 0.98 : 0.88,
    metalness: 0.015,
    side: THREE.DoubleSide,
  });
}

function segmentGeometry(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  width: number,
  y = 0,
  offset = 0,
): THREE.BufferGeometry | null {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return null;

  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;
  const ox = nx * offset;
  const oz = nz * offset;
  const hx = nx * width * 0.5;
  const hz = nz * width * 0.5;

  const positions = new Float32Array([
    ax + ox + hx, y, az + oz + hz,
    ax + ox - hx, y, az + oz - hz,
    bx + ox + hx, y, bz + oz + hz,
    bx + ox - hx, y, bz + oz - hz,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  geometry.setAttribute("uv",new THREE.Float32BufferAttribute([ax/18,az/18,ax/18+width/18,az/18,bx/18,bz/18,bx/18+width/18,bz/18],2));
  geometry.computeVertexNormals();
  return geometry;
}

function pushDashedCenterLine(
  out: THREE.BufferGeometry[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
): void {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len < 4) return;
  const ux = dx / len;
  const uz = dz / len;
  const dash = 3.2;
  const gap = 3.8;
  for (let d = 1.2; d < len - 0.6; d += dash + gap) {
    const end = Math.min(len - 0.4, d + dash);
    if (end <= d) continue;
    const g = segmentGeometry(
      ax + ux * d,
      az + uz * d,
      ax + ux * end,
      az + uz * end,
      0.11,
      0.105,
    );
    if (g) out.push(g);
  }
}

export function buildRoadGroup(roads: WorldRoad[], mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-roads";
  const byClass = new Map<string, THREE.BufferGeometry[]>();
  const shoulderGeometries: THREE.BufferGeometry[] = [];
  const centerLineGeometries: THREE.BufferGeometry[] = [];
  const curbGeometries: THREE.BufferGeometry[] = [];
  const sidewalkGeometries: THREE.BufferGeometry[] = [];
  const drainGeometries: THREE.BufferGeometry[] = [];

  for (const road of roads) {
    const width = Math.max(1.5, road.width * (mobile ? 0.98 : 1));
    const geometries = byClass.get(road.highway) ?? [];
    const paved = PAVED.has(road.highway);

    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];

      if (paved) {
        const shoulder = segmentGeometry(a.x, a.z, b.x, b.z, width + 1.15, 0.026);
        if (shoulder) shoulderGeometries.push(shoulder);
      }

      const geo = segmentGeometry(a.x, a.z, b.x, b.z, width, paved ? 0.064 : 0.052);
      if (geo) geometries.push(geo);

      if (MARKED.has(road.highway) && width >= 5.4) {
        pushDashedCenterLine(centerLineGeometries, a.x, a.z, b.x, b.z);
      }

      if (CURBED.has(road.highway) && width >= 4.2) {
        const edgeOffset = width * 0.5 + 0.16;
        const left = segmentGeometry(a.x, a.z, b.x, b.z, 0.24, 0.105, edgeOffset);
        const right = segmentGeometry(a.x, a.z, b.x, b.z, 0.24, 0.105, -edgeOffset);
        if (left) curbGeometries.push(left);
        if (right) curbGeometries.push(right);
        // Narrow concrete walking strip with an open storm drain at the road edge.
        for(const side of [-1,1]){
          const walk=segmentGeometry(a.x,a.z,b.x,b.z,1.1,.075,side*(width*.5+1.1));if(walk)sidewalkGeometries.push(walk);
          const drain=segmentGeometry(a.x,a.z,b.x,b.z,.32,.055,side*(width*.5+.4));if(drain)drainGeometries.push(drain);
        }
      }
    }
    if (geometries.length) byClass.set(road.highway, geometries);
  }

  if (shoulderGeometries.length) {
    const merged = mergeGeometries(shoulderGeometries, false);
    shoulderGeometries.forEach(g => g.dispose());
    if (merged) {
      const shoulders = new THREE.Mesh(
        merged,
        new THREE.MeshStandardMaterial({ color: 0xd5ab82, map: lateriteShoulderTexture(), roughness: 0.98, metalness: 0, side: THREE.DoubleSide }),
      );
      shoulders.receiveShadow = true;
      shoulders.name = "road-shoulders";
      group.add(shoulders);
    }
  }

  for (const [highway, geometries] of Array.from(byClass.entries())) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, roadMaterial(highway));
    mesh.receiveShadow = true;
    mesh.userData.roadClass = highway;
    group.add(mesh);
  }

  if (curbGeometries.length) {
    const merged = mergeGeometries(curbGeometries, false);
    curbGeometries.forEach(g => g.dispose());
    if (merged) {
      const curbs = new THREE.Mesh(
        merged,
        new THREE.MeshStandardMaterial({ color: 0xc8c0b2, roughness: 0.93, metalness: 0, side: THREE.DoubleSide }),
      );
      curbs.receiveShadow = true;
      curbs.name = "road-curbs";
      group.add(curbs);
    }
  }

  if (centerLineGeometries.length) {
    const merged = mergeGeometries(centerLineGeometries, false);
    centerLineGeometries.forEach(g => g.dispose());
    if (merged) {
      const lines = new THREE.Mesh(
        merged,
        new THREE.MeshBasicMaterial({ color: 0xf3e9bf, side: THREE.DoubleSide }),
      );
      lines.name = "road-center-lines";
      group.add(lines);
    }
  }

  for(const [geos,color,map] of [[sidewalkGeometries,0xc1b9a3,sidewalkTexture()],[drainGeometries,0x343d35,null]] as const){
    if(!geos.length)continue;
    const merged=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());
    if(merged){const mesh=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color,map,roughness:.95,side:THREE.DoubleSide}));mesh.receiveShadow=true;group.add(mesh);}
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
