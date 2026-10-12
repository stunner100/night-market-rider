import * as THREE from "three";
import { animateIdle, animateWalk, buildHumanoid, SKIN_TONES, type HairStyle, type HumanoidRig } from "../characters";
import type { AccraWorldRuntime } from "./accra-runtime";
import type { WalkerBody } from "./gameplay-actors";
import { offsetSide, type RoadFrame } from "./roadside-placement";
import { isMajorRoad, pedestrianSpawnOk } from "./spawn-validity";
import type { WorldPoint, WorldRoad } from "./types";

interface Walker extends WalkerBody {
  active: boolean;
  rig: HumanoidRig;
  speed: number;
  seed: number;
  path: WorldPoint[];
  index: number;
  wait: number;
}

const HAIR: HairStyle[] = ["afro", "short", "wrap", "cap", "bald"];
const SHIRTS = [0xe67700, 0x1971c2, 0xd6336c, 0x2f9e44, 0xf2e35c, 0xe9ecef, 0x7b3f91, 0xc92a2a];
const GOODS = [0xf28c35, 0xf2e35c, 0x2f9e44, 0xd94d3f, 0xe9ecef];

/** Street hawker's head-load: an aluminium basin piled with goods. */
function headLoad(seed: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "head-load";
  const basin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.2, 0.12, 14),
    new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.35, metalness: 0.7 }),
  );
  basin.castShadow = true;
  g.add(basin);
  const goods = new THREE.MeshStandardMaterial({ color: GOODS[seed % GOODS.length], roughness: 0.6 });
  const fruit = new THREE.SphereGeometry(0.075, 8, 6);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(fruit, goods);
    const a = (i / 6) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.15;
    m.position.set(Math.cos(a) * r, 0.1 + (i === 0 ? 0.07 : 0), Math.sin(a) * r);
    g.add(m);
  }
  g.position.y = 0.37;
  return g;
}

function frameFromSegment(road: WorldRoad, index: number): RoadFrame | null {
  const a = road.points[index];
  const b = road.points[index + 1];
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 4) return null;
  const tx = (b.x - a.x) / len;
  const tz = (b.z - a.z) / len;
  return {
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    tangentX: tx,
    tangentZ: tz,
    normalX: -tz,
    normalZ: tx,
    width: Math.max(2.6, road.width || 3.2),
    highway: road.highway,
    roadId: road.id,
    t: 0.5,
    segmentLength: len,
    segmentIndex: index,
  };
}

export class ActivePedestrians {
  private walkers: Walker[] = [];
  private spawnTimer = 0;
  private readonly target: number;

  constructor(
    private runtime: AccraWorldRuntime,
    private parent: THREE.Group,
    private mobile: boolean,
  ) {
    this.target = mobile ? 8 : 20;
  }

  start(): void {
    if (this.walkers.length > 0) return;
    for (let i = 0; i < this.target; i++) {
      const rig = buildHumanoid({
        skin: SKIN_TONES[i % SKIN_TONES.length],
        shirt: SHIRTS[i % SHIRTS.length],
        pants: [0x343a40, 0x1971c2, 0x2b2b2b][i % 3],
        hair: HAIR[i % HAIR.length],
        scale: 0.94 + (i % 4) * 0.02,
        bulk: 0.95,
        feminine: i % 3 === 0,
        detail: this.mobile || i >= 10 ? "simple" : "full",
      });
      // Low-detail extras skip the shadow pass to keep busy streets affordable.
      if (this.mobile || i >= 10) rig.group.traverse(o => { o.castShadow = false; });
      // Roughly one in three walkers is a hawker carrying goods on the head.
      if (i % 3 === 1) rig.head.add(headLoad(i));
      rig.group.visible = false;
      this.parent.add(rig.group);
      this.walkers.push({
        mesh: rig.group,
        rig,
        active: false,
        speed: 1.05 + (i % 3) * 0.15,
        seed: i * 1.7,
        path: [],
        index: 0,
        wait: 0,
        tumble: 0,
        vx: 0,
        vz: 0,
      });
    }
  }

  bodies(): WalkerBody[] {
    return this.walkers.filter(walker => walker.active);
  }

