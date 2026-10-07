import * as THREE from "three";
import { createBusMesh, createCarMesh, createOkadaMesh, createTaxiMesh, createTrotroMesh } from "../models";
import type { AccraWorldRuntime } from "./accra-runtime";
import type { TrafficBody } from "./gameplay-actors";
import { pickContinuation } from "./road-follow";
import { type Departure, type RoadGraph } from "./road-graph";
import { allowsVehicle, vehicleSpawnOk } from "./spawn-validity";

type VehicleKind = "car" | "taxi" | "trotro" | "bus" | "okada";

const MIX: VehicleKind[] = ["okada", "taxi", "trotro", "car", "okada", "taxi", "trotro", "okada", "car", "bus"];
const OKADA_COLORS = [0xf4c542, 0x2f9e44, 0xe03131, 0x212529, 0xf8f9fa, 0x1971c2];
const SPAWN_RADIUS = 125;
const DESPAWN_RADIUS = 168;
const SPAWN_GAP = 11;
const SPAWNS_PER_TICK = 3;

interface Vehicle extends TrafficBody {
  active: boolean;
  wheels: THREE.Object3D[];
  brake: THREE.Mesh | null;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
  traveled: number;
  cruise: number;
  speed: number;
  toId: string;
  highway: string;
  kind: VehicleKind;
}

const CAR_COLORS = [0xc92a2a, 0xf8f9fa, 0x868e96, 0x1c7ed6, 0x2f9e44, 0xf59f00];

