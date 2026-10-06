import * as THREE from "three";
import type { AccraWorldRuntime } from "./accra-runtime";
import type { FuelBody } from "./gameplay-actors";
import { chooseRoadside, offsetSide } from "./roadside-placement";
interface Station extends FuelBody {
  id: string;
  poiX: number;
  poiZ: number;
  snapped: boolean;
  brand: string;
}

function stationMesh(brand: string): THREE.Group {
  const group = new THREE.Group();
  group.name = brand;
  group.userData.brand = brand;
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.22, 3.4),
    new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.45 }),
  );
  canopy.position.y = 3.3;
  group.add(canopy);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xced4da, roughness: 0.4, metalness: 0.4 });
  for (const [x, z] of [[-2.1, -1.2], [2.1, -1.2], [-2.1, 1.2], [2.1, 1.2]] as const) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 6), pillarMat);
    pillar.position.set(x, 1.6, z);
    group.add(pillar);
  }
  const pump = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 1.3, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xc92a2a, roughness: 0.5 }),
  );
  pump.position.set(0, 0.7, 0);
  group.add(pump);
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.08, 4),
    new THREE.MeshStandardMaterial({ color: 0xadb5bd, roughness: 0.9 }),
  );
  pad.position.y = 0.04;
  group.add(pad);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.7, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x0b3d2e, roughness: 0.5 }),
  );
  board.position.set(0, 3.85, 0);
  group.add(board);
  return group;
}

/** Cruise burn for a traffic-slowed kilometre should leave about 30–40% in the tank. */
export const CRUISE_FUEL_PER_SECOND = 0.32;
export const BOOST_FUEL_PER_SECOND = 1.05;

export interface FuelAnchor {
  id: string;
  x: number;
  z: number;
  brand: string;
}

/** Stations on the roads a shift actually rides. Real POIs cover UPSA; these fill the gaps. */
export const CORRIDOR_FUEL: FuelAnchor[] = [
  { id: "authored-night-market-fuel", x: 36, z: -28, brand: "GOIL" },
  { id: "authored-okponglo-fuel", x: 280, z: 193, brand: "GOIL" },
  { id: "authored-legon-fuel", x: 629, z: 210, brand: "Total" },
  { id: "authored-post-office-fuel", x: -74, z: -842, brand: "Allied" },
  { id: "authored-upsa-fuel", x: 2070, z: -2053, brand: "Engen" },
];

export function missingFuelAnchors(
  existing: { x: number; z: number }[],
  anchors: FuelAnchor[] = CORRIDOR_FUEL,
  gap = 180,
): FuelAnchor[] {
  return anchors.filter(anchor => existing.every(station => Math.hypot(station.x - anchor.x, station.z - anchor.z) > gap));
}

export class FuelStations {
  private stations: Station[] = [];
  private known = new Set<string>();

  constructor(private runtime: AccraWorldRuntime, private parent: THREE.Group) {}

  start(playerX: number, playerZ: number): void {
    this.sync(playerX, playerZ);
  }

  bodies(): FuelBody[] {
    return this.stations;
  }

  update(playerX: number, playerZ: number): void {
    this.sync(playerX, playerZ);
    for (const station of this.stations) {
      if (!station.snapped && Math.hypot(station.poiX - playerX, station.poiZ - playerZ) < 420) {
        this.snap(station);
      }
      station.mesh.visible = Math.hypot(station.x - playerX, station.z - playerZ) < 380;
    }
  }

  private sync(playerX: number, playerZ: number): void {
    for (const poi of this.runtime.pois) {
      if (poi.tags?.amenity !== "fuel") continue;
      this.add(poi.id, poi.x, poi.z, poi.tags?.name || "Fuel");
    }
    for (const anchor of missingFuelAnchors(this.stations)) {
      this.add(anchor.id, anchor.x, anchor.z, anchor.brand);
    }
    if (this.stations.length === 0) this.add("authored-spawn-fuel", playerX + 40, playerZ - 20, "GOIL");
  }

  private add(id: string, x: number, z: number, brand: string): void {
    if (this.known.has(id)) return;
    this.known.add(id);
    const mesh = stationMesh(brand);
    mesh.position.set(x, 0, z);
    this.parent.add(mesh);
    const station: Station = { id, x, z, poiX: x, poiZ: z, mesh, snapped: false, brand };
    this.snap(station);
    this.stations.push(station);
  }

  private snap(station: Station): void {
    const frame = this.runtime.nearestRoadFrame(station.poiX, station.poiZ, 40);
    if (!frame) return;
    const placed = chooseRoadside({
      nearestFrame: () => frame,
      blocked: (x, z) => !!this.runtime.collidesBuilding(x, z, 0.7),
    }, frame.x, frame.z);
    if (!placed) return;
    const side: 1 | -1 = (placed.x - frame.x) * frame.normalX + (placed.z - frame.z) * frame.normalZ >= 0 ? 1 : -1;
    const shoulder = offsetSide(frame, side, 0.55);
    const visual = offsetSide(frame, side, 3.1);
    station.x = shoulder.x;
    station.z = shoulder.z;
    station.mesh.position.set(visual.x, 0, visual.z);
    station.mesh.rotation.y = Math.atan2(frame.tangentX, frame.tangentZ);
    station.snapped = true;
  }

  dispose(): void {
    for (const station of this.stations) {
      this.parent.remove(station.mesh);
      station.mesh.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach(entry => entry.dispose());
        else material.dispose();
      });
    }
    this.stations.length = 0;
    this.known.clear();
  }
}

export function fuelBrand(station: FuelBody): string {
  const brand = station.mesh.userData.brand;
  return typeof brand === "string" && brand.length > 0 ? brand : "Fuel";
}
