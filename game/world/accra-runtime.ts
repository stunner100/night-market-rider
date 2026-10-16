import * as THREE from "three";
import { WINDOW_GRID, WINDOW_GEN } from "./building-renderer";
import { accraGroundTexture } from "../textures";
import { buildRoadGroup, disposeRoadGroup } from "./road-renderer";
import { buildBuildingGroup, disposeBuildingGroup } from "./building-renderer";
import { buildStreetDressingGroup, disposeStreetDressingGroup } from "./street-dressing";
import { buildPeopleGroup, disposePeopleGroup } from "./people";
import { buildLandmarkGroup, disposeLandmarkGroup } from "./landmarks";
import { chunkForPoint, chunkKey, distancePointToSegment, nearestPointOnSegment, pointInPolygon } from "./coordinates";
import type { RoadFrame } from "./roadside-placement";
import { RoadGraph, expandGraph, type CompactRoadGraph } from "./road-graph";
import { buildCoverFills, buildVegetationGroup, disposeVegetationGroup, parseCover, type CoverArea } from "./land-cover";
import type { DeliverySites } from "./delivery-sites";
import type { GeographicLocation, RoadGraphData, WorldChunk, WorldManifest, WorldPoi, WorldPoint, WorldRoad } from "./types";

interface LoadedChunk {
  data: WorldChunk;
  group: THREE.Group;
}