  update(dt: number, elapsed: number, playerX: number, playerZ: number): void {
    for (const walker of this.walkers) {
      if (!walker.active) continue;
      if ((walker.tumble ?? 0) > 0) {
        this.tumble(walker, dt);
        continue;
      }
      const away = Math.hypot(walker.mesh.position.x - playerX, walker.mesh.position.z - playerZ);
      if (away > 78) {
        this.park(walker);
        continue;
      }
      this.step(walker, dt, elapsed);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.2;
    for (const walker of this.walkers) {
      if (walker.active) continue;
      if (this.place(walker, playerX, playerZ)) break;
    }
  }

  private place(walker: Walker, playerX: number, playerZ: number): boolean {
    const roads = this.runtime.visibleRoads(playerX, playerZ, 1);
    if (roads.length === 0) return false;
    const byId = new Map(roads.map(road => [road.id, road]));
    for (let attempt = 0; attempt < 6; attempt++) {
      // Sample near the rider: walkers further than the despawn radius would
      // vanish immediately and leave the streets empty.
      const angle = Math.random() * Math.PI * 2;
      const radius = 18 + Math.random() * 50;
      const near = this.runtime.nearestRoadFrame(playerX + Math.sin(angle) * radius, playerZ + Math.cos(angle) * radius, 30);
      const road = near ? byId.get(near.roadId) : undefined;
      if (!near || !road || road.points.length < 2) continue;
      const index = Math.min(near.segmentIndex, road.points.length - 2);
      const frame = frameFromSegment(road, index);
      if (!frame) continue;
      for (const side of [1, -1] as const) {
        const spot = offsetSide(frame, side, 1.5);
        if (!pedestrianSpawnOk({
          x: spot.x,
          z: spot.z,
          playerX,
          playerZ,
          inBuilding: !!this.runtime.collidesBuilding(spot.x, spot.z, 0.45),
          highway: road.highway,
          distFromCenter: Math.hypot(spot.x - frame.x, spot.z - frame.z),
          roadWidth: frame.width,
          minPlayer: 14,
        })) continue;
        const path = this.sidewalkPath(road, index, side);
        if (path.length < 2) continue;
        walker.path = path;
        walker.index = 0;
        walker.wait = 0;
        walker.tumble = 0;
        walker.active = true;
        walker.mesh.visible = true;
        walker.mesh.position.set(path[0].x, 0, path[0].z);
        walker.mesh.rotation.z = 0;
        return true;
      }
    }
    return false;
  }

  private sidewalkPath(road: WorldRoad, index: number, side: 1 | -1): WorldPoint[] {
    // Walk along segment endpoints (not just midpoints) so even the short
    // two-point road pieces in the baked map give a usable sidewalk.
    const path: WorldPoint[] = [];
    const end = Math.min(road.points.length - 1, index + 5);
    const offset = Math.max(2.6, road.width || 3.2) * 0.5 + 1.5;
    for (let i = index; i < end; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 3) continue;
      const nx = -(b.z - a.z) / len * side * offset, nz = (b.x - a.x) / len * side * offset;
      for (const t of i === index ? [0.08, 0.92] : [0.92]) {
        const spot = { x: a.x + (b.x - a.x) * t + nx, z: a.z + (b.z - a.z) * t + nz };
        if (!this.runtime.collidesBuilding(spot.x, spot.z, 0.4)) path.push(spot);
      }
    }
    return path;
  }

  private step(walker: Walker, dt: number, elapsed: number): void {
    if (walker.wait > 0) {
      walker.wait -= dt;
      animateIdle(walker.rig, elapsed, walker.seed);
      return;
    }
    const target = walker.path[walker.index];
    if (!target) {
      this.park(walker);
      return;
    }
    const dx = target.x - walker.mesh.position.x;
    const dz = target.z - walker.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.45) {
      walker.index += 1;
      if (walker.index >= walker.path.length) {
        walker.path.reverse();
        walker.index = 0;
        walker.wait = 0.6;
      }
      return;
    }
    const step = Math.min(dist, walker.speed * dt);
    walker.mesh.position.x += (dx / dist) * step;
    walker.mesh.position.z += (dz / dist) * step;
    walker.mesh.rotation.y = Math.atan2(dx, dz);
    if ((Math.floor(elapsed*15)+Math.floor(walker.seed))%2===0) animateWalk(walker.rig, elapsed + walker.seed, 3.2);
    if (walker.index === 2 && walker.path.length > 3 && Math.random() < dt * 0.15) this.tryCross(walker);
  }

  private tryCross(walker: Walker): void {
    const here = walker.mesh.position;
    const frame = this.runtime.nearestRoadFrame(here.x, here.z, 8);
    if (!frame || isMajorRoad(frame.highway) || frame.highway === "secondary") return;
    if (frame.width > 9) return;
    const side: 1 | -1 = (here.x - frame.x) * frame.normalX + (here.z - frame.z) * frame.normalZ >= 0 ? 1 : -1;
    const other = offsetSide(frame, side === 1 ? -1 : 1, 1.5);
    if (this.runtime.collidesBuilding(other.x, other.z, 0.4)) return;
    walker.path = [{ x: here.x, z: here.z }, other, ...walker.path.slice(walker.index)];
    walker.index = 1;
  }

  private tumble(walker: Walker, dt: number): void {
    walker.tumble = Math.max(0, (walker.tumble ?? 0) - dt);
    walker.mesh.position.x += (walker.vx ?? 0) * dt;
    walker.mesh.position.z += (walker.vz ?? 0) * dt;
    walker.vx = (walker.vx ?? 0) * Math.max(0, 1 - dt * 3);
    walker.vz = (walker.vz ?? 0) * Math.max(0, 1 - dt * 3);
    walker.mesh.rotation.z = Math.min(Math.PI / 2, walker.mesh.rotation.z + dt * 8);
    if ((walker.tumble ?? 0) > 0) return;
    walker.mesh.rotation.z = 0;
    walker.mesh.position.y = 0;
    this.park(walker);
  }

  private park(walker: Walker): void {
    walker.active = false;
    walker.mesh.visible = false;
    walker.tumble = 0;
    walker.vx = 0;
    walker.vz = 0;
  }

  dispose(): void {
    for (const walker of this.walkers) this.parent.remove(walker.mesh);
    this.walkers.length = 0;
  }
}
