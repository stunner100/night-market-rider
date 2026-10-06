import * as THREE from "three";
import { createGoatMesh } from "../models";
import type { AccraWorldRuntime } from "./accra-runtime";
import type { CoinBody, Spot, WalkerBody } from "./gameplay-actors";
import { planHazards, type HazardSpot, type KeepClear, type RoadSample } from "./hazard-placement";
import { offsetSide, type RoadFrame } from "./roadside-placement";
import { goatRoadOk } from "./spawn-validity";
import type { WorldRoad } from "./types";

interface LiveHazard {
  spot: HazardSpot;
  mesh: THREE.Object3D;
}

interface Goat extends WalkerBody {
  active: boolean;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  wait: number;
  speed: number;
}

function samples(roads: WorldRoad[]): RoadSample[] {
  const out: RoadSample[] = [];
  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      out.push({
        roadId: road.id,
        highway: road.highway,
        width: road.width,
        ax: a.x,
        az: a.z,
        bx: b.x,
        bz: b.z,
        length,
        index: i,
      });
    }
  }
  return out;
}

export class HazardField {
  private live = new Map<string, LiveHazard>();
  private coins = new Map<string, CoinBody>();
  private taken = new Set<string>();
  private pools: Record<"pothole" | "ramp" | "coin", THREE.Mesh[]> = { pothole: [], ramp: [], coin: [] };
  private refresh = 0;
  private goats: Goat[] = [];
  private readonly goatTarget: number;
  private readonly potholeGeo = new THREE.CircleGeometry(1.2, 12);
  private readonly rampGeo = new THREE.BoxGeometry(3.4, 0.32, 0.85);
  private readonly coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.14, 16);
  private readonly potholeMat = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 1 });
  private readonly rampMat = new THREE.MeshStandardMaterial({ color: 0xf2e35c, roughness: 0.45, emissive: 0x665500, emissiveIntensity: 0.15 });
  private readonly coinMat = new THREE.MeshStandardMaterial({ color: 0xf2e35c, roughness: 0.25, metalness: 0.8, emissive: 0x997700, emissiveIntensity: 0.3 });

  constructor(
    private runtime: AccraWorldRuntime,
    private parent: THREE.Group,
    mobile: boolean,
  ) {
    this.goatTarget = mobile ? 1 : 2;
    this.potholeGeo.rotateX(-Math.PI / 2);
  }

  start(): void {
    if (this.goats.length > 0) return;
    for (let i = 0; i < this.goatTarget; i++) {
      const mesh = createGoatMesh();
      mesh.visible = false;
      this.parent.add(mesh);
      this.goats.push({
        mesh, goat: true, active: false, tumble: 0, vx: 0, vz: 0,
        fromX: 0, fromZ: 0, toX: 0, toZ: 0, wait: 1 + i, speed: 1.25,
      });
    }
  }

  spots(): { potholes: Spot[]; ramps: Spot[] } {
    const potholes: Spot[] = [];
    const ramps: Spot[] = [];
    for (const item of Array.from(this.live.values())) {
      const spot = { x: item.spot.x, z: item.spot.z, r: item.spot.radius };
      if (item.spot.kind === "pothole") potholes.push(spot);
      else if (item.spot.kind === "ramp") ramps.push(spot);
    }
    return { potholes, ramps };
  }

  coinBodies(): CoinBody[] {
    return Array.from(this.coins.values());
  }

  goatBodies(): WalkerBody[] {
    return this.goats.filter(goat => goat.active);
  }

  resetCoins(): void {
    this.taken.clear();
    for (const coin of Array.from(this.coins.values())) {
      coin.taken = false;
      coin.mesh.visible = true;
    }
  }

  update(dt: number, elapsed: number, playerX: number, playerZ: number, zones: KeepClear[]): void {
    for (const [id, coin] of Array.from(this.coins.entries())) if (coin.taken) this.taken.add(id);
    this.refresh -= dt;
    if (this.refresh <= 0) {
      this.refresh = 0.5;
      this.sync(playerX, playerZ, zones);
      this.syncGoats(playerX, playerZ);
    }
    for (const coin of Array.from(this.coins.values())) {
      if (coin.taken) continue;
      coin.spin += dt * 2.4;
      coin.mesh.rotation.z = coin.spin;
      coin.mesh.position.y = 1.05 + Math.sin(elapsed * 2 + coin.spin) * 0.12;
    }
    for (const goat of this.goats) {
      if (!goat.active) continue;
      if ((goat.tumble ?? 0) > 0) {
        this.tumbleGoat(goat, dt);
        continue;
      }
      if (Math.hypot(goat.mesh.position.x - playerX, goat.mesh.position.z - playerZ) > 90) {
        goat.active = false;
        goat.mesh.visible = false;
        continue;
      }
      this.moveGoat(goat, dt);
    }
  }

  private sync(playerX: number, playerZ: number, zones: KeepClear[]): void {
    const planned = planHazards(samples(this.runtime.visibleRoads(playerX, playerZ, 1)), zones, { x: playerX, z: playerZ })
      .filter(spot => !this.runtime.collidesBuilding(spot.x, spot.z, 0.35));
    const next = new Set(planned.map(spot => spot.id));
    for (const [id, item] of Array.from(this.live.entries())) {
      if (next.has(id)) continue;
      if (item.mesh instanceof THREE.Mesh) {
        item.mesh.visible = false;
        this.pools[item.spot.kind].push(item.mesh);
      }
      if (item.spot.kind === "coin") this.coins.delete(id);
      this.live.delete(id);
    }
    for (const spot of planned) {
      if (this.live.has(spot.id)) continue;
      const mesh = this.takeMesh(spot.kind);
      mesh.visible = spot.kind !== "coin" || !this.taken.has(spot.id);
      mesh.position.set(spot.x, spot.kind === "coin" ? 1.05 : 0.05, spot.z);
      if (spot.kind === "ramp" || spot.kind === "pothole") mesh.rotation.y = spot.yaw;
      this.live.set(spot.id, { spot, mesh });
      if (spot.kind === "coin") {
        this.coins.set(spot.id, { mesh, x: spot.x, z: spot.z, taken: this.taken.has(spot.id), spin: mesh.userData.spin ?? 0 });
      }
    }
  }

  private takeMesh(kind: HazardSpot["kind"]): THREE.Mesh {
    const pooled = this.pools[kind].pop();
    if (pooled) return pooled;
    const mesh = this.meshFor(kind);
    this.parent.add(mesh);
    return mesh;
  }

  private meshFor(kind: HazardSpot["kind"]): THREE.Mesh {
    if (kind === "pothole") {
      const mesh = new THREE.Mesh(this.potholeGeo, this.potholeMat);
      mesh.userData.keepGeometry = true;
      return mesh;
    }
    if (kind === "ramp") {
      const mesh = new THREE.Mesh(this.rampGeo, this.rampMat);
      mesh.userData.keepGeometry = true;
      return mesh;
    }
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    mesh.userData.keepGeometry = true;
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  private syncGoats(playerX: number, playerZ: number): void {
    for (const goat of this.goats) {
      if (goat.active) continue;
      const spot = this.goatCrossing(playerX, playerZ);
      if (!spot) continue;
      goat.fromX = spot.from.x;
      goat.fromZ = spot.from.z;
      goat.toX = spot.to.x;
      goat.toZ = spot.to.z;
      goat.wait = 0.4 + Math.random() * 1.2;
      goat.tumble = 0;
      goat.active = true;
      goat.mesh.visible = true;
      goat.mesh.position.set(spot.from.x, 0, spot.from.z);
      goat.mesh.rotation.z = 0;
    }
  }

  private goatCrossing(playerX: number, playerZ: number): { from: { x: number; z: number }; to: { x: number; z: number } } | null {
    const roads = this.runtime.visibleRoads(playerX, playerZ, 1);
    for (let attempt = 0; attempt < 5; attempt++) {
      if (roads.length === 0) return null;
      const road = roads[Math.floor(Math.random() * roads.length)];
      if (!goatRoadOk(road.highway) || road.points.length < 2) continue;
      const index = Math.floor(Math.random() * (road.points.length - 1));
      const a = road.points[index];
      const b = road.points[index + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 10) continue;
      const frame: RoadFrame = {
        x: (a.x + b.x) / 2,
        z: (a.z + b.z) / 2,
        tangentX: (b.x - a.x) / len,
        tangentZ: (b.z - a.z) / len,
        normalX: -(b.z - a.z) / len,
        normalZ: (b.x - a.x) / len,
        width: Math.max(2.6, road.width || 3),
        highway: road.highway,
        roadId: road.id,
        t: 0.5,
        segmentLength: len,
        segmentIndex: index,
      };
      if (Math.hypot(frame.x - playerX, frame.z - playerZ) < 16 || Math.hypot(frame.x - playerX, frame.z - playerZ) > 55) continue;
      const from = offsetSide(frame, 1, 1.4);
      const to = offsetSide(frame, -1, 1.4);
      if (this.runtime.collidesBuilding(from.x, from.z, 0.4) || this.runtime.collidesBuilding(to.x, to.z, 0.4)) continue;
      return { from, to };
    }
    return null;
  }

  private moveGoat(goat: Goat, dt: number): void {
    if (goat.wait > 0) {
      goat.wait -= dt;
      return;
    }
    const dx = goat.toX - goat.mesh.position.x;
    const dz = goat.toZ - goat.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.35) {
      const swapX = goat.fromX;
      const swapZ = goat.fromZ;
      goat.fromX = goat.toX;
      goat.fromZ = goat.toZ;
      goat.toX = swapX;
      goat.toZ = swapZ;
      goat.wait = 3.5 + Math.random() * 4;
      return;
    }
    goat.mesh.position.x += (dx / dist) * goat.speed * dt;
    goat.mesh.position.z += (dz / dist) * goat.speed * dt;
    goat.mesh.rotation.y = Math.atan2(dx, dz);
  }

  private tumbleGoat(goat: Goat, dt: number): void {
    goat.tumble = Math.max(0, (goat.tumble ?? 0) - dt);
    goat.mesh.position.x += (goat.vx ?? 0) * dt;
    goat.mesh.position.z += (goat.vz ?? 0) * dt;
    goat.vx = (goat.vx ?? 0) * Math.max(0, 1 - dt * 3);
    goat.vz = (goat.vz ?? 0) * Math.max(0, 1 - dt * 3);
    goat.mesh.rotation.z = Math.min(Math.PI / 2, goat.mesh.rotation.z + dt * 8);
    if ((goat.tumble ?? 0) > 0) return;
    goat.mesh.rotation.z = 0;
    goat.active = false;
    goat.mesh.visible = false;
  }

  dispose(): void {
    for (const item of Array.from(this.live.values())) this.parent.remove(item.mesh);
    for (const pool of Object.values(this.pools)) {
      for (const mesh of pool) this.parent.remove(mesh);
    }
    this.live.clear();
    this.coins.clear();
    for (const goat of this.goats) {
      this.parent.remove(goat.mesh);
      goat.mesh.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach(entry => entry.dispose());
        else material.dispose();
      });
    }
    this.goats.length = 0;
    this.potholeGeo.dispose();
    this.rampGeo.dispose();
    this.coinGeo.dispose();
    this.potholeMat.dispose();
    this.rampMat.dispose();
    this.coinMat.dispose();
  }
}
