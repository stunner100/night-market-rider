import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { distancePointToSegment, pointInPolygon } from "./coordinates";
import type { WorldChunk, WorldPoint } from "./types";

/**
 * Real land cover from OpenStreetMap (forest, scrub, grass, pitches, water) plus
 * savannah planting on unmapped open land, so empty lots read as Accra bush and
 * compounds instead of a featureless swamp.
 */
export type CoverKind = "forest" | "scrub" | "grass" | "wetland" | "water" | "pitch";

export interface CoverArea {
  kind: CoverKind;
  points: WorldPoint[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function parseCover(raw: { kind: CoverKind; points: [number, number][] }[]): CoverArea[] {
  return raw.map(({ kind, points }) => {
    const pts = points.map(([x, z]) => ({ x, z }));
    return {
      kind,
      points: pts,
      minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
      minZ: Math.min(...pts.map(p => p.z)), maxZ: Math.max(...pts.map(p => p.z)),
    };
  });
}

const FILL: Record<CoverKind, { color: number; y: number; roughness: number; metalness?: number }> = {
  forest: { color: 0x5d6b3a, y: -0.012, roughness: 1 },
  scrub: { color: 0x8a8a52, y: -0.014, roughness: 1 },
  grass: { color: 0x87a05a, y: -0.016, roughness: 1 },
  wetland: { color: 0x6f8452, y: -0.018, roughness: 0.9 },
  pitch: { color: 0x5f9a48, y: -0.01, roughness: 1 },
  water: { color: 0x3d6f86, y: -0.006, roughness: 0.15, metalness: 0.1 },
};

/** One merged, flat mesh per cover type for the whole map. */
export function buildCoverFills(areas: CoverArea[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-land-cover";
  const byKind = new Map<CoverKind, THREE.BufferGeometry[]>();
  for (const area of areas) {
    const shape = new THREE.Shape(area.points.map(p => new THREE.Vector2(p.x, -p.z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, FILL[area.kind].y, 0);
    geo.deleteAttribute("uv");
    const list = byKind.get(area.kind) ?? [];
    list.push(geo);
    byKind.set(area.kind, list);
  }
  for (const [kind, geos] of Array.from(byKind.entries())) {
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    const f = FILL[kind];
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: f.color, roughness: f.roughness, metalness: f.metalness ?? 0 }));
    mesh.receiveShadow = true;
    mesh.name = `cover-${kind}`;
    group.add(mesh);
  }
  return group;
}

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

interface Plant { x: number; z: number; s: number; kind: "tree" | "palm" | "bush" }

/** Trees and bushes for one chunk: dense in forest/scrub, sparse savannah elsewhere, never on roads or buildings. */
export function buildVegetationGroup(chunk: WorldChunk, cover: CoverArea[], chunkSize: number, mobile: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-vegetation";
  const x0 = chunk.cx * chunkSize, z0 = chunk.cz * chunkSize;
  const local = cover.filter(a => a.maxX >= x0 && a.minX <= x0 + chunkSize && a.maxZ >= z0 && a.minZ <= z0 + chunkSize && a.kind !== "water" && a.kind !== "pitch");
  const water = cover.filter(a => a.kind === "water" && a.maxX >= x0 && a.minX <= x0 + chunkSize && a.maxZ >= z0 && a.minZ <= z0 + chunkSize);
  const r = rand(chunk.cx * 73856093 ^ chunk.cz * 19349663);
  const plants: Plant[] = [];
  const samples = mobile ? 260 : 620;
  const cap = mobile ? 110 : 260;
  const clearOfRoads = (x: number, z: number) => !chunk.roads.some(road =>
    distancePointToSegment(x, z, road.points[0].x, road.points[0].z, road.points[1].x, road.points[1].z) < road.width / 2 + 3.5);
  const clearOfBuildings = (x: number, z: number) => !chunk.buildings.some(b => pointInPolygon(x, z, b.footprint));
  for (let i = 0; i < samples && plants.length < cap; i++) {
    const x = x0 + r() * chunkSize, z = z0 + r() * chunkSize;
    const area = local.find(a => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ && pointInPolygon(x, z, a.points));
    // Keep density by cover type; unmapped land gets light savannah planting.
    const keep = area?.kind === "forest" ? 1 : area?.kind === "scrub" ? 0.75 : area?.kind === "wetland" ? 0.35 : area ? 0.12 : 0.16;
    if (r() > keep) continue;
    if (water.some(a => pointInPolygon(x, z, a.points))) continue;
    if (!clearOfRoads(x, z) || !clearOfBuildings(x, z)) continue;
    const roll = r();
    const kind: Plant["kind"] = area?.kind === "forest" ? (roll < 0.85 ? "tree" : "bush")
      : area?.kind === "scrub" || area?.kind === "wetland" ? (roll < 0.25 ? "tree" : "bush")
      : roll < 0.12 ? "palm" : roll < 0.5 ? "tree" : "bush";
    plants.push({ x, z, s: 0.75 + r() * 0.6, kind });
  }
  if (!plants.length) return group;

  const dummy = new THREE.Object3D();
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Plant[], place: (p: Plant) => void, shadow: boolean) => {
    if (!list.length) { geo.dispose(); mat.dispose(); return; }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { place(p); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow && !mobile;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const trees = plants.filter(p => p.kind === "tree");
  const palms = plants.filter(p => p.kind === "palm");
  const bushes = plants.filter(p => p.kind === "bush");
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.95 });
  instanced(new THREE.CylinderGeometry(0.2, 0.3, 3.4, 5), bark, trees, p => { dummy.position.set(p.x, 1.7 * p.s, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(p.s); }, true);
  instanced(new THREE.IcosahedronGeometry(2, 0), new THREE.MeshStandardMaterial({ color: 0x46612f, roughness: 0.95, flatShading: true }), trees,
    p => { dummy.position.set(p.x, 4.1 * p.s, p.z); dummy.rotation.set(0, p.x % 3, 0); dummy.scale.set(1.25 * p.s, 0.85 * p.s, 1.15 * p.s); }, true);
  instanced(new THREE.CylinderGeometry(0.14, 0.2, 6.5, 5), bark.clone(), palms, p => { dummy.position.set(p.x, 3.25 * p.s, p.z); dummy.rotation.set(0.05, 0, 0.04); dummy.scale.setScalar(p.s); }, true);
  instanced(new THREE.ConeGeometry(2.3, 1.1, 7), new THREE.MeshStandardMaterial({ color: 0x3f7a32, roughness: 0.9, flatShading: true }), palms,
    p => { dummy.position.set(p.x, 6.4 * p.s, p.z); dummy.rotation.set(Math.PI, p.z % 3, 0); dummy.scale.setScalar(p.s); }, true);
  instanced(new THREE.IcosahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: 0x6b7a3a, roughness: 0.95, flatShading: true }), bushes,
    p => { dummy.position.set(p.x, 0.45 * p.s, p.z); dummy.rotation.set(0, p.x % 3, 0); dummy.scale.set(1.4 * p.s, 0.75 * p.s, 1.2 * p.s); }, false);
  return group;
}

export function disposeVegetationGroup(group: THREE.Group): void {
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}
