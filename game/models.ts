import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { buildingTexture, trotroTexture, corrugatedTexture, woodTexture, carPaintTexture } from './textures';

const gltfLoader = new GLTFLoader();
const modelCache = new Map<string, THREE.Group>();
const pendingLoads = new Map<string, Promise<THREE.Group>>();

export function loadModel(path: string): Promise<THREE.Group> {
  const cached = modelCache.get(path);
  if (cached) return Promise.resolve(cached.clone(true));

  const pending = pendingLoads.get(path);
  if (pending) return pending.then((g) => g.clone(true));

  const p = new Promise<THREE.Group>((resolve, reject) => {
    gltfLoader.load(
      path,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        modelCache.set(path, root);
        pendingLoads.delete(path);
        resolve(root.clone(true));
      },
      undefined,
      (err) => {
        console.warn(`Could not load GLB from ${path}, using fallback generator:`, err);
        pendingLoads.delete(path);
        reject(err);
      }
    );
  });

  pendingLoads.set(path, p);
  return p;
}

// Synchronous immediate generators matching the GLB specs for instant zero-latency scene initialization
function pbr(color: number, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function glass(color = 0x2b303a, opacity = 0.75): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.8, transparent: true, opacity });
}

export function createTrotroMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Trotro";

  const bodyMat = pbr(0xf8f9fa, 0.4, 0.2); // White body
  bodyMat.map = trotroTexture();
  const stripeMat = pbr(0x198754, 0.5, 0.1); // Green side stripe
  const yellowMat = pbr(0xfcc419, 0.5, 0.1); // Yellow accent
  const blackMat = pbr(0x212529, 0.8, 0.1);
  const chromeMat = pbr(0xdde1e5, 0.15, 0.9);
  const winMat = glass(0x2b303a, 0.8);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 5.2), bodyMat);
  body.position.y = 1.4;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.9, 0.6), bodyMat);
  nose.position.set(0, 0.95, 2.7);
  nose.castShadow = true;
  g.add(nose);

  const noseCurve = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), bodyMat);
  noseCurve.scale.set(1.0, 0.78, 0.5);
  noseCurve.position.set(0, 1.4, 2.9);
  g.add(noseCurve);

  for (const sx of [-1.16, 1.16]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 4.8), stripeMat);
    s.position.set(sx, 1.15, 0.1);
    const y = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 4.8), yellowMat);
    y.position.set(sx, 0.85, 0.1);
    g.add(s, y);
  }

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.05), winMat);
  windshield.position.set(0, 1.85, 2.5);
  windshield.rotation.x = -0.3;
  g.add(windshield);

  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.08), yellowMat);
  signBoard.position.set(0, 2.25, 2.45);
  g.add(signBoard);

  for (const sx of [-1.16, 1.16]) {
    const sideWins = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.65, 3.8), winMat);
    sideWins.position.set(sx, 1.75, -0.2);
    g.add(sideWins);
  }

  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 3.6), blackMat);
  rack.position.set(0, 2.38, -0.2);
  g.add(rack);

  const parcel1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.9), pbr(0x845ef7, 0.7));
  parcel1.position.set(-0.35, 2.58, 0.2);
  const parcel2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.7), pbr(0xd9480f, 0.8));
  parcel2.position.set(0.4, 2.55, -0.5);
  g.add(parcel1, parcel2);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 0.2), blackMat);
  frontBumper.position.set(0, 0.5, 2.95);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 0.2), blackMat);
  rearBumper.position.set(0, 0.5, -2.65);
  g.add(frontBumper, rearBumper);

  // Brake light
  const brake = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.06), new THREE.MeshBasicMaterial({ color: 0x550000 }));
  brake.position.set(0, 0.9, -2.62);
  brake.name = "brake";
  g.add(brake);

  // Wheels
  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16);
  const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.34, 10);
  const wpos = [[-1.1, 1.6], [1.1, 1.6], [-1.1, -1.6], [1.1, -1.6]];
  for (const [x, z] of wpos) {
    const tire = new THREE.Mesh(tireGeo, blackMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, 0.42, z);
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, 0.42, z);
    g.add(tire, rim);
  }

  return g;
}

