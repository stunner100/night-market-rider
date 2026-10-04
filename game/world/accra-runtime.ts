import * as THREE from "three";
import { buildRoadGroup, disposeRoadGroup } from "./road-renderer";
import { buildBuildingGroup, disposeBuildingGroup } from "./building-renderer";
import { chunkForPoint, chunkKey, distancePointToSegment, nearestPointOnSegment } from "./coordinates";
import { RoadGraph } from "./road-graph";
import type { GeographicLocation, RoadGraphData, WorldChunk, WorldManifest, WorldPoint, WorldRoad } from "./types";

interface LoadedChunk {
  data: WorldChunk;
  group: THREE.Group;
}

function pointInPolygon(x: number, z: number, points: WorldPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const crosses = ((a.z > z) !== (b.z > z)) &&
      (x < (b.x - a.x) * (z - a.z) / ((b.z - a.z) || 1e-9) + a.x);
    if (crosses) inside = !inside;
  }
  return inside;
}

export class AccraWorldRuntime {
  readonly group = new THREE.Group();
  manifest: WorldManifest | null = null;
  locations: GeographicLocation[] = [];
  roadGraph: RoadGraph | null = null;
  available = false;
  ready = false;

  private loaded = new Map<string, LoadedChunk>();
  private loading = new Map<string, Promise<void>>();
  private roadIndex = new Map<string, WorldRoad[]>();
  private destroyed = false;
  private ground: THREE.Mesh;

  constructor(private scene: THREE.Scene, private mobile = false, private baseUrl = "/world/accra") {
    this.group.name = "accra-osm-world";
    this.group.visible = false;

    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6d8050, roughness: 0.98, metalness: 0 });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.02;
    this.ground.receiveShadow = true;
    this.ground.name = "accra-ground";
    this.group.add(this.ground);

    scene.add(this.group);
  }

  async initialize(): Promise<boolean> {
    try {
      const manifestRes = await fetch(`${this.baseUrl}/manifest.json`, { cache: "force-cache" });
      if (!manifestRes.ok) throw new Error(`manifest ${manifestRes.status}`);
      const [manifest, graphRes, locationsRes] = await Promise.all([
        manifestRes.json() as Promise<WorldManifest>,
        fetch(`${this.baseUrl}/graph.json`, { cache: "force-cache" }),
        fetch(`${this.baseUrl}/locations.json`, { cache: "force-cache" }),
      ]);
      this.manifest = manifest;
      if (graphRes.ok) this.roadGraph = new RoadGraph(await graphRes.json() as RoadGraphData);
      if (locationsRes.ok) this.locations = await locationsRes.json() as GeographicLocation[];
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
    const radius = this.mobile ? 1 : 2;
    const wanted = new Set<string>();
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

  private loadChunk(key: string): Promise<void> {
    const existing = this.loading.get(key);
    if (existing) return existing;
    const job = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/chunks/${key}.json`, { cache: "force-cache" });
        if (!response.ok || this.destroyed) return;
        const data = await response.json() as WorldChunk;
        if (this.loaded.has(key) || this.destroyed) return;
        const group = new THREE.Group();
        group.name = `osm-chunk-${key}`;
        group.add(buildRoadGroup(data.roads, this.mobile));
        group.add(buildBuildingGroup(data.buildings, this.mobile));
        this.group.add(group);
        this.loaded.set(key, { data, group });
        this.roadIndex.set(key, data.roads);
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
            if (distancePointToSegment(x, z, a.x, a.z, b.x, b.z) <= radius) {
              return building.tags?.name || "building";
            }
          }
        }
      }
    }
    return null;
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

  route(from: WorldPoint, to: WorldPoint): WorldPoint[] {
    return this.roadGraph?.route(from, to) ?? [from, to];
  }

  getLocation(id: string): GeographicLocation | null {
    return this.locations.find(location => location.id === id) ?? null;
  }

  private disposeChunk(chunk: LoadedChunk): void {
    const roads = chunk.group.getObjectByName("osm-roads");
    const buildings = chunk.group.getObjectByName("osm-buildings");
    if (roads instanceof THREE.Group) disposeRoadGroup(roads);
    if (buildings instanceof THREE.Group) disposeBuildingGroup(buildings);
    this.group.remove(chunk.group);
  }

  dispose(): void {
    this.destroyed = true;
    for (const chunk of Array.from(this.loaded.values())) this.disposeChunk(chunk);
    this.loaded.clear();
    this.roadIndex.clear();
    this.ground.geometry.dispose();
    const material = this.ground.material;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else material.dispose();
    this.scene.remove(this.group);
  }
}
