import * as THREE from "three";
import { createBusMesh, createCarMesh, createTaxiMesh, createTrotroMesh } from "../models";
import type { AccraWorldRuntime } from "./accra-runtime";
import type { TrafficBody } from "./gameplay-actors";
import { pickContinuation } from "./road-follow";
import type { RoadGraph } from "./road-graph";
import { allowsVehicle, vehicleSpawnOk } from "./spawn-validity";

type VehicleKind = "car" | "taxi" | "trotro" | "bus";

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
    this.target = mobile ? 6 : 12;
  }

  start(): void {
    if (!this.graph || this.vehicles.length > 0) return;
    const mix: VehicleKind[] = ["car", "taxi", "trotro", "car", "taxi", "bus", "trotro", "car"];
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
      });
    }
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
      vehicle.ax = choice.ax;
      vehicle.az = choice.az;
      vehicle.bx = choice.bx;
      vehicle.bz = choice.bz;
      vehicle.length = length;
      vehicle.traveled = t * length;
      vehicle.toId = choice.edge.to;
      vehicle.highway = choice.edge.highway;
      vehicle.speed = vehicle.cruise;
      vehicle.stopped = 0;
      vehicle.active = true;
      vehicle.mesh.visible = true;
      vehicle.mesh.position.set(x, 0, z);
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
    if (vehicle.kind === "trotro" && vehicle.traveled > vehicle.length * 0.18 && vehicle.traveled < vehicle.length * 0.78 && Math.random() < dt * 0.018) {
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
    const x = vehicle.ax + (vehicle.bx - vehicle.ax) * t;
    const z = vehicle.az + (vehicle.bz - vehicle.az) * t;
    if (this.runtime.collidesBuilding(x, z, 0.9)) {
      this.park(vehicle);
      return;
    }
    vehicle.mesh.position.set(x, 0, z);
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