export function createTaxiMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "GhanaTaxi";

  const bodyMat = pbr(0x1864ab, 0.35, 0.5);
  bodyMat.map = carPaintTexture('#1864ab');
  const fenderMat = pbr(0xf59f00, 0.4, 0.3); // Bright orange-yellow Accra taxi quarter panels
  const blackMat = pbr(0x1a1a1a, 0.8);
  const chromeMat = pbr(0xe9ecef, 0.1, 0.95);
  const winMat = glass(0x343a40, 0.75);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 4.2), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const frontFender = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.66, 1.1), fenderMat);
  frontFender.position.set(0, 0.75, 1.55);
  const rearFender = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.66, 1.0), fenderMat);
  rearFender.position.set(0, 0.75, -1.6);
  g.add(frontFender, rearFender);

  const noseCurve = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), fenderMat);
  noseCurve.scale.set(0.9, 0.32, 0.5);
  noseCurve.position.set(0, 0.75, 2.1);
  const tailCurve = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), fenderMat);
  tailCurve.scale.set(0.9, 0.32, 0.5);
  tailCurve.position.set(0, 0.75, -2.1);
  g.add(noseCurve, tailCurve);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 2.1), bodyMat);
  cabin.position.set(0, 1.4, -0.15);
  g.add(cabin);

  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.6, 0.05), winMat);
  frontGlass.position.set(0, 1.4, 0.88);
  frontGlass.rotation.x = -0.3;
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.55, 0.05), winMat);
  rearGlass.position.set(0, 1.42, -1.18);
  rearGlass.rotation.x = 0.25;
  g.add(frontGlass, rearGlass);

  const taxiSign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.22), pbr(0xffd43b, 0.3, 0.1));
  taxiSign.position.set(0, 1.82, -0.15);
  g.add(taxiSign);

  const brake = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.06), new THREE.MeshBasicMaterial({ color: 0x550000 }));
  brake.position.set(0, 0.8, -2.12);
  brake.name = "brake";
  g.add(brake);

  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10);
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const t = new THREE.Mesh(tireGeo, blackMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 0.38, z);
    const h = new THREE.Mesh(hubGeo, chromeMat);
    h.rotation.z = Math.PI / 2;
    h.position.set(x, 0.38, z);
    g.add(t, h);
  }

  return g;
}

export function createCarMesh(colorHex = 0xc92a2a): THREE.Group {
  const g = new THREE.Group();
  g.name = "Sedan";

  const paintMat = pbr(colorHex, 0.25, 0.6);
  paintMat.map = carPaintTexture('#' + colorHex.toString(16).padStart(6, '0'));
  const blackMat = pbr(0x111111, 0.8);
  const chromeMat = pbr(0xced4da, 0.1, 0.95);
  const winMat = glass(0x212529, 0.7);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 4.3), paintMat);
  lower.position.y = 0.72;
  lower.castShadow = true; lower.receiveShadow = true;
  g.add(lower);

  const noseCurve = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), paintMat);
  noseCurve.scale.set(0.9, 0.32, 0.5);
  noseCurve.position.set(0, 0.72, 2.15);
  g.add(noseCurve);

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.62, 2.2), paintMat);
  top.position.set(0, 1.34, -0.2);
  g.add(top);

  const frontWin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 0.05), winMat);
  frontWin.position.set(0, 1.34, 0.9);
  frontWin.rotation.x = -0.32;
  g.add(frontWin);

  const brake = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.06), new THREE.MeshBasicMaterial({ color: 0x550000 }));
  brake.position.set(0, 0.8, -2.16);
  brake.name = "brake";
  g.add(brake);

  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16);
  const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.28, 12);
  for (const [x, z] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const t = new THREE.Mesh(tireGeo, blackMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 0.38, z);
    const r = new THREE.Mesh(rimGeo, chromeMat);
    r.rotation.z = Math.PI / 2;
    r.position.set(x, 0.38, z);
    g.add(t, r);
  }

  return g;
}

