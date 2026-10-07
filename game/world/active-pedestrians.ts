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
const SHIRTS = [0xe67700, 0x1971c2, 0xd6336c, 0x2f9e44, 0xf2e35c, 0xe9ecef];

function alongHeading(x: number, z: number, playerX: number, playerZ: number, fx: number, fz: number): number {
  return (x - playerX) * fx + (z - playerZ) * fz;
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
  private readonly detail: "simple" | "full";

  constructor(
    private runtime: AccraWorldRuntime,
    private parent: THREE.Group,
    mobile: boolean,
  ) {
    this.target = mobile ? 8 : 16;
    this.detail = mobile ? "simple" : "full";
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
        detail: this.detail,
      });
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

  update(dt: number, elapsed: number, playerX: number, playerZ: number, heading = 0): void {
    for (const walker of this.walkers) {
      if (!walker.active) continue;
      if ((walker.tumble ?? 0) > 0) {
        this.tumble(walker, dt);
        continue;
      }
      const away = Math.hypot(walker.mesh.position.x - playerX, walker.mesh.position.z - playerZ);
      if (away > 96) {
        this.park(walker);
        continue;
      }
      this.step(walker, dt, elapsed);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.32;
    let born = 0;
    for (const walker of this.walkers) {
      if (walker.active) continue;
      if (this.place(walker, playerX, playerZ, heading)) born += 1;
      if (born >= 3) break;
    }
  }

  private place(walker: Walker, playerX: number, playerZ: number, heading: number): boolean {
    const roads = this.runtime.visibleRoads(playerX, playerZ, 1);
    if (roads.length === 0) return false;
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const spots: { road: WorldRoad; index: number; side: 1 | -1; x: number; z: number; along: number }[] = [];
    for (const road of roads) {
      if (road.points.length < 2 || isMajorRoad(road.highway)) continue;
      for (let index = 0; index < road.points.length - 1; index++) {
        const frame = frameFromSegment(road, index);
        if (!frame) continue;
        for (const side of [1, -1] as const) {
          const spot = offsetSide(frame, side, 1.5);
          const dx = spot.x - playerX;
          const dz = spot.z - playerZ;
          const along = dx * fx + dz * fz;
          const lateral = Math.abs(dx * fz - dz * fx);
          if (along < 8 || along > 46 || lateral > 8) continue;
          if (!pedestrianSpawnOk({
            x: spot.x,
            z: spot.z,
            playerX,
            playerZ,
            inBuilding: !!this.runtime.collidesBuilding(spot.x, spot.z, 0.45),
            highway: road.highway,
            distFromCenter: Math.hypot(spot.x - frame.x, spot.z - frame.z),
            roadWidth: frame.width,
            minPlayer: 10,
          })) continue;
          spots.push({ road, index, side, x: spot.x, z: spot.z, along });
        }
      }
    }
    spots.sort((a, b) => a.along - b.along);
    for (const spot of spots) {
      if (this.walkers.some(other => other.active && Math.hypot(other.mesh.position.x - spot.x, other.mesh.position.z - spot.z) < 5)) continue;
      const path = this.sidewalkPathAhead(spot.road, spot.index, spot.side, playerX, playerZ, fx, fz);
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
    return false;
  }

  private sidewalkPathAhead(
    road: WorldRoad,
    startIndex: number,
    side: 1 | -1,
    playerX: number,
    playerZ: number,
    fx: number,
    fz: number,
  ): WorldPoint[] {
    const path: WorldPoint[] = [];
    const end = Math.min(road.points.length - 1, startIndex + 6);
    for (let index = startIndex; index < end; index++) {
      const frame = frameFromSegment(road, index);
      if (!frame) continue;
      const point = offsetSide(frame, side, 1.5);
      const along = (point.x - playerX) * fx + (point.z - playerZ) * fz;
      if (path.length === 0 && along < 6) continue;
      const prev = path[path.length - 1];
      if (path.length > 0 && prev && along <= alongHeading(prev.x, prev.z, playerX, playerZ, fx, fz) + 0.5) continue;
      if (this.runtime.collidesBuilding(point.x, point.z, 0.4)) continue;
      path.push({ x: point.x, z: point.z });
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
    animateWalk(walker.rig, elapsed + walker.seed, 3.2);
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
