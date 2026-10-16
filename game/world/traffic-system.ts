import * as THREE from "three";
import { createBusMesh, createCarMesh, createOkadaMesh, createTaxiMesh, createTrotroMesh } from "../models";
import type { AccraWorldRuntime } from "./accra-runtime";
import type { TrafficBody } from "./gameplay-actors";
import { pickContinuation } from "./road-follow";
import type { Departure, RoadGraph } from "./road-graph";
import { allowsVehicle, vehicleSpawnOk } from "./spawn-validity";

type VehicleKind = "car" | "taxi" | "trotro" | "bus" | "okada";

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
  /** Right-hand lane offset from the road centreline (0 on one-way roads). */
  lane: number;
  /** Smoothed yaw so corners turn instead of snapping. */
  yaw: number;
  /** Seconds spent held up behind another vehicle or the rider. */
  blocked: number;
  sway: number;
  /** Seconds left pulling over after the rider honked. */
  yieldT: number;
  /** Extra kerb-side offset, eased in and out. */
  laneBump: number;
}

// Ghana drives on the right: offset each vehicle into its own lane.
const LANE: Record<string, number> = {
  motorway: 2.6, trunk: 2.4, primary: 2.2, secondary: 1.9, tertiary: 1.7,
  unclassified: 1.4, residential: 1.3, service: 0.9, living_street: 0.9, track: 0.7,
};
const laneFor = (highway: string) => LANE[highway.replace("_link", "")] ?? 1.2;

const CAR_COLORS = [0xc92a2a, 0xf8f9fa, 0x868e96, 0x1c7ed6, 0x2f9e44, 0xf59f00];