export function createBusMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Bus";

  const bodyMat = pbr(0xd9480f, 0.4, 0.2);
  const blackMat = pbr(0x212529, 0.8);
  const winMat = glass(0x212529, 0.75);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 7.8), bodyMat);
  body.position.y = 1.6;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.05), winMat);
  frontGlass.position.set(0, 1.9, 3.91);
  g.add(frontGlass);

  const brake = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.06), new THREE.MeshBasicMaterial({ color: 0x550000 }));
  brake.position.set(0, 1.0, -3.92);
  brake.name = "brake";
  g.add(brake);

  const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 16);
  for (const [x, z] of [[-1.15, 2.4], [1.15, 2.4], [-1.15, -2.4], [1.15, -2.4]]) {
    const t = new THREE.Mesh(tireGeo, blackMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 0.48, z);
    g.add(t);
  }

  return g;
}

export function createLegonHallMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "LegonHall";

  const wallMat = pbr(0xf1ece1, 0.85);
  wallMat.map = buildingTexture('#f1ece1', 3, 8);
  const roofMat = pbr(0xa85836, 0.65, 0.1);
  const columnMat = pbr(0xffffff, 0.7);

  const main = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 8), wallMat);
  main.position.y = 3.5;
  main.castShadow = true; main.receiveShadow = true;
  g.add(main);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(10.5, 3.2, 4), roofMat);
  roof.position.y = 8.6;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  const porticoBase = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 2.5), pbr(0xd0c8b8, 0.8));
  porticoBase.position.set(0, 0.3, 4.8);
  g.add(porticoBase);

  const colGeo = new THREE.CylinderGeometry(0.22, 0.26, 5.8, 12);
  for (let i = -3; i <= 3; i += 2) {
    const col = new THREE.Mesh(colGeo, columnMat);
    col.position.set(i * 0.85, 3.2, 5.5);
    col.castShadow = true;
    g.add(col);
  }

  const pediment = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), roofMat);
  pediment.position.set(0, 6.8, 4.8);
  pediment.rotation.y = Math.PI / 4;
  g.add(pediment);

  return g;
}

export function createCompoundHouseMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "CompoundHouse";

  const wallMat = pbr(0xfff3bf, 0.8);
  wallMat.map = buildingTexture('#fff3bf', 3, 5);
  const trimMat = pbr(0x495057, 0.6);
  const gateMat = pbr(0x212529, 0.4, 0.8);

  const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.4, 0.35), trimMat);
  wallFrontL.position.set(-4.6, 1.2, 6);
  const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.4, 0.35), trimMat);
  wallFrontR.position.set(4.6, 1.2, 6);
  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(14, 2.4, 0.35), trimMat);
  wallBack.position.set(0, 1.2, -6);
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 12), trimMat);
  wallL.position.set(-7, 1.2, 0);
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 12), trimMat);
  wallR.position.set(7, 1.2, 0);
  g.add(wallFrontL, wallFrontR, wallBack, wallL, wallR);

  const gate = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, 0.1), gateMat);
  gate.position.set(0, 1.1, 6.0);
  g.add(gate);

  const villa = new THREE.Mesh(new THREE.BoxGeometry(9, 6.2, 8), wallMat);
  villa.position.set(0, 3.1, -0.5);
  villa.castShadow = true; villa.receiveShadow = true;
  g.add(villa);

  const tankTower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), pbr(0x868e96, 0.5, 0.7));
  tankTower.position.set(3.2, 6.9, -3.2);
  const polyTank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.4, 16), pbr(0x1a1a1a, 0.6));
  polyTank.position.set(3.2, 8.2, -3.2);
  g.add(tankTower, polyTank);

  return g;
}

export function createCommercialShopMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "CommercialShop";

  const wallMat = pbr(0xdbe4ff, 0.8);
  wallMat.map = buildingTexture('#dbe4ff', 4, 6);
  const storeTileMat = pbr(0x495057, 0.4);
  const awningMat = pbr(0xc92a2a, 0.75);

  const main = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 7), wallMat);
  main.position.y = 4.0;
  main.castShadow = true; main.receiveShadow = true;
  g.add(main);

  const groundFacade = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.2, 0.2), storeTileMat);
  groundFacade.position.set(0, 1.6, 3.55);
  g.add(groundFacade);

  const awning = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 1.6), awningMat);
  awning.position.set(0, 3.1, 4.2);
  awning.rotation.x = -0.22;
  g.add(awning);

  return g;
}

