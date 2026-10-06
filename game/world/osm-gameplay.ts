import * as THREE from "three";
import type { AccraWorldRuntime } from "./accra-runtime";
import { ActivePedestrians } from "./active-pedestrians";
import type { CoinBody, FuelBody, Spot, TrafficBody, WalkerBody } from "./gameplay-actors";
import type { KeepClear } from "./hazard-placement";
import { FuelStations } from "./fuel-stations";
import { HazardField } from "./hazards";
import { TrafficSystem } from "./traffic-system";

export class OsmGameplay {
  readonly group = new THREE.Group();
  private traffic: TrafficSystem;
  private pedestrians: ActivePedestrians;
  private hazards: HazardField;
  private fuel: FuelStations;

  constructor(scene: THREE.Scene, private runtime: AccraWorldRuntime, mobile: boolean) {
    this.group.name = "osm-gameplay";
    scene.add(this.group);
    this.traffic = new TrafficSystem(runtime.roadGraph, runtime, this.group, mobile);
    this.pedestrians = new ActivePedestrians(runtime, this.group, mobile);
    this.hazards = new HazardField(runtime, this.group, mobile);
    this.fuel = new FuelStations(runtime, this.group);
  }

  start(x: number, z: number): void {
    this.traffic.start();
    this.pedestrians.start();
    this.hazards.start();
    this.fuel.start(x, z);
    console.info(`Accra gameplay online: traffic pool ready, ${this.fuel.bodies().length} fuel stations`);
  }

  update(dt: number, x: number, z: number, elapsed: number, zones: KeepClear[]): void {
    this.traffic.update(dt, x, z);
    this.pedestrians.update(dt, elapsed, x, z);
    this.fuel.update(x, z);
    const fuelZones = this.fuel.bodies().map(station => ({ x: station.x, z: station.z, r: 16 }));
    this.hazards.update(dt, elapsed, x, z, zones.concat(fuelZones));
  }

  trafficBodies(): TrafficBody[] { return this.traffic.bodies(); }
  walkerBodies(): WalkerBody[] { return this.pedestrians.bodies().concat(this.hazards.goatBodies()); }
  potholes(): Spot[] { return this.hazards.spots().potholes; }
  ramps(): Spot[] { return this.hazards.spots().ramps; }
  coins(): CoinBody[] { return this.hazards.coinBodies(); }
  fuelBodies(): FuelBody[] { return this.fuel.bodies(); }
  resetCoins(): void { this.hazards.resetCoins(); }

  dispose(): void {
    this.traffic.dispose();
    this.pedestrians.dispose();
    this.hazards.dispose();
    this.fuel.dispose();
    this.group.parent?.remove(this.group);
  }
}