function makeMesh(kind: VehicleKind, index: number): THREE.Group {
  switch (kind) {
    case "car":
      return createCarMesh(CAR_COLORS[index % CAR_COLORS.length]);
    case "taxi":
      return createTaxiMesh();
    case "trotro":
      return createTrotroMesh();
    case "bus":
      return createBusMesh();
    case "okada":
      return createOkadaMesh(OKADA_COLORS[index % OKADA_COLORS.length]);
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function laneFor(kind: VehicleKind): number {
  switch (kind) {
    case "okada":
      return 1.35;
    case "car":
    case "taxi":
      return 0.9;
    case "trotro":
      return 0.95;
    case "bus":
      return 0.45;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

function cruiseFor(kind: VehicleKind): number {
  switch (kind) {
    case "car":
      return 8 + Math.random() * 3.5;
    case "taxi":
      return 9 + Math.random() * 3;
    case "trotro":
      return 6.5 + Math.random() * 2.4;
    case "bus":
      return 7 + Math.random() * 2.2;
    case "okada":
      return 9.5 + Math.random() * 3.2;
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export class TrafficSystem {
  private vehicles: Vehicle[] = [];
  private spawnTimer = 0;
  private readonly target: number;

  constructor(
    private graph: RoadGraph | null,
    private runtime: AccraWorldRuntime,
    private parent: THREE.Group,
    mobile: boolean,
  ) {
    this.target = mobile ? 10 : 22;
  }

  start(): void {
    if (!this.graph || this.vehicles.length > 0) return;
    for (let i = 0; i < this.target; i++) {
      const kind = MIX[i % MIX.length];
      const mesh = makeMesh(kind, i);
      mesh.visible = false;
      this.parent.add(mesh);
      const wheels: THREE.Object3D[] = [];
      let brake: THREE.Mesh | null = null;
      mesh.traverse(child => {
        if (child.name === "brake" && child instanceof THREE.Mesh) brake = child;
        if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CylinderGeometry && child.name !== "lamp") {
          wheels.push(child);
        }
      });
      this.vehicles.push({
        mesh, kind, wheels, brake, active: false, stopped: 0, speed: 0, cruise: cruiseFor(kind),
        ax: 0, az: 0, bx: 0, bz: 0, length: 1, traveled: 0, toId: "", highway: "",
      });
    }
  }

  bodies(): TrafficBody[] {
    return this.vehicles.filter(vehicle => vehicle.active);
  }

  /** Pre-fill vehicles around the title/menu anchor (desktop gets a fuller street). */
  warmStart(playerX: number, playerZ: number, heading: number, target: number): number {
    let live = this.vehicles.filter(v => v.active).length;
    for (let round = 0; round < 14 && live < target; round++) {
      for (const vehicle of this.vehicles) {
        if (live >= target) break;
        if (vehicle.active) continue;
        if (this.place(vehicle, playerX, playerZ, heading)) live += 1;
      }
    }
    return live;
  }

  update(dt: number, playerX: number, playerZ: number, heading = 0): void {
    if (!this.graph) return;
    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue;
      this.advance(vehicle, dt, playerX, playerZ);
      const away = Math.hypot(vehicle.mesh.position.x - playerX, vehicle.mesh.position.z - playerZ);
      if (away > DESPAWN_RADIUS) this.park(vehicle);
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.28;
    const live = this.vehicles.filter(vehicle => vehicle.active).length;
    if (live >= this.target) return;
    let placed = 0;
    for (const idle of this.vehicles) {
      if (idle.active) continue;
      if (this.place(idle, playerX, playerZ, heading)) placed += 1;
      if (placed >= SPAWNS_PER_TICK) break;
    }
  }

  private pose(vehicle: Vehicle, t: number): { x: number; z: number } {
    const x = vehicle.ax + (vehicle.bx - vehicle.ax) * t;
    const z = vehicle.az + (vehicle.bz - vehicle.az) * t;
    const dirX = vehicle.bx - vehicle.ax;
    const dirZ = vehicle.bz - vehicle.az;
    const len = Math.hypot(dirX, dirZ) || 1;
    const lane = laneFor(vehicle.kind);
    return { x: x + (dirZ / len) * lane, z: z - (dirX / len) * lane };
  }

  private trafficAhead(playerX: number, playerZ: number, heading: number, kind: VehicleKind): Departure[] {
    const graph = this.graph;
    if (!graph) return [];
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const options: Departure[] = [];
    for (const node of graph.nodesInRadius(playerX, playerZ, 55)) {
      for (const option of graph.departures(node.id)) {
        if (!allowsVehicle(kind, option.edge.highway)) continue;
        const edgeX = option.bx - option.ax;
        const edgeZ = option.bz - option.az;
        const len = Math.hypot(edgeX, edgeZ) || 1;
        if ((edgeX * fx + edgeZ * fz) / len < 0.25) continue;
        const edgeLen2 = edgeX * edgeX + edgeZ * edgeZ || 1;
        const targetX = playerX + fx * 26;
        const targetZ = playerZ + fz * 26;
        let t = ((targetX - option.ax) * edgeX + (targetZ - option.az) * edgeZ) / edgeLen2;
        t = Math.min(0.92, Math.max(0.08, t));
        const x = option.ax + edgeX * t;
        const z = option.az + edgeZ * t;
        const dx = x - playerX;
        const dz = z - playerZ;
        const along = dx * fx + dz * fz;
        const lateral = Math.abs(dx * fz - dz * fx);
        if (along < 12 || along > 50 || lateral > 8) continue;
        options.push(option);
      }
    }
    return options;
  }

  private place(vehicle: Vehicle, playerX: number, playerZ: number, heading: number): boolean {
    const graph = this.graph;
    if (!graph) return false;
    const ahead = this.trafficAhead(playerX, playerZ, heading, vehicle.kind);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (let attempt = 0; attempt < 12; attempt++) {
      let choice: Departure | undefined;
      if (ahead.length > 0 && (attempt < 8 || Math.random() < 0.65)) {
        choice = ahead[Math.floor(Math.random() * ahead.length)];
      } else {
        const nodes = graph.nodesInRadius(playerX, playerZ, SPAWN_RADIUS);
        if (nodes.length === 0) continue;
        const node = nodes[Math.floor(Math.random() * nodes.length)];
        const options = graph.departures(node.id).filter(option => allowsVehicle(vehicle.kind, option.edge.highway));
        if (options.length === 0) continue;
        choice = options[Math.floor(Math.random() * options.length)];
      }
      const length = Math.hypot(choice.bx - choice.ax, choice.bz - choice.az);
      if (length < 8) continue;
      const reach = 16 + Math.random() * 24;
      const targetX = playerX + fx * reach;
      const targetZ = playerZ + fz * reach;
      const edgeX = choice.bx - choice.ax;
      const edgeZ = choice.bz - choice.az;
      const edgeLen2 = edgeX * edgeX + edgeZ * edgeZ || 1;
      let t = ((targetX - choice.ax) * edgeX + (targetZ - choice.az) * edgeZ) / edgeLen2;
      t = Math.min(0.92, Math.max(0.08, t));
      vehicle.ax = choice.ax;
      vehicle.az = choice.az;
      vehicle.bx = choice.bx;
      vehicle.bz = choice.bz;
      vehicle.length = length;
      const posed = this.pose(vehicle, t);
      const along = (posed.x - playerX) * fx + (posed.z - playerZ) * fz;
      const lateral = Math.abs((posed.x - playerX) * fz - (posed.z - playerZ) * fx);
      if (attempt < 8 && (along < 12 || along > 48 || lateral > 14)) continue;
      const body = vehicle.kind === "okada" ? 0.55 : 1.1;
      if (!vehicleSpawnOk({
        x: posed.x, z: posed.z, playerX, playerZ,
        inBuilding: !!this.runtime.collidesBuilding(posed.x, posed.z, body),
        minPlayer: 16,
      })) continue;
      if (this.vehicles.some(other => other.active && other !== vehicle && Math.hypot(other.mesh.position.x - posed.x, other.mesh.position.z - posed.z) < SPAWN_GAP)) continue;
      vehicle.traveled = t * length;
      vehicle.toId = choice.edge.to;
      vehicle.highway = choice.edge.highway;
      vehicle.speed = vehicle.cruise;
      vehicle.stopped = 0;
      vehicle.active = true;
      vehicle.mesh.visible = true;
      vehicle.mesh.position.set(posed.x, 0, posed.z);
      vehicle.mesh.rotation.y = Math.atan2(choice.bx - choice.ax, choice.bz - choice.az);
      return true;
    }
    return false;
  }

  private advance(vehicle: Vehicle, dt: number, playerX: number, playerZ: number): void {
    if (vehicle.stopped > 0) {
      vehicle.stopped -= dt;
      vehicle.speed = 0;
      this.paintBrake(vehicle, true);
      return;
    }
    const dirX = vehicle.bx - vehicle.ax;
    const dirZ = vehicle.bz - vehicle.az;
    const dirLen = Math.hypot(dirX, dirZ) || 1;
    const pullsOver = vehicle.highway !== "service" && vehicle.highway !== "living_street";
    if (vehicle.kind === "trotro" && pullsOver && vehicle.traveled > vehicle.length * 0.18 && vehicle.traveled < vehicle.length * 0.78 && Math.random() < dt * 0.012) {
      vehicle.stopped = 2.5;
      return;
    }
    let speed = vehicle.cruise;
    const remaining = vehicle.length - vehicle.traveled;
    if (remaining < 12) speed *= 0.45 + 0.55 * Math.max(0.2, remaining / 12);
    const aheadX = playerX - vehicle.mesh.position.x;
    const aheadZ = playerZ - vehicle.mesh.position.z;
    const ahead = Math.hypot(aheadX, aheadZ);
    if (ahead < 16 && ahead > 2) {
      const dot = (aheadX * dirX + aheadZ * dirZ) / (ahead * dirLen);
      if (dot > 0.45) speed *= Math.max(0.15, ahead / 16);
    }
    for (const other of this.vehicles) {
      if (!other.active || other === vehicle) continue;
      const dx = other.mesh.position.x - vehicle.mesh.position.x;
      const dz = other.mesh.position.z - vehicle.mesh.position.z;
      const gap = Math.hypot(dx, dz);
      if (gap > 9 || gap < 0.05) continue;
      if ((dx * dirX + dz * dirZ) / (gap * dirLen) > 0.35) speed *= 0.4;
    }
    vehicle.speed = speed;
    vehicle.traveled += speed * dt;
    if (vehicle.traveled >= vehicle.length) {
      if (!this.turn(vehicle, dirX / dirLen, dirZ / dirLen)) {
        this.park(vehicle);
        return;
      }
    }
    const t = vehicle.length > 0 ? vehicle.traveled / vehicle.length : 0;
    const posed = this.pose(vehicle, t);
    const body = vehicle.kind === "okada" ? 0.45 : 0.9;
    if (this.runtime.collidesBuilding(posed.x, posed.z, body)) {
      this.park(vehicle);
      return;
    }
    vehicle.mesh.position.set(posed.x, 0, posed.z);
    vehicle.mesh.rotation.y = Math.atan2(vehicle.bx - vehicle.ax, vehicle.bz - vehicle.az);
    for (const wheel of vehicle.wheels) wheel.rotation.x += speed * dt * 2.2;
    this.paintBrake(vehicle, speed < vehicle.cruise * 0.65);
  }

  private turn(vehicle: Vehicle, dirX: number, dirZ: number): boolean {
    const graph = this.graph;
    if (!graph) return false;
    const options = graph.departures(vehicle.toId).filter(option => allowsVehicle(vehicle.kind, option.edge.highway));
    if (options.length === 0) return false;
    const index = pickContinuation(
      options.map(option => ({ dirX: option.bx - option.ax, dirZ: option.bz - option.az })),
      dirX,
      dirZ,
      Math.random(),
    );
    const choice = options[index] ?? options[0];
    const length = Math.hypot(choice.bx - choice.ax, choice.bz - choice.az);
    if (length < 2) return false;
    const overflow = vehicle.traveled - vehicle.length;
    vehicle.ax = choice.ax;
    vehicle.az = choice.az;
    vehicle.bx = choice.bx;
    vehicle.bz = choice.bz;
    vehicle.length = length;
    vehicle.traveled = Math.min(length * 0.5, Math.max(0, overflow));
    vehicle.toId = choice.edge.to;
    vehicle.highway = choice.edge.highway;
    return true;
  }

  private paintBrake(vehicle: Vehicle, on: boolean): void {
    if (!vehicle.brake) return;
    (vehicle.brake.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xff0000 : 0x550000);
  }

  private park(vehicle: Vehicle): void {
    vehicle.active = false;
    vehicle.mesh.visible = false;
    vehicle.stopped = 0;
  }

  dispose(): void {
    for (const vehicle of this.vehicles) {
      this.parent.remove(vehicle.mesh);
      vehicle.mesh.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach(entry => entry.dispose());
        else material.dispose();
      });
    }
    this.vehicles.length = 0;
  }
}