export function createMarketStallMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "MarketStall";

  const timberMat = pbr(0x6b4226, 0.9);
  timberMat.map = woodTexture();
  const tinRoofMat = pbr(0xadb5bd, 0.5, 0.3);
  tinRoofMat.map = corrugatedTexture('#adb5bd');

  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6);
  for (const [x, z] of [[-1.4, -1.0], [1.4, -1.0], [-1.4, 1.0], [1.4, 1.0]]) {
    const post = new THREE.Mesh(postGeo, timberMat);
    post.position.set(x, 1.3, z);
    post.castShadow = true;
    g.add(post);
  }

  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 2.4), tinRoofMat);
  roof.position.set(0, 2.6, 0);
  roof.rotation.x = -0.15;
  roof.castShadow = true;
  g.add(roof);

  const table = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 1.4), timberMat);
  table.position.set(0, 0.45, 0.2);
  g.add(table);

  return g;
}

export function createChopBarMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "ChopBar";

  const woodMat = pbr(0x6b4226, 0.85);
  woodMat.map = woodTexture();
  const tinMat = pbr(0xb08968, 0.6, 0.2);
  tinMat.map = corrugatedTexture('#b08968');
  const metalMat = pbr(0xced4da, 0.2, 0.8);

  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.8, 6);
  for (const [x, z] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) {
    const p = new THREE.Mesh(postGeo, woodMat);
    p.position.set(x, 1.4, z);
    g.add(p);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 4), tinMat);
  roof.position.y = 3.2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.0), woodMat);
  table.position.set(0, 0.4, 0.3);
  g.add(table);

  const potGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12);
  const pot1 = new THREE.Mesh(potGeo, metalMat);
  pot1.position.set(-1.4, 0.6, -1.0);
  g.add(pot1);

  return g;
}

export function createMoMoKioskMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "MoMoKiosk";

  const mtnYellow = pbr(0xffcc00, 0.45, 0.1);
  const mtnBlue = pbr(0x003366, 0.45, 0.1);
  const grilleMat = pbr(0x212529, 0.6, 0.7);

  const booth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1.8), mtnYellow);
  booth.position.y = 1.2;
  booth.castShadow = true; booth.receiveShadow = true;
  g.add(booth);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.4, 1.84), mtnBlue);
  stripe.position.y = 0.2;
  g.add(stripe);

  const windowOpening = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.1), grilleMat);
  windowOpening.position.set(0, 1.4, 0.91);
  g.add(windowOpening);

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.4), mtnBlue);
  shelf.position.set(0, 0.95, 1.1);
  g.add(shelf);

  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.08), mtnBlue);
  sign.position.set(0, 2.2, 0.92);
  g.add(sign);

  return g;
}

export function createStreetlightMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Streetlight";

  const steelMat = pbr(0x868e96, 0.35, 0.8);
  const lampMat = pbr(0xfff3bf, 0.2, 0.1);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8.5, 10), steelMat);
  pole.position.y = 4.25;
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), steelMat);
  arm.position.set(0.9, 8.4, 0);
  arm.rotation.z = -Math.PI / 3;
  g.add(arm);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), steelMat);
  head.position.set(1.8, 8.7, 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.25), lampMat);
  bulb.position.set(1.8, 8.6, 0);
  bulb.name = "lamp";
  g.add(head, bulb);

  return g;
}

export function createPowerPoleMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "PowerPole";

  const woodMat = pbr(0x5c4033, 0.9);
  const steelMat = pbr(0x343a40, 0.5, 0.8);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9.5, 8), woodMat);
  pole.position.y = 4.75;
  pole.castShadow = true;
  g.add(pole);

  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), woodMat);
  cross1.position.set(0, 9.1, 0);
  g.add(cross1);

  const trans = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), steelMat);
  trans.position.set(0.45, 7.2, 0);
  g.add(trans);

  return g;
}

export function createTrafficLightMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "TrafficLight";

  const poleMat = pbr(0x343a40, 0.5, 0.8);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8), poleMat);
  pole.position.y = 3.25;
  pole.castShadow = true;
  g.add(pole);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 8), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(1.75, 6.2, 0);
  g.add(arm);

  const house = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.35), poleMat);
  house.position.set(3.2, 5.8, 0);
  g.add(house);

  return g;
}