function makeMesh(kind: VehicleKind, index: number): THREE.Group {
  switch (kind) {
    case "car":
      return createCarMesh(CAR_COLORS[index % CAR_COLORS.length]);
    case "taxi":
      return createTaxiMesh();
    case "trotro":
      return createTrotroMesh(index);
    case "bus":
      return createBusMesh();
    case "okada":
      return createOkadaMesh(index);
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
      return 10 + Math.random() * 3.5;
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
  /** Called when a held-up driver leans on the horn; argument is metres from the rider. */
  onHonk: ((distance: number) => void) | null = null;

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
    const mix: VehicleKind[] = ["okada", "taxi", "car", "trotro", "okada", "taxi", "car", "bus", "okada", "trotro", "taxi"];
    for (let i = 0; i < this.target; i++) {
      const kind = mix[i % mix.length];
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
        lane: 0, yaw: 0, blocked: 0, sway: Math.random() * 10, yieldT: 0, laneBump: 0,
      });
    }
  }

  /**
   * Rider honked ("Agoo!"): vehicles ahead going the same way ease toward the
   * kerb and slow a little so the bike can pass. Returns how many yielded.
   */
  honk(x: number, z: number, heading: number): number {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let n = 0;
    for (const v of this.vehicles) {
      if (!v.active || !v.mesh.visible) continue;
      const dx = v.mesh.position.x - x, dz = v.mesh.position.z - z;
      const ahead = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      let dYaw = Math.abs(v.yaw - heading) % (Math.PI * 2);
      if (dYaw > Math.PI) dYaw = Math.PI * 2 - dYaw;
      if (ahead > 2 && ahead < 32 && lateral < 4 && dYaw < 0.8) { v.yieldT = 3; n++; }
    }
    return n;
  }

  bodies(): TrafficBody[] {
    return this.vehicles.filter(vehicle => vehicle.active);
  }

  update(dt: number, playerX: number, playerZ: number): void {
    if (!this.graph) return;
    for (const vehicle of this.vehicles) {
      if (!vehicle.active) continue;
      this.advance(vehicle, dt, playerX, playerZ);
      const away = Math.hypot(vehicle.mesh.position.x - playerX, vehicle.mesh.position.z - playerZ);
      if (away > 200) this.park(vehicle);
      else vehicle.mesh.visible = away < 150;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 0.35;
    const live = this.vehicles.filter(vehicle => vehicle.active).length;
    if (live >= this.target) return;
    for (let n = live; n < this.target; n++) {
      const idle = this.vehicles.find(vehicle => !vehicle.active);
      if (!idle || !this.place(idle, playerX, playerZ)) break;
    }
  }

  private place(vehicle: Vehicle, playerX: number, playerZ: number): boolean {
    const graph = this.graph;
    if (!graph) return false;
    const nodes = graph.nodesInRadius(playerX, playerZ, 150);
    if (nodes.length === 0) return false;
    for (let attempt = 0; attempt < 8; attempt++) {
      const node = nodes[Math.floor(Math.random() * nodes.length)];
      const options = graph.departures(node.id).filter(option => allowsVehicle(vehicle.kind, option.edge.highway));
      if (options.length === 0) continue;
      const choice = options[Math.floor(Math.random() * options.length)];
      const length = Math.hypot(choice.bx - choice.ax, choice.bz - choice.az);
      if (length < 8) continue;
      const t = 0.2 + Math.random() * 0.6;
      const x = choice.ax + (choice.bx - choice.ax) * t;
      const z = choice.az + (choice.bz - choice.az) * t;
      if (!vehicleSpawnOk({
        x, z, playerX, playerZ,
        inBuilding: !!this.runtime.collidesBuilding(x, z, 1.1),
        minPlayer: 18,
      })) continue;
      if (this.vehicles.some(other => other.active && other !== vehicle && Math.hypot(other.mesh.position.x - x, other.mesh.position.z - z) < 12)) continue;
      this.assignEdge(vehicle, choice, length);
      vehicle.traveled = t * length;
      vehicle.speed = vehicle.cruise;
      vehicle.stopped = 0;
      vehicle.blocked = 0;
      vehicle.active = true;
      vehicle.mesh.visible = true;
      vehicle.yaw = Math.atan2(choice.bx - choice.ax, choice.bz - choice.az);
      vehicle.mesh.rotation.y = vehicle.yaw;
      vehicle.mesh.position.set(x - Math.cos(vehicle.yaw) * vehicle.lane, 0, z + Math.sin(vehicle.yaw) * vehicle.lane);
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
    if (vehicle.kind === "trotro" && vehicle.traveled > vehicle.length * 0.18 && vehicle.traveled < vehicle.length * 0.78 && Math.random() < dt * 0.018) {
      vehicle.stopped = 2.5;
      return;
    }
    let speed = vehicle.cruise;
    let heldUp = false;
    const remaining = vehicle.length - vehicle.traveled;
    if (remaining < 12) speed *= 0.45 + 0.55 * Math.max(0.2, remaining / 12);
    const aheadX = playerX - vehicle.mesh.position.x;
    const aheadZ = playerZ - vehicle.mesh.position.z;
    const ahead = Math.hypot(aheadX, aheadZ);
    const playerLateral = Math.abs(aheadX * dirZ - aheadZ * dirX) / dirLen;
    if (ahead < 16 && ahead > .05 && playerLateral < 2.2) {
      const dot = (aheadX * dirX + aheadZ * dirZ) / (ahead * dirLen);
      if (dot > 0.65) { speed *= Math.max(0, Math.min(1, (ahead - 3.2) / 12)); heldUp = speed < vehicle.cruise * 0.3; }
    }
    for (const other of this.vehicles) {
      if (!other.active || other === vehicle) continue;
      const dx = other.mesh.position.x - vehicle.mesh.position.x;
      const dz = other.mesh.position.z - vehicle.mesh.position.z;
      const gap = Math.hypot(dx, dz);
      if (gap > 9 || gap < 0.05) continue;
      const lateral = Math.abs(dx*dirZ-dz*dirX)/dirLen;
      const limit = vehicle.kind === "okada" ? 1.1 : 2.4;
      if (lateral < limit && (dx * dirX + dz * dirZ) / (gap * dirLen) > .65) {
        speed = Math.min(speed, Math.max(0, (gap - (vehicle.kind === "okada" ? 2.6 : 4.2)) * 1.4));
        if (speed < vehicle.cruise * 0.3) heldUp = true;
      }
    }
    if (vehicle.yieldT > 0) { vehicle.yieldT -= dt; speed *= 0.72; }
    vehicle.speed = speed;
    vehicle.blocked = heldUp ? vehicle.blocked + dt : 0;
    if (vehicle.blocked > 1.2 && Math.random() < dt * 0.6 && this.onHonk) {
      const distance = Math.hypot(vehicle.mesh.position.x - playerX, vehicle.mesh.position.z - playerZ);
      if (distance < 70) this.onHonk(distance);
      vehicle.blocked = 0.4;
    }
    vehicle.traveled += speed * dt;
    if (vehicle.traveled >= vehicle.length) {
      if (!this.turn(vehicle, dirX / dirLen, dirZ / dirLen)) {
        this.park(vehicle);
        return;
      }
    }
    const t = vehicle.length > 0 ? vehicle.traveled / vehicle.length : 0;
    const x = vehicle.ax + (vehicle.bx - vehicle.ax) * t;
    const z = vehicle.az + (vehicle.bz - vehicle.az) * t;
    if (this.runtime.collidesBuilding(x, z, 0.9)) {
      this.park(vehicle);
      return;
    }
    const yaw = Math.atan2(vehicle.bx - vehicle.ax, vehicle.bz - vehicle.az);
    let dy = yaw - vehicle.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    vehicle.yaw += dy * Math.min(1, dt * 6);
    // Okadas weave a little within their lane.
    vehicle.sway += dt;
    vehicle.laneBump += ((vehicle.yieldT > 0 ? 1.3 : 0) - vehicle.laneBump) * Math.min(1, dt * 2.5);
    const lane = vehicle.lane + vehicle.laneBump + (vehicle.kind === "okada" ? Math.sin(vehicle.sway * 0.9) * 0.45 : 0);
    vehicle.mesh.position.set(x - Math.cos(yaw) * lane, 0, z + Math.sin(yaw) * lane);
    vehicle.mesh.rotation.y = vehicle.yaw;
    if (vehicle.kind === "okada") vehicle.mesh.rotation.z = THREE.MathUtils.clamp(-dy * 0.6, -0.3, 0.3);
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
    this.assignEdge(vehicle, choice, length);
    vehicle.traveled = Math.min(length * 0.5, Math.max(0, overflow));
    return true;
  }

  private assignEdge(vehicle: Vehicle, choice: Departure, length: number): void {
    vehicle.ax = choice.ax;
    vehicle.az = choice.az;
    vehicle.bx = choice.bx;
    vehicle.bz = choice.bz;
    vehicle.length = length;
    vehicle.toId = choice.edge.to;
    vehicle.highway = choice.edge.highway;
    const twoWay = this.graph?.departures(choice.edge.to).some(option => option.edge.to === choice.edge.from) ?? true;
    // Okadas hug the kerb side of the lane; big vehicles sit in the middle of it.
    vehicle.lane = twoWay ? laneFor(choice.edge.highway) * (vehicle.kind === "okada" ? 1.35 : 1) : (vehicle.kind === "okada" ? 1 : 0);
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