export class AccraWorldRuntime {
  readonly group = new THREE.Group();
  manifest: WorldManifest | null = null;
  locations: GeographicLocation[] = [];
  pois: WorldPoi[] = [];
  roadGraph: RoadGraph | null = null;
  available = false;
  ready = false;
  /** World-space extent of the baked map; riders are kept inside it. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  sites: DeliverySites = { vendors: [], drops: [] };
  private cover: CoverArea[] = [];
  private version = "";
  private file(name: string) { return `${this.baseUrl}/${name}?v=${this.version}`; }

  private loaded = new Map<string, LoadedChunk>();
  private loading = new Map<string, Promise<void>>();
  private roadIndex = new Map<string, WorldRoad[]>();
  private destroyed = false;
  private ground: THREE.Mesh;
  private landmarks: THREE.Group;
  private detailAt=0;
  private centerKey="";
  private wanted = new Set<string>();
  private streamAt = 0;

  constructor(private scene: THREE.Scene, private mobile = false, private baseUrl = "/world/accra") {
    this.group.name = "accra-osm-world";
    this.group.visible = false;

    // Warmer, dustier tropical base than the old flat green plane. Roads,
    // compounds and vegetation now read against an Accra-like earth/grass mix.
    const groundMap=accraGroundTexture().clone();groundMap.repeat.set(260,260);groundMap.needsUpdate=true;
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xe6d6c2, map:groundMap, roughness: 0.99, metalness: 0 });
    // Large-scale patches (greener lots, bare laterite, dusty verges) break up
    // texture tiling across the whole city without extra draw calls.
    groundMat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vGroundXZ;
float gHash(vec2 p){return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453);}
float gNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(gHash(i),gHash(i+vec2(1,0)),f.x),mix(gHash(i+vec2(0,1)),gHash(i+vec2(1,1)),f.x),f.y);}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
float gm = gNoise(vGroundXZ * 0.018) * 0.65 + gNoise(vGroundXZ * 0.07) * 0.35;
float gd = gNoise(vGroundXZ * 0.011 + 17.0);
// Dry-season savannah: straw grass and red laterite, gentle variation (no dark, swampy blotches).
vec3 grass = vec3(0.86, 0.88, 0.62);
vec3 laterite = vec3(1.08, 0.88, 0.72);
diffuseColor.rgb *= mix(laterite, grass, smoothstep(0.3, 0.7, gm));
diffuseColor.rgb *= mix(0.94, 1.04, gd);
// Fine gravel and dust speckle so the ground has texture up close.
float gs = gNoise(vGroundXZ * 1.9) * 0.6 + gNoise(vGroundXZ * 6.3) * 0.4;
diffuseColor.rgb *= mix(0.88, 1.06, gs);`);
    };
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.03;
    this.ground.receiveShadow = true;
    this.ground.name = "accra-ground";
    this.group.add(this.ground);

    this.landmarks = buildLandmarkGroup();
    this.group.add(this.landmarks);
    scene.add(this.group);
  }

  async initialize(): Promise<boolean> {
    try {
      // The manifest is always revalidated; every other file is keyed to its bake so a new map is never mixed with a cached old one.
      const manifestRes = await fetch(`${this.baseUrl}/manifest.json`, { cache: "no-cache" });
      if (!manifestRes.ok) throw new Error(`manifest ${manifestRes.status}`);
      const manifest = await manifestRes.json() as WorldManifest;
      this.version = encodeURIComponent(manifest.generatedAt);
      const [graphRes, locationsRes] = await Promise.all([
        fetch(this.file("graph.json"), { cache: "force-cache" }),
        fetch(this.file("locations.json"), { cache: "force-cache" }),
      ]);
      this.manifest = manifest;
      const size = manifest.chunkSize;
      this.bounds = manifest.bounds ?? {
        minX: Math.min(...manifest.chunks.map(c => c.cx)) * size, maxX: (Math.max(...manifest.chunks.map(c => c.cx)) + 1) * size,
        minZ: Math.min(...manifest.chunks.map(c => c.cz)) * size, maxZ: (Math.max(...manifest.chunks.map(c => c.cz)) + 1) * size,
      };
      // Ground only needs to reach a little past the map edge.
      const b = this.bounds;
      this.ground.scale.set((b.maxX - b.minX + 1200) / 5200, (b.maxZ - b.minZ + 1200) / 5200, 1);
      this.ground.position.set((b.minX + b.maxX) / 2, -0.03, (b.minZ + b.maxZ) / 2);
      if (graphRes.ok) this.roadGraph = new RoadGraph(expandGraph(await graphRes.json() as RoadGraphData | CompactRoadGraph));
      if (locationsRes.ok) this.locations = await locationsRes.json() as GeographicLocation[];
      // Optional v2 data: land cover and delivery sites.
      const [coverRes, sitesRes] = await Promise.all([
        fetch(this.file("landcover.json"), { cache: "force-cache" }).catch(() => null),
        fetch(this.file("sites.json"), { cache: "force-cache" }).catch(() => null),
      ]);
      if (coverRes?.ok) {
        this.cover = parseCover(await coverRes.json());
        this.group.add(buildCoverFills(this.cover));
      }
      if (sitesRes?.ok) this.sites = await sitesRes.json() as DeliverySites;
      try {
        const poisRes = await fetch(this.file("pois.json"), { cache: "force-cache" });
        if (poisRes.ok) this.absorbPois(await poisRes.json() as WorldPoi[]);
      } catch { /* fuel can still be discovered from loaded chunks */ }
      this.available = true;
      return true;
    } catch (error) {
      console.info("Accra OSM world unavailable; using procedural fallback.", error);
      this.available = false;
      return false;
    }
  }

  async prime(x: number, z: number): Promise<void> {
    if (!this.manifest || this.destroyed) return;
    await this.update(x, z, true);
    if (this.loaded.size > 0) {
      this.ready = true;
      this.group.visible = true;
    }
  }

  async update(x: number, z: number, wait = false): Promise<void> {
    const manifest = this.manifest;
    if (!manifest || this.destroyed) return;
    const center = chunkForPoint(x, z, manifest.chunkSize);
    const nextKey=chunkKey(center.cx,center.cz);
    this.updateDetail(x,z);
    const now = performance.now();
    if(!wait && nextKey===this.centerKey && now-this.streamAt<3000)return;
    this.streamAt=now;
    this.centerKey=nextKey;
    const radius = this.mobile ? 1 : 2;
    const wanted = new Set<string>();
    this.wanted=wanted;
    const jobs: Promise<void>[] = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const key = chunkKey(center.cx + dx, center.cz + dz);
        if (!manifest.chunks.some(c => c.key === key)) continue;
        wanted.add(key);
        if (!this.loaded.has(key)) jobs.push(this.loadChunk(key));
      }
    }

    for (const [key, chunk] of Array.from(this.loaded.entries())) {
      if (wanted.has(key)) continue;
      this.disposeChunk(chunk);
      this.loaded.delete(key);
      this.roadIndex.delete(key);
    }

    if (wait) await Promise.all(jobs);
    else void Promise.all(jobs);
  }

  private updateDetail(x:number,z:number){
    const now=performance.now();if(now-this.detailAt<250)return;this.detailAt=now;
    for(const chunk of Array.from(this.loaded.values())){
      const size=this.manifest?.chunkSize??256;
      const dx=Math.max(0,chunk.data.cx*size-x,x-(chunk.data.cx+1)*size);
      const dz=Math.max(0,chunk.data.cz*size-z,z-(chunk.data.cz+1)*size);
      const distance=Math.hypot(dx,dz);
      // Whole chunks this far out are almost fully fogged; the horizon rings cover the skyline.
      chunk.group.visible=distance<(this.mobile?300:420);
      const people=chunk.group.getObjectByName('osm-people');if(people)people.visible=distance<(this.mobile?65:115);
      const dressing=chunk.group.getObjectByName('osm-street-dressing');
      if(dressing)for(const child of dressing.children){
        if(child.name==='accra-commercial-frontage'){
          child.visible=Math.hypot(child.position.x-x,child.position.z-z)<(this.mobile?110:180);
        }
      }
    }
  }

  private lightSets=new WeakMap<THREE.Group,{grid:THREE.MeshStandardMaterial[];gen:THREE.MeshStandardMaterial[];heads:THREE.MeshStandardMaterial[];lanterns:THREE.MeshStandardMaterial[];streetPools:THREE.Material[];lanternPools:THREE.Material[]}>();

  private lightsFor(group:THREE.Group){
    let set=this.lightSets.get(group);
    if(set)return set;
    const found={grid:new Set<THREE.MeshStandardMaterial>(),gen:new Set<THREE.MeshStandardMaterial>(),heads:new Set<THREE.MeshStandardMaterial>(),lanterns:new Set<THREE.MeshStandardMaterial>()};
    const streetPools:THREE.Material[]=[],lanternPools:THREE.Material[]=[];
    group.traverse(o=>{
      if(o instanceof THREE.InstancedMesh&&o.name==='streetlight-pool')streetPools.push(o.material as THREE.Material);
      if(o instanceof THREE.InstancedMesh&&o.name==='lantern-pool')lanternPools.push(o.material as THREE.Material);
      if(!(o instanceof THREE.Mesh)||!(o.material instanceof THREE.MeshStandardMaterial))return;
      const m=o.material,hex=m.color.getHex();
      if(hex===WINDOW_GRID)found.grid.add(m);
      else if(hex===WINDOW_GEN)found.gen.add(m);
      else if(o.name==='accra-streetlight-heads')found.heads.add(m);
      else if(m.name==='lantern')found.lanterns.add(m);
    });
    set={grid:Array.from(found.grid),gen:Array.from(found.gen),heads:Array.from(found.heads),lanterns:Array.from(found.lanterns),streetPools,lanternPools};
    this.lightSets.set(group,set);
    return set;
  }

  /** Night glow for windows, streetlights and stall lanterns; areas in an outage go dark. */
  applyNightLights(night:number,powered:(x:number,z:number)=>boolean,time:number){
    const size=this.manifest?.chunkSize??256;
    const glow=Math.max(0,(night-0.25)/0.7);
    for(const chunk of Array.from(this.loaded.values())){
      const on=powered((chunk.data.cx+.5)*size,(chunk.data.cz+.5)*size);
      const set=this.lightsFor(chunk.group);
      for(const m of set.grid)m.emissiveIntensity=on?glow*0.85:0;
      // Generator windows stay lit (with a little flicker) when the grid is off.
      for(const m of set.gen)m.emissiveIntensity=glow*(on?0.7:0.75+Math.sin(time*23+chunk.data.cx)*0.08);
      for(const m of set.heads){m.emissiveIntensity=on?0.26+glow*1.6:0.03;}
      const flicker=Math.sin(time*9+chunk.data.cz)*0.2;
      for(const m of set.lanterns)m.emissiveIntensity=glow*(1.6+flicker);
      for(const m of set.streetPools)m.opacity=on?glow*0.8:0;
      for(const m of set.lanternPools)m.opacity=glow*(0.5+flicker*0.4);
    }
  }

  cameraObstacles(x:number,z:number):THREE.Object3D[]{
    const size=this.manifest?.chunkSize??256;
    return Array.from(this.loaded.values()).filter(c=>Math.abs((c.data.cx+.5)*size-x)<size/2+20&&Math.abs((c.data.cz+.5)*size-z)<size/2+20).map(c=>c.group.getObjectByName('osm-buildings')!).filter(Boolean);
  }

  private loadChunk(key: string): Promise<void> {
    const existing = this.loading.get(key);
    if (existing) return existing;
    const job = (async () => {
      try {
        const response = await fetch(this.file(`chunks/${key}.json`), { cache: "force-cache" });
        if (!response.ok || this.destroyed) return;
        const data = await response.json() as WorldChunk;
        if (this.loaded.has(key) || this.destroyed || !this.wanted.has(key)) return;
        const group = new THREE.Group();
        group.name = `osm-chunk-${key}`;
        group.add(buildRoadGroup(data.roads, this.mobile));
        group.add(buildBuildingGroup(data.buildings, this.mobile));
        group.add(buildStreetDressingGroup(data, this.mobile));
        group.add(buildPeopleGroup(data, this.mobile));
        group.add(buildVegetationGroup(data, this.cover, this.manifest?.chunkSize ?? 256, this.mobile));
        trimShadowCasters(group);
        this.group.add(group);
        this.loaded.set(key, { data, group });
        this.roadIndex.set(key, data.roads);
        this.absorbPois(data.pois);
        this.ready = true;
        this.group.visible = true;
      } catch (error) {
        console.warn(`Failed to load Accra chunk ${key}`, error);
      } finally {
        this.loading.delete(key);
      }
    })();
    this.loading.set(key, job);
    return job;
  }

  isOnRoad(x: number, z: number, margin = 0.8): boolean {
    const manifest = this.manifest;
    if (!manifest) return false;
    const at = chunkForPoint(x, z, manifest.chunkSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const road of this.roadIndex.get(chunkKey(at.cx + dx, at.cz + dz)) ?? []) {
          const radius = road.width * 0.5 + margin;
          for (let i = 0; i < road.points.length - 1; i++) {
            const a = road.points[i], b = road.points[i + 1];
            if (distancePointToSegment(x, z, a.x, a.z, b.x, b.z) <= radius) return true;
          }
        }
      }
    }
    return false;
  }

  collidesBuilding(x: number, z: number, radius = 0.8): string | null {
    const manifest = this.manifest;
    if (!manifest) return null;
    const at = chunkForPoint(x, z, manifest.chunkSize);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const chunk = this.loaded.get(chunkKey(at.cx + dx, at.cz + dz));
        if (!chunk) continue;
        for (const building of chunk.data.buildings) {
          const points = building.footprint;
          if (points.length < 3) continue;
          if (pointInPolygon(x, z, points)) return building.tags?.name || "building";
          for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            if (distancePointToSegment(x, z, a.x, a.z, b.x, b.z) <= radius) return building.tags?.name || "building";
          }
        }
      }
    }
    return null;
  }

  nearestRoadFrame(x: number, z: number, maxDistance = 40): RoadFrame | null {
    const manifest = this.manifest;
    if (!manifest) return null;
    const at = chunkForPoint(x, z, manifest.chunkSize);
    let best: RoadFrame | null = null;
    let bestDistance = maxDistance;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const road of this.roadIndex.get(chunkKey(at.cx + dx, at.cz + dz)) ?? []) {
          for (let i = 0; i < road.points.length - 1; i++) {
            const a = road.points[i];
            const b = road.points[i + 1];
            const hit = nearestPointOnSegment(x, z, a, b);
            if (hit.distance >= bestDistance) continue;
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            if (len < 0.5) continue;
            const tx = (b.x - a.x) / len;
            const tz = (b.z - a.z) / len;
            bestDistance = hit.distance;
            best = {
              x: hit.point.x,
              z: hit.point.z,
              tangentX: tx,
              tangentZ: tz,
              normalX: -tz,
              normalZ: tx,
              width: Math.max(2.6, road.width || 3.2),
              highway: road.highway,
              roadId: road.id,
              t: hit.t,
              segmentLength: len,
              segmentIndex: i,
            };
          }
        }
      }
    }
    return best;
  }

  nearestRoadPoint(x: number, z: number, maxDistance = 50): WorldPoint | null {
    const manifest = this.manifest;
    if (!manifest) return null;
    const at = chunkForPoint(x, z, manifest.chunkSize);
    let best: WorldPoint | null = null;
    let bestDistance = maxDistance;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const road of this.roadIndex.get(chunkKey(at.cx + dx, at.cz + dz)) ?? []) {
          for (let i = 0; i < road.points.length - 1; i++) {
            const hit = nearestPointOnSegment(x, z, road.points[i], road.points[i + 1]);
            if (hit.distance < bestDistance) { bestDistance = hit.distance; best = hit.point; }
          }
        }
      }
    }
    return best;
  }

  visibleRoads(x: number, z: number, radiusChunks = 1): WorldRoad[] {
    const manifest = this.manifest;
    if (!manifest) return [];
    const at = chunkForPoint(x, z, manifest.chunkSize);
    const roads: WorldRoad[] = [];
    const seen = new Set<string>();
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
        for (const road of this.roadIndex.get(chunkKey(at.cx + dx, at.cz + dz)) ?? []) {
          if (seen.has(road.id)) continue;
          seen.add(road.id);
          roads.push(road);
        }
      }
    }
    return roads;
  }

  route(from: WorldPoint, to: WorldPoint): WorldPoint[] {
    return this.roadGraph?.route(from, to) ?? [from, to];
  }

  getLocation(id: string): GeographicLocation | null {
    return this.locations.find(location => location.id === id) ?? null;
  }

  private absorbPois(pois: WorldPoi[]): void {
    for (const poi of pois) {
      if (this.pois.some(existing => existing.id === poi.id)) continue;
      this.pois.push(poi);
    }
  }

  private disposeChunk(chunk: LoadedChunk): void {
    const roads = chunk.group.getObjectByName("osm-roads");
    const buildings = chunk.group.getObjectByName("osm-buildings");
    const dressing = chunk.group.getObjectByName("osm-street-dressing");
    const people = chunk.group.getObjectByName("osm-people");
    const vegetation = chunk.group.getObjectByName("osm-vegetation");
    if (vegetation instanceof THREE.Group) disposeVegetationGroup(vegetation);
    if (roads instanceof THREE.Group) disposeRoadGroup(roads);
    if (buildings instanceof THREE.Group) disposeBuildingGroup(buildings);
    if (dressing instanceof THREE.Group) disposeStreetDressingGroup(dressing);
    if (people instanceof THREE.Group) disposePeopleGroup(people);
    this.group.remove(chunk.group);
  }

  dispose(): void {
    this.destroyed = true;
    for (const chunk of Array.from(this.loaded.values())) this.disposeChunk(chunk);
    this.loaded.clear();
    this.roadIndex.clear();
    disposeLandmarkGroup(this.landmarks);
    (this.ground.material as THREE.MeshStandardMaterial).map?.dispose();
    this.ground.geometry.dispose();
    const material = this.ground.material;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else material.dispose();
    this.scene.remove(this.group);
  }
}

/**
 * Small props (bottles, chairs, signs, limbs) barely show in a 2048 shadow map
 * but each one is drawn again in the shadow pass. Keep shadows on bulky meshes.
 */
function trimShadowCasters(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.castShadow) return;
    const geometry = object.geometry;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const scale = Math.max(object.scale.x, object.scale.y, object.scale.z);
    // Instanced batches (crowds, trees) stay; they are one draw call each.
    if (!(object instanceof THREE.InstancedMesh) && (geometry.boundingSphere?.radius ?? 0) * scale < 0.6) object.castShadow = false;
  });
}