export function createRoadBarrierMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "RoadBarrier";

  const concMat = pbr(0xadb5bd, 0.85);
  const redMat = pbr(0xe03131, 0.6);

  const barrier = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.6), concMat);
  barrier.position.y = 0.45;
  barrier.castShadow = true; barrier.receiveShadow = true;
  g.add(barrier);

  for (const x of [-0.8, 0, 0.8]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.62), redMat);
    stripe.position.set(x, 0.45, 0);
    g.add(stripe);
  }

  return g;
}

export function createPalmTreeMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "PalmTree";

  const trunkMat = pbr(0x795548, 0.9);
  const frondMat = pbr(0x2f9e44, 0.65);
  const cocoMat = pbr(0x4e342e, 0.8);

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.2, 2.5, 0.1),
    new THREE.Vector3(0.6, 5.0, 0.3),
    new THREE.Vector3(0.8, 7.2, 0.4),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 10, 0.22, 8, false);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.castShadow = true;
  g.add(trunk);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), cocoMat);
    coco.position.set(0.8 + Math.cos(a) * 0.25, 6.9, 0.4 + Math.sin(a) * 0.25);
    g.add(coco);
  }

  const frondGeo = new THREE.ConeGeometry(0.5, 3.2, 5);
  frondGeo.translate(0, 1.6, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.position.set(0.8, 7.2, 0.4);
    frond.rotation.y = a;
    frond.rotation.z = Math.PI / 3.2;
    frond.castShadow = true;
    g.add(frond);
  }

  return g;
}

export function createShadeTreeMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "ShadeTree";

  const barkMat = pbr(0x4a2e18, 0.9);
  const leafMat = pbr(0x2b8a3e, 0.7);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.5, 8), barkMat);
  trunk.position.y = 1.75;
  trunk.castShadow = true;
  g.add(trunk);

  const foliageCenters = [
    [0, 4.4, 0, 2.4],
    [-1.2, 4.0, 0.6, 1.8],
    [1.3, 4.2, -0.5, 1.9],
    [0.4, 4.8, 1.1, 1.7],
    [-0.5, 5.2, -0.8, 1.6],
    [0, 6.0, 0, 1.5],
  ];

  for (const [x, y, z, s] of foliageCenters) {
    const fol = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leafMat);
    fol.position.set(x, y, z);
    fol.castShadow = true;
    g.add(fol);
  }

  return g;
}

export function createGoatMesh(): THREE.Group {
  const g = new THREE.Group();
  g.name = "Goat";

  const furMat = pbr(0xe9ecef, 0.85);
  const brownMat = pbr(0x795548, 0.85);
  const hornMat = pbr(0x495057, 0.5, 0.2);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), furMat);
  body.scale.set(1.5, 0.85, 0.75);
  body.position.y = 0.5;
  body.castShadow = true;
  g.add(body);

  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), brownMat);
  patch.position.set(0.1, 0.65, 0.1);
  g.add(patch);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 6), furMat);
  neck.position.set(0.48, 0.68, 0);
  neck.rotation.z = -0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), furMat);
  head.scale.set(1.3, 1.0, 0.85);
  head.position.set(0.62, 0.82, 0);
  g.add(neck, head);

  const hornGeo = new THREE.CylinderGeometry(0.015, 0.03, 0.22, 5);
  for (const sz of [-0.07, 0.07]) {
    const horn = new THREE.Mesh(hornGeo, hornMat);
    horn.position.set(0.55, 0.98, sz);
    horn.rotation.z = -0.5;
    horn.rotation.x = sz * 1.5;
    g.add(horn);
  }

  const legGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.45, 6);
  for (const [lx, lz] of [[-0.3, -0.16], [-0.3, 0.16], [0.3, -0.16], [0.3, 0.16]]) {
    const leg = new THREE.Mesh(legGeo, furMat);
    leg.position.set(lx, 0.22, lz);
    g.add(leg);
  }

  return g;
}

export function clearModelCache() {
  modelCache.forEach((m) => {
    m.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
        else child.material.dispose();
      }
    });
  });
  modelCache.clear();
  pendingLoads.clear();
}
