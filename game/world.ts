import * as THREE from "three";
import {
  signMesh,
  ghanaFlagTexture,
  nightMarketTexture,
  textTexture,
  asphaltTexture,
  concreteTexture,
  grassTexture,
  buildingTexture,
  corrugatedTexture,
  woodTexture,
  sidewalkTexture,
  curbTexture,
  lateriteShoulderTexture,
  zebraTexture,
  drainGutterTexture,
  vendorUmbrellaTexture,
} from "./textures";
import {
  createTrotroMesh,
  createTaxiMesh,
  createCarMesh,
  createBusMesh,
  createLegonHallMesh,
  createCompoundHouseMesh,
  createCommercialShopMesh,
  createMarketStallMesh,
  createChopBarMesh,
  createMoMoKioskMesh,
  createStreetlightMesh,
  createPowerPoleMesh,
  createTrafficLightMesh,
  createRoadBarrierMesh,
  createPalmTreeMesh,
  createShadeTreeMesh,
  createGoatMesh,
} from "./models";
import { buildHumanoid, animateWalk, animateIdle, SKIN_TONES, HumanoidRig, HairStyle } from "./characters";

export interface TrafficCar {
  mesh: THREE.Group;
  dist: number; // distance along loop
  speed: number;
  loop: THREE.Vector3[];
  segLengths: number[];
  loopLength: number;
  color: number;
  kind: string;
  stopped: number;
  wheels: THREE.Object3D[];
}

export interface Ped {
  mesh: THREE.Group;
  cx: number;
  cz: number;
  r: number;
  a: number;
  speed: number;
  goat?: boolean;
  rig?: HumanoidRig;
  seed?: number;
  walking?: boolean;
  faceY?: number;
  tumble?: number;
  vx?: number;
  vz?: number;
}

export interface Coin {
  mesh: THREE.Mesh;
  x: number;
  z: number;
  taken: boolean;
  spin: number;
}

export interface WorldCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  name: string;
}

export interface World {
  group: THREE.Group;
  traffic: TrafficCar[];
  peds: Ped[];
  potholes: { x: number; z: number; r: number }[];
  ramps: { x: number; z: number; r: number }[];
  coins: Coin[];
  fuelStations: { x: number; z: number; mesh: THREE.Group }[];
  lamps: THREE.Mesh[];
  flags: THREE.Mesh[];
  colliders: WorldCollider[];
  headlight: THREE.SpotLight;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Color;
  pickupMarker: THREE.Group;
  dropMarker: THREE.Group;
  arrowHelper: THREE.Group;
  setMarkers(pickup: { x: number; z: number } | null, drop: { x: number; z: number } | null, stage: string): void;
  update(dt: number, elapsed: number, night: number, playerX?: number, playerZ?: number): void;
}

const NM_YELLOW = 0xf2e35c;

function pbr(color: number, roughness = 0.7, metalness = 0.0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function pbrMapped(map: THREE.Texture, roughness = 0.7, metalness = 0.0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map, roughness, metalness });
}

function ringMarker(color: number): THREE.Group {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.08;
  g.add(ring);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 28, 20, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 14;
  g.add(beam);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(3.6, 4.4, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.07;
  halo.name = "halo";
  g.add(halo);
  return g;
}

const HAIR_STYLES: HairStyle[] = ["afro", "short", "wrap", "cap", "bald"];

function createFuelStationMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "FuelStation";

  // Canopy / roof
  const canopyMat = pbr(0xffffff, 0.4, 0.3);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(8, 0.3, 5), canopyMat);
  canopy.position.y = 4.5;
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  g.add(canopy);

  // Support pillars
  const pillarMat = pbr(0xcccccc, 0.3, 0.7);
  for (const [px, pz] of [[-3.2, -1.8], [3.2, -1.8], [-3.2, 1.8], [3.2, 1.8]]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 4.5, 8), pillarMat);
    pillar.position.set(px, 2.25, pz);
    pillar.castShadow = true;
    g.add(pillar);
  }

  // Fuel pumps (2 pumps)
  const pumpMat = pbr(0xcc0000, 0.5, 0.2);
  for (const px of [-1.5, 1.5]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.5), pumpMat);
    pump.position.set(px, 0.8, 0);
    pump.castShadow = true;
    g.add(pump);
    // Pump screen
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.02), pbr(0x111111, 0.3));
    screen.position.set(px, 1.2, 0.26);
    g.add(screen);
    // Nozzle hose
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), pbr(0x111111, 0.8));
    hose.position.set(px + 0.3, 0.6, 0.2);
    hose.rotation.z = -0.8;
    g.add(hose);
  }

  // Concrete base pad
  const pad = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 6), pbr(0x999999, 0.85, 0.05));
  pad.position.y = 0.075;
  pad.receiveShadow = true;
  g.add(pad);

  // Brand sign ("GOIL" style — Ghana's main fuel brand)
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(5, 1.2, 0.15), pbr(0x003399, 0.4, 0.1));
  signBoard.position.set(0, 5.2, 0);
  g.add(signBoard);
  
  // "FUEL" text on sign
  const signText = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 1.0),
    new THREE.MeshBasicMaterial({ 
      map: textTexture("⛽ GOIL FUEL STATION", { bg: "#003399", fg: "#ffcc00", w: 512, h: 128, font: 46 }),
      transparent: true 
    })
  );
  signText.position.set(0, 5.2, 0.09);
  g.add(signText);

  // Small light on canopy
  const light = new THREE.Mesh(new THREE.BoxGeometry(3, 0.08, 0.3), new THREE.MeshStandardMaterial({ 
    color: 0xffffee, roughness: 0.1, emissive: 0xffffcc, emissiveIntensity: 0.3 
  }));
  light.position.set(0, 4.33, 0);
  g.add(light);

  // Refuel zone ring marker on ground
  const refuelRing = new THREE.Mesh(
    new THREE.RingGeometry(1.8, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xff922b, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
  );
  refuelRing.rotation.x = -Math.PI / 2;
  refuelRing.position.set(0, 0.16, 0);
  g.add(refuelRing);

  return g;
}

