import type * as THREE from "three";

export interface TrafficBody {
  mesh: THREE.Group;
  kind: string;
  stopped: number;
}

export interface WalkerBody {
  mesh: THREE.Group;
  goat?: boolean;
  tumble?: number;
  vx?: number;
  vz?: number;
}

export interface Spot {
  x: number;
  z: number;
  r: number;
}

export interface CoinBody {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  taken: boolean;
  spin: number;
}

export interface FuelBody {
  x: number;
  z: number;
  mesh: THREE.Group;
}