export function buildWorld(scene: THREE.Scene, mobile = false): World {
  const group = new THREE.Group();
  scene.add(group);

  const colliders: WorldCollider[] = [];

  function addCollider(cx: number, cz: number, hw: number, hd: number, name: string) {
    colliders.push({
      minX: cx - hw,
      maxX: cx + hw,
      minZ: cz - hd,
      maxZ: cz + hd,
      name,
    });
  }

  // --- 1. LIGHTING SETUP (Warm Golden Accra Sunlight) ---
  const hemi = new THREE.HemisphereLight(0xcde1f8, 0x8a6d48, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffeedd, 2.4);
  sun.position.set(70, 95, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 240;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x404040, 0.45);
  scene.add(ambient);

  // --- 2. GROUND & TERRAIN LAYERS ---
  // Base lush grass & terrain
  const groundGeo = new THREE.PlaneGeometry(440, 440, 16, 16);
  const groundMat = pbrMapped(grassTexture(), 0.9, 0);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Red laterite soil road shoulders along roads
  const shoulderMat = pbrMapped(lateriteShoulderTexture(), 0.92, 0);
  function addShoulder(w: number, d: number, x: number, z: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shoulderMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.005, z);
    m.receiveShadow = true;
    group.add(m);
  }
  // Shoulders flanking major avenues
  addShoulder(210, 26, 0, 0);
  addShoulder(26, 210, 0, 0);
  addShoulder(145, 20, 0, -60);
  addShoulder(145, 20, 0, 60);
  addShoulder(20, 145, -60, 0);
  addShoulder(20, 145, 60, 0);

  // --- 3. MODULAR ROAD NETWORK ---
  const roadMat = pbrMapped(asphaltTexture(), 0.85, 0.05);

  function createRoad(w: number, d: number, x: number, z: number) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    group.add(m);
  }

  // Primary Dual-Carriageway Arterials (12m wide)
  createRoad(196, 12, 0, 0);
  createRoad(12, 196, 0, 0);

  // Secondary Connector Roads (9m wide)
  createRoad(136, 9, 0, -60);
  createRoad(136, 9, 0, 60);
  createRoad(9, 136, -60, 0);
  createRoad(9, 136, 60, 0);

  // --- 4. 3D RAISED CONCRETE CURBS & SIDEWALKS ---
  const curbM = pbrMapped(curbTexture(), 0.75, 0.1);
  const sideM = pbrMapped(sidewalkTexture(), 0.8, 0.05);

  function addSidewalkAndCurb(w: number, d: number, x: number, z: number, curbSide: "x" | "z", curbOffset: number) {
    // Raised Sidewalk (+0.14m high)
    const walk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), sideM);
    walk.position.set(x, 0.07, z);
    walk.receiveShadow = true;
    walk.castShadow = true;
    group.add(walk);

    // Beveled Curb Edge facing the road
    const curbW = curbSide === "z" ? w : 0.22;
    const curbD = curbSide === "z" ? 0.22 : d;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(curbW, 0.16, curbD), curbM);
    curb.position.set(curbSide === "z" ? x : x + curbOffset, 0.08, curbSide === "z" ? z + curbOffset : z);
    curb.receiveShadow = true;
    group.add(curb);
  }

  // Sidewalks along Main East-West Highway (Z = +/- 7.5)
  addSidewalkAndCurb(196, 2.8, 0, 7.8, "z", -1.45);
  addSidewalkAndCurb(196, 2.8, 0, -7.8, "z", 1.45);

  // Sidewalks along Main North-South Highway (X = +/- 7.5)
  addSidewalkAndCurb(2.8, 196, 7.8, 0, "x", -1.45);
  addSidewalkAndCurb(2.8, 196, -7.8, 0, "x", 1.45);

  // Sidewalks along ring roads
  addSidewalkAndCurb(136, 2.2, 0, -53.8, "z", -1.15);
  addSidewalkAndCurb(136, 2.2, 0, -66.2, "z", 1.15);
  addSidewalkAndCurb(136, 2.2, 0, 53.8, "z", 1.15);
  addSidewalkAndCurb(136, 2.2, 0, 66.2, "z", -1.15);

  addSidewalkAndCurb(2.2, 136, -53.8, 0, "x", -1.15);
  addSidewalkAndCurb(2.2, 136, -66.2, 0, "x", 1.15);
  addSidewalkAndCurb(2.2, 136, 53.8, 0, "x", 1.15);
  addSidewalkAndCurb(2.2, 136, 66.2, 0, "x", -1.15);

  // --- 5. OPEN DRAINAGE GUTTERS (Accra roadside storm drains) ---
  const gutterMat = pbrMapped(drainGutterTexture(), 0.9, 0);
  function addDrainGutter(w: number, d: number, x: number, z: number) {
    const drain = new THREE.Mesh(new THREE.PlaneGeometry(w, d), gutterMat);
    drain.rotation.x = -Math.PI / 2;
    drain.position.set(x, 0.015, z);
    group.add(drain);
  }
  // Gutters running parallel outside sidewalks
  addDrainGutter(196, 0.9, 0, 9.6);
  addDrainGutter(196, 0.9, 0, -9.6);
  addDrainGutter(0.9, 196, 9.6, 0);
  addDrainGutter(0.9, 196, -9.6, 0);

  // Culvert bridges across gutters (concrete access slabs to shops/compounds)
  const culvertMat = pbrMapped(concreteTexture(), 0.8, 0);
  for (let pos = -80; pos <= 80; pos += 20) {
    if (Math.abs(pos) < 14) continue;
    const cNorth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.4), culvertMat);
    cNorth.position.set(pos, 0.07, 9.6);
    const cSouth = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 1.4), culvertMat);
    cSouth.position.set(pos, 0.07, -9.6);
    group.add(cNorth, cSouth);
  }

  // --- 6. ROAD MARKINGS & ZEBRA CROSSINGS ---
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.35, metalness: 0.1 });
  const doubleYellowMat = new THREE.MeshStandardMaterial({ color: 0xfcc419, roughness: 0.35, metalness: 0.1 });

  // Central Double Yellow Lines (continuous divide)
  for (let x = -90; x <= 90; x += 6) {
    if (Math.abs(x) < 8) continue;
    for (const z of [0.12, -0.12]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.14), doubleYellowMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.035, z);
      group.add(line);
    }
  }
  for (let z = -90; z <= 90; z += 6) {
    if (Math.abs(z) < 8) continue;
    for (const x of [0.12, -0.12]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 5.2), doubleYellowMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.035, z);
      group.add(line);
    }
  }

  // White Dashed Lane Dividers (Outer lanes)
  for (let x = -88; x <= 88; x += 5) {
    if (Math.abs(x) < 10) continue;
    for (const z of [3.0, -3.0]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.22), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.035, z);
      group.add(d);
    }
  }
  for (let z = -88; z <= 88; z += 5) {
    if (Math.abs(z) < 10) continue;
    for (const x of [3.0, -3.0]) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.4), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.035, z);
      group.add(d);
    }
  }

  // Pedestrian Zebra Crossings at Central Crossroads
  const zebraMat = pbrMapped(zebraTexture(), 0.65, 0.05);
  function addZebraCrossing(x: number, z: number, ry = 0) {
    const zCross = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 11.6), zebraMat);
    zCross.rotation.x = -Math.PI / 2;
    zCross.rotation.z = ry;
    zCross.position.set(x, 0.038, z);
    group.add(zCross);
  }
  addZebraCrossing(-8.8, 0, 0);
  addZebraCrossing(8.8, 0, 0);
  addZebraCrossing(0, -8.8, Math.PI / 2);
  addZebraCrossing(0, 8.8, Math.PI / 2);

  // Stop lines before crossings
  const stopMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  for (const [x, z, w, d] of [
    [-11.5, 3.0, 0.5, 5.5],
    [11.5, -3.0, 0.5, 5.5],
    [-3.0, -11.5, 5.5, 0.5],
    [3.0, 11.5, 5.5, 0.5],
  ] as const) {
    const sl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stopMat);
    sl.rotation.x = -Math.PI / 2;
    sl.position.set(x, 0.039, z);
    group.add(sl);
  }

  // --- 7. TRAFFIC LIGHTS AT MAIN INTERSECTION ---
  const tlNW = createTrafficLightMesh();
  tlNW.position.set(-7.5, 0, 7.5);
  tlNW.rotation.y = -Math.PI / 2;
  const tlSE = createTrafficLightMesh();
  tlSE.position.set(7.5, 0, -7.5);
  tlSE.rotation.y = Math.PI / 2;
  group.add(tlNW, tlSE);

  // --- 8. SPEED RAMPS (Speed humps with black & yellow chevrons) ---
  const ramps = [
    { x: 0, z: -28, r: 4.2 },
    { x: 28, z: 0, r: 4.2 },
    { x: 0, z: 36, r: 4.2 },
    { x: -34, z: 0, r: 4.2 },
  ];
  for (const r of ramps) {
    const isEW = r.z === 0;
    const rampBody = new THREE.Mesh(
      new THREE.BoxGeometry(isEW ? 3.2 : 11.5, 0.38, isEW ? 11.5 : 3.2),
      pbr(0xfcc419, 0.4, 0.1) // Bright yellow base
    );
    rampBody.position.set(r.x, 0.19, r.z);
    rampBody.receiveShadow = true;
    group.add(rampBody);

    // Black Chevron Stripes
    for (let s = -4.5; s <= 4.5; s += 1.8) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(isEW ? 0.9 : 0.8, isEW ? 0.8 : 0.9),
        pbr(0x111111, 0.6, 0)
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(r.x + (isEW ? 0 : s), 0.39, r.z + (isEW ? s : 0));
      group.add(stripe);
    }
  }

  // --- 9. POTHOLES ---
  const potholes = [
    { x: 14, z: 2.8, r: 1.1 },
    { x: -22, z: -2.4, r: 1.25 },
    { x: 2.6, z: 22, r: 1.15 },
    { x: -2.8, z: -38, r: 1.35 },
    { x: 44, z: 1.8, r: 1.2 },
    { x: -48, z: -2.2, r: 1.25 },
    { x: 2.2, z: 54, r: 1.15 },
    { x: -2.0, z: -58, r: 1.1 },
    { x: 62, z: -2.4, r: 1.25 },
    { x: -62, z: 3.2, r: 1.2 },
  ];
  const potMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.98, metalness: 0 });
  for (const p of potholes) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 16), potMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.038, p.z);
    group.add(m);
  }

  // --- 10. ZONE-SPECIFIC ACCRA BUILDINGS & ARCHITECTURE ---
  // A. QUADRANT 1 (NORTH-WEST: LEGON CAMPUS)
  const legonHall1 = createLegonHallMesh();
  legonHall1.position.set(-42, 0, -36);
  legonHall1.rotation.y = 0.2;
  group.add(legonHall1);
  addCollider(-42, -36, 7.5, 4.5, "Legon Hall");

  const legonHall2 = createLegonHallMesh();
  legonHall2.position.set(-62, 0, -30);
  legonHall2.rotation.y = -0.15;
  group.add(legonHall2);
  addCollider(-62, -30, 7.5, 4.5, "Legon Annex");

  // Legon Avenue Palms (Lined academic boulevard)
  for (let i = -6; i <= 6; i++) {
    const palm = createPalmTreeMesh();
    palm.position.set(-22 + i * 6.5, 0, -11.5);
    palm.scale.setScalar(0.95 + Math.random() * 0.15);
    group.add(palm);
  }

  // Campus Arch Signboard
  const campusSign = signMesh("UNIVERSITY OF GHANA · LEGON", 12, "#18325a");
  campusSign.position.set(-28, 5.2, -12);
  group.add(campusSign);

  // B. QUADRANT 2 (NORTH-EAST: UPSA CAMPUS & COMMERCE)
  const upsaBlock1 = createCommercialShopMesh();
  upsaBlock1.position.set(38, 0, -36);
  group.add(upsaBlock1);
  addCollider(38, -36, 4.5, 4.0, "UPSA Commercial Block");

  const upsaBlock2 = createCommercialShopMesh();
  upsaBlock2.position.set(56, 0, -32);
  upsaBlock2.rotation.y = -0.2;
  group.add(upsaBlock2);
  addCollider(56, -32, 4.5, 4.0, "UPSA Shops");

  // MTN Mobile Money Kiosk near UPSA
  const momo1 = createMoMoKioskMesh();
  momo1.position.set(22, 0, -11.5);
  momo1.rotation.y = Math.PI;
  group.add(momo1);
  addCollider(22, -11.5, 1.2, 1.2, "MTN MoMo Kiosk");

  // Provision shop sign
  const provSign = signMesh("PROVISION SHOP & MOMO", 6.5, "#e67700");
  provSign.position.set(40, 4.8, -12);
  group.add(provSign);

  // C. QUADRANT 3 (SOUTH-EAST: EAST LEGON RESIDENTIAL & DINING)
  const villa1 = createCompoundHouseMesh();
  villa1.position.set(38, 0, 38);
  group.add(villa1);
  addCollider(38, 38, 7.5, 6.5, "East Legon Villa 1");

  const villa2 = createCompoundHouseMesh();
  villa2.position.set(58, 0, 46);
  villa2.rotation.y = -0.3;
  group.add(villa2);
  addCollider(58, 46, 7.5, 6.5, "East Legon Villa 2");

  const villa3 = createCompoundHouseMesh();
  villa3.position.set(34, 0, 58);
  villa3.rotation.y = 0.25;
  group.add(villa3);
  addCollider(34, 58, 7.5, 6.5, "East Legon Villa 3");

  // East Legon Restaurant & Nightlife
  const restBlock = createCommercialShopMesh();
  restBlock.position.set(46, 0, 22);
  restBlock.rotation.y = Math.PI;
  group.add(restBlock);
  addCollider(46, 22, 4.5, 4.0, "Papaye Restaurant");

  const restSign = signMesh("PAPAYE FAST FOOD", 7, "#c92a2a", "#ffd43b");
  restSign.position.set(46, 5.2, 18);
  group.add(restSign);

  // D. QUADRANT 4 (SOUTH-WEST: MADINA MARKET & CHOP BARS)
  // Madina Market Stalls & Chop Bars
  for (let i = 0; i < 6; i++) {
    const stall = createMarketStallMesh();
    stall.position.set(-36 - (i % 3) * 12, 0, 28 + Math.floor(i / 3) * 16);
    stall.rotation.y = (Math.random() - 0.5) * 0.3;
    group.add(stall);
    addCollider(stall.position.x, stall.position.z, 2.0, 1.6, `Market Stall ${i + 1}`);
  }

  // Authentic Roadside Chop Bar ("Osikan Chop Bar")
  const chopBar = createChopBarMesh();
  chopBar.position.set(-24, 0, 22);
  chopBar.rotation.y = Math.PI;
  group.add(chopBar);
  addCollider(-24, 22, 2.5, 2.0, "Osikan Chop Bar");

  const chopSign = signMesh("OSIKAN CHOP BAR · FUFU", 7, "#e8590c");
  chopSign.position.set(-24, 4.8, 18);
  group.add(chopSign);

  // MTN MoMo Kiosk in Madina Market
  const momo2 = createMoMoKioskMesh();
  momo2.position.set(-20, 0, 11.5);
  group.add(momo2);
  addCollider(-20, 11.5, 1.2, 1.2, "Madina MoMo Kiosk");

  // Colorful Vendor Umbrellas around market
  const umbMat = pbrMapped(vendorUmbrellaTexture(), 0.6, 0);
  for (let i = 0; i < 5; i++) {
    const umbGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), pbr(0x555555, 0.4));
    pole.position.y = 1.2;
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.6, 0.6, 8), umbMat);
    canopy.position.y = 2.4;
    canopy.castShadow = true;
    umbGroup.add(pole, canopy);
    umbGroup.position.set(-30 - i * 7, 0, 14 + (i % 2) * 4);
    group.add(umbGroup);
  }

  // --- 11. OVERHEAD UTILITY POLES & SAG WIRE CABLES ---
  const lineMat = new THREE.LineBasicMaterial({ color: 0x111111 });
  let prevPoleTop1: THREE.Vector3 | null = null;
  let prevPoleTop2: THREE.Vector3 | null = null;

  for (let x = -84; x <= 84; x += 24) {
    // North side utility poles
    const poleN = createPowerPoleMesh();
    poleN.position.set(x, 0, 11.8);
    group.add(poleN);
    addCollider(x, 11.8, 0.4, 0.4, "Utility Pole");

    const topN = new THREE.Vector3(x, 9.2, 11.8);
    if (prevPoleTop1) {
      // Sagging power cable curve
      const midN = new THREE.Vector3((prevPoleTop1.x + topN.x) / 2, 8.4, 11.8);
      const curveN = new THREE.QuadraticBezierCurve3(prevPoleTop1, midN, topN);
      const geoN = new THREE.BufferGeometry().setFromPoints(curveN.getPoints(12));
      group.add(new THREE.Line(geoN, lineMat));
    }
    prevPoleTop1 = topN;

    // South side utility poles
    const poleS = createPowerPoleMesh();
    poleS.position.set(x, 0, -11.8);
    poleS.rotation.y = Math.PI;
    group.add(poleS);
    addCollider(x, -11.8, 0.4, 0.4, "Utility Pole");

    const topS = new THREE.Vector3(x, 9.2, -11.8);
    if (prevPoleTop2) {
      const midS = new THREE.Vector3((prevPoleTop2.x + topS.x) / 2, 8.4, -11.8);
      const curveS = new THREE.QuadraticBezierCurve3(prevPoleTop2, midS, topS);
      const geoS = new THREE.BufferGeometry().setFromPoints(curveS.getPoints(12));
      group.add(new THREE.Line(geoS, lineMat));
    }
    prevPoleTop2 = topS;
  }

  // --- 12. HIGHWAY STREETLIGHTS (Emissive Lamps at Night) ---
  const lamps: THREE.Mesh[] = [];
  for (let i = -72; i <= 72; i += 24) {
    if (Math.abs(i) < 14) continue;
    // East-West Arterial Streetlights
    const sl1 = createStreetlightMesh();
    sl1.position.set(i, 0, 8.2);
    group.add(sl1);
    const bulb1 = sl1.getObjectByName("lamp") as THREE.Mesh | undefined;
    if (bulb1) lamps.push(bulb1);

    const sl2 = createStreetlightMesh();
    sl2.position.set(i, 0, -8.2);
    sl2.rotation.y = Math.PI;
    group.add(sl2);
    const bulb2 = sl2.getObjectByName("lamp") as THREE.Mesh | undefined;
    if (bulb2) lamps.push(bulb2);
  }

  // --- 13. ROAD BARRIERS & BILLBOARDS ---
  for (const [bx, bz, bry] of [
    [10.5, 16, 0],
    [-10.5, -16, 0],
    [16, -10.5, Math.PI / 2],
    [-16, 10.5, Math.PI / 2],
  ] as const) {
    const barrier = createRoadBarrierMesh();
    barrier.position.set(bx, 0, bz);
    barrier.rotation.y = bry;
    group.add(barrier);
  }

  // Official Night Market Billboards
  const brand = nightMarketTexture();
  function addBillboard(x: number, z: number, ry: number) {
    const bg = new THREE.Group();
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 9, 8), pbr(0x555555, 0.4, 0.6));
    legs.position.y = 4.5;
    bg.add(legs);

    // Frame & Backing
    const frame = new THREE.Mesh(new THREE.BoxGeometry(11, 5.8, 0.3), pbr(0x212529, 0.5, 0.3));
    frame.position.set(0, 10.2, 0);
    bg.add(frame);

    const matB = brand
      ? new THREE.MeshBasicMaterial({ map: brand })
      : new THREE.MeshBasicMaterial({ map: textTexture("NIGHT MARKET GHANA · DELIVER ACCRA", { bg: "#0b0b0c", fg: "#f2e35c" }) });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 5.2), matB);
    board.position.set(0, 10.2, 0.16);
    bg.add(board);

    bg.position.set(x, 0, z);
    bg.rotation.y = ry;
    group.add(bg);
  }
  addBillboard(-16, -72, 0);
  addBillboard(72, 16, -Math.PI / 2);

  // --- FUEL STATIONS ---
  const fuelStations: { x: number; z: number; mesh: THREE.Group }[] = [];
  const fuelPositions = [
    { x: 25, z: 8, ry: 0 },          // near center, east side
    { x: -25, z: -8, ry: Math.PI },   // near center, west side  
    { x: 62, z: 55, ry: -Math.PI/2 }, // East Legon area
    { x: -62, z: -55, ry: Math.PI/2 },// Legon area
  ];
  for (const fp of fuelPositions) {
    const station = createFuelStationMesh();
    station.position.set(fp.x, 0, fp.z);
    station.rotation.y = fp.ry;
    group.add(station);
    fuelStations.push({ x: fp.x, z: fp.z, mesh: station });
    // Narrow pump island collider only — allows rider to drive under canopy to refuel freely
    addCollider(fp.x, fp.z, 1.2, 0.4, "Fuel Pump");
  }

  // --- 14. GHANA NATIONAL FLAGS ---
  const flagTex = ghanaFlagTexture();
  const flags: THREE.Mesh[] = [];
  for (const [x, z] of [[-26, -64], [26, 64], [-64, 26], [64, -26]] as const) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 8), pbr(0xcccccc, 0.2, 0.8));
    pole.position.set(x, 3.75, z);
    pole.castShadow = true;
    group.add(pole);

    const f = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 1.5, 8, 4),
      new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.7, metalness: 0 })
    );
    f.position.set(x + 1.25, 6.6, z);
    f.name = "flag";
    group.add(f);
    flags.push(f);
  }

  // --- 15. TROPICAL VEGETATION (Dense palms & shade trees) ---
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  for (let i = 0; i < (mobile ? 45 : 75); i++) {
    const x = rand(-92, 92);
    const z = rand(-92, 92);
    // Don't spawn on roads or sidewalks
    if (Math.abs(x) < 11 || Math.abs(z) < 11) continue;
    if (Math.abs(Math.abs(x) - 60) < 8 || Math.abs(Math.abs(z) - 60) < 8) continue;

    const isPalm = Math.random() < 0.45;
    const tree = isPalm ? createPalmTreeMesh() : createShadeTreeMesh();
    tree.position.set(x, 0, z);
    tree.scale.setScalar(rand(0.8, 1.3));
    group.add(tree);
  }

  // --- 16. VEHICLES & TRAFFIC SIMULATION ---
  const traffic: TrafficCar[] = [];
  const carColors = [0x1a5fb4, 0xc01c28, 0xe5e5e5, 0x26a0a7, 0xe86a10, 0x2f9e44, 0x343a40];

  const loopDefs: { pts: THREE.Vector3[]; kinds: string[]; n: number; speed: number }[] = [
    {
      pts: [
        new THREE.Vector3(-85, 0, 3.2),
        new THREE.Vector3(85, 0, 3.2),
        new THREE.Vector3(85, 0, -3.2),
        new THREE.Vector3(-85, 0, -3.2),
      ],
      kinds: ["trotro", "taxi", "car"],
      n: 6,
      speed: 9.5,
    },
    {
      pts: [
        new THREE.Vector3(3.2, 0, -85),
        new THREE.Vector3(3.2, 0, 85),
        new THREE.Vector3(-3.2, 0, 85),
        new THREE.Vector3(-3.2, 0, -85),
      ],
      kinds: ["bus", "trotro", "taxi", "car"],
      n: 6,
      speed: 8.8,
    },
    {
      pts: [
        new THREE.Vector3(-60, 0, -57.2),
        new THREE.Vector3(60, 0, -57.2),
        new THREE.Vector3(60, 0, -62.8),
        new THREE.Vector3(-60, 0, -62.8),
      ],
      kinds: ["taxi", "car"],
      n: 2,
      speed: 10.5,
    },
    {
      pts: [
        new THREE.Vector3(-57.2, 0, -60),
        new THREE.Vector3(-57.2, 0, 60),
        new THREE.Vector3(-62.8, 0, 60),
        new THREE.Vector3(-62.8, 0, -60),
      ],
      kinds: ["trotro", "car"],
      n: 2,
      speed: 8.0,
    },
  ];

  for (const ldef of loopDefs) {
    // Precalculate segment lengths & total loop length for smooth distance-based motion
    const pts = ldef.pts;
    const segLengths: number[] = [];
    let loopLength = 0;
    for (let k = 0; k < pts.length; k++) {
      const p1 = pts[k];
      const p2 = pts[(k + 1) % pts.length];
      const d = p1.distanceTo(p2);
      segLengths.push(d);
      loopLength += d;
    }

    for (let i = 0; i < ldef.n; i++) {
      const kind = ldef.kinds[i % ldef.kinds.length];
      let mesh: THREE.Group;
      if (kind === "trotro") mesh = createTrotroMesh();
      else if (kind === "taxi") mesh = createTaxiMesh();
      else if (kind === "bus") mesh = createBusMesh();
      else mesh = createCarMesh(carColors[(i + traffic.length) % carColors.length]);

      group.add(mesh);

      // Collect rotating wheels
      const wheels: THREE.Object3D[] = [];
      mesh.traverse((c) => {
        if (c instanceof THREE.Mesh && c.geometry instanceof THREE.CylinderGeometry && c.name !== "lamp") {
          wheels.push(c);
        }
      });

      const initialDist = (i / ldef.n) * loopLength;
      traffic.push({
        mesh,
        dist: initialDist,
        speed: ldef.speed * (0.9 + Math.random() * 0.25),
        loop: pts,
        segLengths,
        loopLength,
        color: 0xffffff,
        kind,
        stopped: 0,
        wheels,
      });
    }
  }

  // --- 17. PEDESTRIANS & GOATS ---
  const peds: Ped[] = [];
  const shirtCs = [0xe67700, 0x1971c2, 0xd6336c, 0x2f9e44, 0xf2e35c, 0xe9ecef];
  const pantsCs = [0x343a40, 0x1971c2, 0x2b2b2b, 0x5a3a1a];
  const pedCount = mobile ? 12 : 22;

  for (let i = 0; i < pedCount; i++) {
    const cx = (Math.random() - 0.5) * 130;
    const cz = (Math.random() - 0.5) * 130;
    if (Math.abs(cx) < 9 && Math.abs(cz) < 9) continue;

    const rig = buildHumanoid({
      skin: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
      shirt: shirtCs[i % shirtCs.length],
      pants: pantsCs[Math.floor(Math.random() * pantsCs.length)],
      shoes: [0x2a1a0a, 0x1a1a1a, 0x5a3a1a][Math.floor(Math.random() * 3)],
      hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)],
      capColor: [0xd6336c, 0x1971c2, 0xf2e35c, 0x2f9e44][Math.floor(Math.random() * 4)],
      scale: 0.93 + Math.random() * 0.12,
      bulk: 0.9 + Math.random() * 0.2,
      feminine: Math.random() < 0.4,
      longSleeves: Math.random() < 0.3,
      shorts: Math.random() < 0.3,
      detail: mobile ? "simple" : "full",
    });
    rig.group.position.set(cx, 0.14, cz);
    group.add(rig.group);
    peds.push({
      mesh: rig.group,
      rig,
      cx,
      cz,
      r: 3 + Math.random() * 6,
      a: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.8,
      seed: Math.random() * 10,
      walking: true,
    });
  }

  // Roaming Ghanaian Goats
  for (let i = 0; i < 4; i++) {
    const cx = (Math.random() - 0.5) * 80;
    const cz = (Math.random() - 0.5) * 80;
    const goat = createGoatMesh();
    goat.position.set(cx, 0, cz);
    group.add(goat);
    peds.push({
      mesh: goat,
      cx,
      cz,
      r: 4 + Math.random() * 5,
      a: Math.random() * Math.PI * 2,
      speed: 0.75,
      goat: true,
    });
  }

  // --- 18. NIGHT MARKET GOLDEN COINS ---
  const coins: Coin[] = [];
  const coinGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.16, 24);
  const coinMat = new THREE.MeshStandardMaterial({
    color: NM_YELLOW,
    roughness: 0.2,
    metalness: 0.85,
    emissive: 0x997700,
    emissiveIntensity: 0.25,
  });
  for (let i = 0; i < 16; i++) {
    const onXRoad = i % 2 === 0;
    const m = new THREE.Mesh(coinGeo, coinMat);
    const x = onXRoad ? -75 + i * 10 : (i % 4 < 2 ? 3.4 : -3.4);
    const z = onXRoad ? (i % 4 < 2 ? 3.4 : -3.4) : -75 + i * 10;
    m.position.set(x, 1.1, z);
    m.rotation.x = Math.PI / 2;
    group.add(m);
    coins.push({ mesh: m, x, z, taken: false, spin: Math.random() * 6 });
  }

  // --- 19. PICKUP / DROPOFF DELIVERY PADS ---
  const pickupMarker = ringMarker(0xf2e35c);
  const dropMarker = ringMarker(0x51cf66);
  pickupMarker.visible = false;
  dropMarker.visible = false;
  group.add(pickupMarker, dropMarker);

  const arrowHelper = new THREE.Group();
  group.add(arrowHelper);

  const sky = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.0075);

  function setMarkers(
    pickup: { x: number; z: number } | null,
    drop: { x: number; z: number } | null,
    stage: string
  ) {
    pickupMarker.visible = !!pickup && (stage === "toPickup" || stage === "offer");
    dropMarker.visible = !!drop && stage === "toDropoff";
    if (pickup) pickupMarker.position.set(pickup.x, 0, pickup.z);
    if (drop) dropMarker.position.set(drop.x, 0, drop.z);
  }

  const _carPos = new THREE.Vector3();
  const _carDir = new THREE.Vector3();

  // Smooth, distance-normalized traffic navigation (fixes the corner crawl bug!)
  function moveLoopCar(c: TrafficCar, dt: number, playerX?: number, playerZ?: number) {
    if (c.stopped > 0) {
      c.stopped -= dt;
      return;
    }
    // Trotro random passenger stop
    if (c.kind === "trotro" && Math.random() < dt * 0.05) {
      c.stopped = 2.5;
      return;
    }

    // Dynamic speed based on player proximity
    let effectiveSpeed = c.speed;
    if (playerX !== undefined && playerZ !== undefined) {
      const toPlayerX = playerX - c.mesh.position.x;
      const toPlayerZ = playerZ - c.mesh.position.z;
      const distToPlayer = Math.sqrt(toPlayerX * toPlayerX + toPlayerZ * toPlayerZ);
      
      if (distToPlayer < 18 && distToPlayer > 2) {
        const fwdX = Math.sin(c.mesh.rotation.y);
        const fwdZ = Math.cos(c.mesh.rotation.y);
        const dot = (toPlayerX * fwdX + toPlayerZ * fwdZ) / distToPlayer;
        
        if (dot > 0.4) {
          effectiveSpeed *= Math.max(0.1, distToPlayer / 18);
        }
      }
    }

    c.dist = (c.dist + effectiveSpeed * dt) % c.loopLength;

    // Find which segment c.dist falls into
    let accumulated = 0;
    let segIdx = 0;
    let segT = 0;
    for (let k = 0; k < c.segLengths.length; k++) {
      const len = c.segLengths[k];
      if (accumulated + len >= c.dist) {
        segIdx = k;
        segT = (c.dist - accumulated) / len;
        break;
      }
      accumulated += len;
    }

    const nextIdx = (segIdx + 1) % c.loop.length;
    const pA = c.loop[segIdx];
    const pB = c.loop[nextIdx];

    _carPos.lerpVectors(pA, pB, segT);
    c.mesh.position.set(_carPos.x, 0, _carPos.z);

    _carDir.subVectors(pB, pA).normalize();
    c.mesh.rotation.y = Math.atan2(_carDir.x, _carDir.z);

    // Rotate wheels
    for (const w of c.wheels) {
      w.rotation.x += effectiveSpeed * dt * 2.2;
    }

    const brake = c.mesh.getObjectByName("brake") as THREE.Mesh | undefined;
    if (brake) {
      const isBraking = c.stopped > 0 || effectiveSpeed < c.speed * 0.6;
      (brake.material as THREE.MeshBasicMaterial).color.setHex(isBraking ? 0xff0000 : 0x550000);
    }
  }

  function update(dt: number, elapsed: number, night: number, playerX?: number, playerZ?: number) {
    for (const c of traffic) moveLoopCar(c, dt, playerX, playerZ);

    for (const p of peds) {
      if (p.tumble && p.tumble > 0) {
        p.tumble -= dt;
        p.mesh.position.x += (p.vx || 0) * dt;
        p.mesh.position.z += (p.vz || 0) * dt;
        p.vx = (p.vx || 0) * Math.max(0, 1 - dt * 3.2);
        p.vz = (p.vz || 0) * Math.max(0, 1 - dt * 3.2);
        p.mesh.rotation.z = Math.min(Math.PI / 2, p.mesh.rotation.z + dt * 10);
        if (p.tumble <= 0) {
          p.mesh.rotation.z = 0;
          p.mesh.position.y = p.goat ? 0 : 0.14;
          p.cx = p.mesh.position.x;
          p.cz = p.mesh.position.z;
        }
        continue;
      }

      if (p.goat) {
        if (playerX !== undefined && playerZ !== undefined) {
          const pedDx = playerX - p.mesh.position.x;
          const pedDz = playerZ - p.mesh.position.z;
          const pedDist = Math.sqrt(pedDx * pedDx + pedDz * pedDz);
          if (pedDist < 10 && pedDist > 1) {
            const fleeX = -pedDx / pedDist;
            const fleeZ = -pedDz / pedDist;
            const fleeSpeed = (1 - pedDist / 10) * 3.0;
            p.mesh.position.x += fleeX * fleeSpeed * dt;
            p.mesh.position.z += fleeZ * fleeSpeed * dt;
            p.mesh.rotation.y = Math.atan2(fleeX, fleeZ);
            p.cx += fleeX * fleeSpeed * dt * 0.3;
            p.cz += fleeZ * fleeSpeed * dt * 0.3;
            continue;
          }
        }
        p.a += dt * p.speed * 0.3;
        p.mesh.position.x = p.cx + Math.cos(p.a) * p.r;
        p.mesh.position.z = p.cz + Math.sin(p.a) * p.r;
        p.mesh.rotation.y = -p.a;
        continue;
      }
      if (p.walking !== false && p.r > 0) {
        if (playerX !== undefined && playerZ !== undefined) {
          const pedDx = playerX - p.mesh.position.x;
          const pedDz = playerZ - p.mesh.position.z;
          const pedDist = Math.sqrt(pedDx * pedDx + pedDz * pedDz);
          if (pedDist < 8 && pedDist > 1) {
            const fleeX = -pedDx / pedDist;
            const fleeZ = -pedDz / pedDist;
            const fleeSpeed = (1 - pedDist / 8) * 3.5;
            p.mesh.position.x += fleeX * fleeSpeed * dt;
            p.mesh.position.z += fleeZ * fleeSpeed * dt;
            p.mesh.rotation.y = Math.atan2(fleeX, fleeZ);
            p.cx += fleeX * fleeSpeed * dt * 0.3;
            p.cz += fleeZ * fleeSpeed * dt * 0.3;
            if (p.rig) animateWalk(p.rig, elapsed + (p.seed ?? 0), 6 + fleeSpeed * 2);
            continue;
          }
        }
        p.a += dt * p.speed * 0.25;
        p.mesh.position.x = p.cx + Math.cos(p.a) * p.r;
        p.mesh.position.z = p.cz + Math.sin(p.a) * p.r;
        p.mesh.rotation.y = -p.a;
        if (p.rig) animateWalk(p.rig, elapsed + (p.seed ?? 0), 3.2 + p.speed * 2.5);
      } else if (p.rig) {
        if (p.faceY !== undefined) p.mesh.rotation.y = p.faceY;
        animateIdle(p.rig, elapsed, p.seed ?? 0);
      }
    }

    for (const cn of coins) {
      if (cn.taken) continue;
      cn.spin += dt * 2.5;
      cn.mesh.rotation.z = cn.spin;
      cn.mesh.position.y = 1.1 + Math.sin(elapsed * 2 + cn.spin) * 0.16;
    }

    const haloP = pickupMarker.getObjectByName("halo") as THREE.Mesh | undefined;
    if (haloP) {
      const s = 1 + Math.sin(elapsed * 3) * 0.08;
      haloP.scale.set(s, s, 1);
    }
    const haloD = dropMarker.getObjectByName("halo") as THREE.Mesh | undefined;
    if (haloD) {
      const s = 1 + Math.cos(elapsed * 3) * 0.08;
      haloD.scale.set(s, s, 1);
    }

    for (const f of flags) {
      f.rotation.y = Math.sin(elapsed * 2.4 + f.position.x) * 0.28;
    }

    // Street lamps emissive glow at night
    if (night > 0.35) {
      for (const lamp of lamps) {
        (lamp.material as THREE.MeshStandardMaterial).color.setHex(0xffe066);
        (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(0xffdd44);
        (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
      }
    } else {
      for (const lamp of lamps) {
        (lamp.material as THREE.MeshStandardMaterial).color.setHex(0x888888);
        (lamp.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
        (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      }
    }
  }

  return {
    group,
    traffic,
    peds,
    potholes,
    ramps,
    coins,
    fuelStations,
    lamps,
    flags,
    colliders,
    headlight: null as unknown as THREE.SpotLight,
    sun,
    hemi,
    sky,
    pickupMarker,
    dropMarker,
    arrowHelper,
    setMarkers,
    update,
  };
}
