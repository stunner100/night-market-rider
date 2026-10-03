import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Polyfill FileReader for Node.js
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(buf => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

const exporter = new GLTFExporter();

function exportGLB(object, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    exporter.parse(
      object,
      (glb) => {
        fs.writeFileSync(destPath, Buffer.from(glb));
        console.log(`Saved ${destPath} (${(fs.statSync(destPath).size / 1024).toFixed(1)} KB)`);
        resolve();
      },
      (err) => reject(err),
      { binary: true }
    );
  });
}

// Material helpers
function mat(color, roughness = 0.6, metalness = 0.1) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function glassMat(color = 0x88c0d0, opacity = 0.65) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.1,
    metalness: 0.8,
    transparent: true,
    opacity,
  });
}

// --- 1. TROTRO (Ghanaian Minibus) ---
function buildTrotro() {
  const g = new THREE.Group();
  g.name = 'Trotro';

  const bodyMat = mat(0xf8f9fa, 0.4, 0.2); // White body
  const stripeMat = mat(0x198754, 0.5, 0.1); // Green side stripe
  const yellowMat = mat(0xfcc419, 0.5, 0.1); // Yellow accent
  const blackMat = mat(0x212529, 0.8, 0.1);
  const chromeMat = mat(0xdde1e5, 0.15, 0.9);
  const winMat = glassMat(0x2b303a, 0.8);

  // Main Van Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.8, 5.2), bodyMat);
  body.position.y = 1.4;
  g.add(body);

  // Raked front nose
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.9, 0.6), bodyMat);
  nose.position.set(0, 0.95, 2.7);
  g.add(nose);

  // Green side stripe
  const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 4.8), stripeMat);
  stripeL.position.set(-1.16, 1.15, 0.1);
  const stripeR = stripeL.clone();
  stripeR.position.x = 1.16;
  g.add(stripeL, stripeR);

  // Yellow lower trim
  const yellowL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 4.8), yellowMat);
  yellowL.position.set(-1.16, 0.85, 0.1);
  const yellowR = yellowL.clone();
  yellowR.position.x = 1.16;
  g.add(yellowL, yellowR);

  // Windshield
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.8, 0.05), winMat);
  windshield.position.set(0, 1.85, 2.5);
  windshield.rotation.x = -0.3;
  g.add(windshield);

  // Destination Board above windshield ("ACCRA - MADINA")
  const signBoard = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.08), yellowMat);
  signBoard.position.set(0, 2.25, 2.45);
  g.add(signBoard);

  // Side Passenger Windows
  for (const sx of [-1.16, 1.16]) {
    const sideWins = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.65, 3.8), winMat);
    sideWins.position.set(sx, 1.75, -0.2);
    g.add(sideWins);
  }

  // Rear window
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 0.05), winMat);
  rearWin.position.set(0, 1.75, -2.61);
  g.add(rearWin);

  // Roof Luggage Rack
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 3.6), blackMat);
  rack.position.set(0, 2.38, -0.2);
  g.add(rack);
  // Luggage parcels on roof
  const parcel1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.9), mat(0x845ef7, 0.7));
  parcel1.position.set(-0.35, 2.58, 0.2);
  const parcel2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.7), mat(0xd9480f, 0.8));
  parcel2.position.set(0.4, 2.55, -0.5);
  g.add(parcel1, parcel2);

  // Bumpers
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 0.2), blackMat);
  frontBumper.position.set(0, 0.5, 2.95);
  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 0.2), blackMat);
  rearBumper.position.set(0, 0.5, -2.65);
  g.add(frontBumper, rearBumper);

  // Front Grille & Headlights
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.05), blackMat);
  grille.position.set(0, 0.75, 2.96);
  g.add(grille);

  for (const sx of [-0.85, 0.85]) {
    const hl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 12), mat(0xfff9db, 0.2, 0.8));
    hl.rotation.x = Math.PI / 2;
    hl.position.set(sx, 0.85, 2.96);
    g.add(hl);
  }

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

// --- 2. GHANA TAXI ---
function buildTaxi() {
  const g = new THREE.Group();
  g.name = 'GhanaTaxi';

  const bodyMat = mat(0x1864ab, 0.35, 0.5); // Rich blue main body
  const fenderMat = mat(0xf59f00, 0.4, 0.3); // Bright orange-yellow fenders (Accra taxi signature!)
  const blackMat = mat(0x1a1a1a, 0.8);
  const chromeMat = mat(0xe9ecef, 0.1, 0.95);
  const winMat = glassMat(0x343a40, 0.75);

  // Central chassis
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 4.2), bodyMat);
  body.position.y = 0.75;
  g.add(body);

  // Orange-Yellow Front and Rear Fenders
  const frontFender = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.66, 1.1), fenderMat);
  frontFender.position.set(0, 0.75, 1.55);
  const rearFender = new THREE.Mesh(new THREE.BoxGeometry(1.87, 0.66, 1.0), fenderMat);
  rearFender.position.set(0, 0.75, -1.6);
  g.add(frontFender, rearFender);

  // Passenger Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 2.1), bodyMat);
  cabin.position.set(0, 1.4, -0.15);
  g.add(cabin);

  // Windshields
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.6, 0.05), winMat);
  frontGlass.position.set(0, 1.4, 0.88);
  frontGlass.rotation.x = -0.3;
  const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.55, 0.05), winMat);
  rearGlass.position.set(0, 1.42, -1.18);
  rearGlass.rotation.x = 0.25;
  g.add(frontGlass, rearGlass);

  // Side Windows
  for (const sx of [-0.81, 0.81]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 1.8), winMat);
    sideGlass.position.set(sx, 1.38, -0.15);
    g.add(sideGlass);
  }

  // Roof TAXI sign
  const taxiSign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.22), mat(0xffd43b, 0.3, 0.1));
  taxiSign.position.set(0, 1.82, -0.15);
  g.add(taxiSign);

  // Bumpers
  const fBump = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.15), blackMat);
  fBump.position.set(0, 0.45, 2.15);
  const rBump = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.15), blackMat);
  rBump.position.set(0, 0.45, -2.15);
  g.add(fBump, rBump);

  // Wheels
  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 10);
  const wpos = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
  for (const [x, z] of wpos) {
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

// --- 3. PRIVATE SEDAN ---
function buildSedan(colorHex = 0xc92a2a) {
  const g = new THREE.Group();
  g.name = 'Sedan';

  const paintMat = mat(colorHex, 0.25, 0.6);
  const blackMat = mat(0x111111, 0.8);
  const chromeMat = mat(0xced4da, 0.1, 0.95);
  const winMat = glassMat(0x212529, 0.7);

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.65, 4.3), paintMat);
  lower.position.y = 0.72;
  g.add(lower);

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.62, 2.2), paintMat);
  top.position.set(0, 1.34, -0.2);
  g.add(top);

  const frontWin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.58, 0.05), winMat);
  frontWin.position.set(0, 1.34, 0.9);
  frontWin.rotation.x = -0.32;
  const rearWin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.52, 0.05), winMat);
  rearWin.position.set(0, 1.36, -1.28);
  rearWin.rotation.x = 0.3;
  g.add(frontWin, rearWin);

  for (const sx of [-0.78, 0.78]) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 1.9), winMat);
    sw.position.set(sx, 1.32, -0.2);
    g.add(sw);
  }

  // Wheels
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

// --- 4. LEGON HALL (University Academic Building) ---
function buildLegonHall() {
  const g = new THREE.Group();
  g.name = 'LegonHall';

  const wallMat = mat(0xf1ece1, 0.85); // Cream campus plaster
  const roofMat = mat(0xa85836, 0.65, 0.1); // Terracotta clay tile
  const columnMat = mat(0xffffff, 0.7);
  const winMat = glassMat(0x1e3a5f, 0.7);
  const woodMat = mat(0x5c3d2e, 0.75);

  // Main 2-story Hall Body
  const main = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 8), wallMat);
  main.position.y = 3.5;
  g.add(main);

  // Pitched Hip Roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(10.5, 3.2, 4), roofMat);
  roof.position.y = 8.6;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  // Entrance Portico / Colonnade
  const porticoBase = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 2.5), mat(0xd0c8b8, 0.8));
  porticoBase.position.set(0, 0.3, 4.8);
  g.add(porticoBase);

  // 4 Columns
  const colGeo = new THREE.CylinderGeometry(0.22, 0.26, 5.8, 12);
  for (let i = -3; i <= 3; i += 2) {
    const col = new THREE.Mesh(colGeo, columnMat);
    col.position.set(i * 0.85, 3.2, 5.5);
    g.add(col);
  }

  // Pediment / Triangular Gable over Portico
  const pediment = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.8, 4), roofMat);
  pediment.position.set(0, 6.8, 4.8);
  pediment.rotation.y = Math.PI / 4;
  g.add(pediment);

  // Grand Entrance Doors
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.6, 0.2), woodMat);
  door.position.set(0, 2.1, 4.05);
  g.add(door);

  // Window Grid
  for (let r = 0; r < 2; r++) {
    for (let c = -2; c <= 2; c++) {
      if (r === 0 && Math.abs(c) <= 1) continue; // Skip behind portico door
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.1), winMat);
      win.position.set(c * 2.4, 2.2 + r * 3.0, 4.05);
      g.add(win);
    }
  }

  return g;
}

// --- 5. EAST LEGON COMPOUND VILLA ---
function buildCompoundHouse() {
  const g = new THREE.Group();
  g.name = 'CompoundHouse';

  const wallMat = mat(0xfff3bf, 0.8); // Modern pale pastel
  const trimMat = mat(0x495057, 0.6);
  const gateMat = mat(0x212529, 0.4, 0.8); // Black security gate
  const roofMat = mat(0x343a40, 0.6);
  const winMat = glassMat(0x1864ab, 0.7);

  // Perimeter Compound Wall (Accra security wall)
  const wallGeo = new THREE.BoxGeometry(14, 2.4, 0.35);
  const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.4, 0.35), trimMat);
  wallFrontL.position.set(-4.6, 1.2, 6);
  const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.4, 0.35), trimMat);
  wallFrontR.position.set(4.6, 1.2, 6);
  const wallBack = new THREE.Mesh(wallGeo, trimMat);
  wallBack.position.set(0, 1.2, -6);
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 12), trimMat);
  wallL.position.set(-7, 1.2, 0);
  const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 12), trimMat);
  wallR.position.set(7, 1.2, 0);
  g.add(wallFrontL, wallFrontR, wallBack, wallL, wallR);

  // Security Gate
  const gate = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.2, 0.1), gateMat);
  gate.position.set(0, 1.1, 6.0);
  g.add(gate);

  // Main 2-story House inside compound
  const villa = new THREE.Mesh(new THREE.BoxGeometry(9, 6.2, 8), wallMat);
  villa.position.set(0, 3.1, -0.5);
  g.add(villa);

  // Cantilever Balcony
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 1.6), trimMat);
  balcony.position.set(0, 3.4, 3.8);
  const balustrade = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.9, 0.08), gateMat);
  balustrade.position.set(0, 4.0, 4.5);
  g.add(balcony, balustrade);

  // Windows with dark tint
  for (let r = 0; r < 2; r++) {
    for (const sx of [-2.4, 2.4]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.1), winMat);
      win.position.set(sx, 1.8 + r * 2.8, 3.52);
      g.add(win);
    }
  }

  // Black PolyTank (Water Tank) on rooftop tower (Iconic Accra detail!)
  const tankTower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.2), mat(0x868e96, 0.5, 0.7));
  tankTower.position.set(3.2, 6.9, -3.2);
  const polyTank = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.4, 16), mat(0x1a1a1a, 0.6));
  polyTank.position.set(3.2, 8.2, -3.2);
  g.add(tankTower, polyTank);

  // External AC unit on wall
  const ac = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.35), mat(0xf1f3f5, 0.5));
  ac.position.set(4.6, 4.2, 0.5);
  g.add(ac);

  return g;
}

// --- 6. COMMERCIAL SHOP / STOREFRONT ---
function buildCommercialShop() {
  const g = new THREE.Group();
  g.name = 'CommercialShop';

  const wallMat = mat(0xdbe4ff, 0.8);
  const storeTileMat = mat(0x495057, 0.4);
  const awningMat = mat(0xc92a2a, 0.75);
  const winMat = glassMat(0x82c91e, 0.6);

  const main = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 7), wallMat);
  main.position.y = 4.0;
  g.add(main);

  // Ground Floor Shop Entrance
  const groundFacade = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.2, 0.2), storeTileMat);
  groundFacade.position.set(0, 1.6, 3.55);
  g.add(groundFacade);

  // Shop Display Windows
  const shopWin1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 0.1), winMat);
  shopWin1.position.set(-1.8, 1.6, 3.66);
  const shopWin2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 0.1), winMat);
  shopWin2.position.set(1.8, 1.6, 3.66);
  g.add(shopWin1, shopWin2);

  // Striped Awning
  const awning = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 1.6), awningMat);
  awning.position.set(0, 3.1, 4.2);
  awning.rotation.x = -0.22;
  g.add(awning);

  // Signboard above awning
  const sign = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 0.1), mat(0xffd43b, 0.5));
  sign.position.set(0, 3.8, 3.6);
  g.add(sign);

  return g;
}

// --- 7. MARKET STALL (Madina Market Style) ---
function buildMarketStall() {
  const g = new THREE.Group();
  g.name = 'MarketStall';

  const timberMat = mat(0x6b4226, 0.9);
  const tinRoofMat = mat(0xadb5bd, 0.5, 0.3); // Weathered galvanized corrugated sheet
  const crateMat = mat(0xc67d3b, 0.85);

  // Wooden corner posts
  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6);
  for (const [x, z] of [[-1.4, -1.0], [1.4, -1.0], [-1.4, 1.0], [1.4, 1.0]]) {
    const post = new THREE.Mesh(postGeo, timberMat);
    post.position.set(x, 1.3, z);
    g.add(post);
  }

  // Angled Corrugated Tin Roof
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 2.4), tinRoofMat);
  roof.position.set(0, 2.6, 0);
  roof.rotation.x = -0.15;
  g.add(roof);

  // Front Display Table Counter
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.9, 1.4), timberMat);
  table.position.set(0, 0.45, 0.2);
  g.add(table);

  // Produce Crates on table
  const crate1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.5), crateMat);
  crate1.position.set(-0.8, 1.05, 0.2);
  const crate2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.5), mat(0xe8590c, 0.8)); // Oranges
  crate2.position.set(0.1, 1.05, 0.2);
  const crate3 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.5), mat(0x74b816, 0.8)); // Plantains
  crate3.position.set(0.9, 1.05, 0.2);
  g.add(crate1, crate2, crate3);

  return g;
}

// --- 8. MTN MOBILE MONEY (MoMo) KIOSK ---
function buildMoMoKiosk() {
  const g = new THREE.Group();
  g.name = 'MoMoKiosk';

  const mtnYellow = mat(0xffcc00, 0.45, 0.1); // Authentic MTN Bright Yellow
  const mtnBlue = mat(0x003366, 0.45, 0.1);
  const grilleMat = mat(0x212529, 0.6, 0.7);

  // Yellow Kiosk Box
  const booth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1.8), mtnYellow);
  booth.position.y = 1.2;
  g.add(booth);

  // Blue Bottom Stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.4, 1.84), mtnBlue);
  stripe.position.y = 0.2;
  g.add(stripe);

  // Service Counter Opening with Security Grille
  const windowOpening = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.1), grilleMat);
  windowOpening.position.set(0, 1.4, 0.91);
  g.add(windowOpening);

  // Front Service Shelf
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.4), mtnBlue);
  shelf.position.set(0, 0.95, 1.1);
  g.add(shelf);

  // Header Signboard ("MTN MoMo")
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.08), mtnBlue);
  sign.position.set(0, 2.2, 0.92);
  g.add(sign);

  return g;
}

// --- 9. HIGHWAY STREETLIGHT ---
function buildStreetlight() {
  const g = new THREE.Group();
  g.name = 'Streetlight';

  const steelMat = mat(0x868e96, 0.35, 0.8);
  const lampMat = mat(0xfff3bf, 0.2, 0.1);

  // Vertical pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8.5, 10), steelMat);
  pole.position.y = 4.25;
  g.add(pole);

  // Arched mast outreach arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), steelMat);
  arm.position.set(0.9, 8.4, 0);
  arm.rotation.z = -Math.PI / 3;
  g.add(arm);

  // Luminaire fixture head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.35), steelMat);
  head.position.set(1.8, 8.7, 0);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 0.25), lampMat);
  bulb.position.set(1.8, 8.6, 0);
  g.add(head, bulb);

  return g;
}

// --- 10. WOODEN POWER UTILITY POLE ---
function buildPowerPole() {
  const g = new THREE.Group();
  g.name = 'PowerPole';

  const woodMat = mat(0x5c4033, 0.9);
  const steelMat = mat(0x343a40, 0.5, 0.8);

  // Main Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 9.5, 8), woodMat);
  pole.position.y = 4.75;
  g.add(pole);

  // Horizontal Crossbars
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.12), woodMat);
  cross1.position.set(0, 9.1, 0);
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.12), woodMat);
  cross2.position.set(0, 8.2, 0);
  g.add(cross1, cross2);

  // Insulators
  const insGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6);
  for (const x of [-1.0, -0.4, 0.4, 1.0]) {
    const ins = new THREE.Mesh(insGeo, steelMat);
    ins.position.set(x, 9.25, 0);
    g.add(ins);
  }

  // Cylindrical Transformer Canister
  const trans = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 10), steelMat);
  trans.position.set(0.45, 7.2, 0);
  g.add(trans);

  return g;
}

// --- 11. TROPICAL COCONUT PALM TREE ---
function buildPalmTree() {
  const g = new THREE.Group();
  g.name = 'PalmTree';

  const trunkMat = mat(0x795548, 0.9);
  const frondMat = mat(0x2f9e44, 0.65);
  const cocoMat = mat(0x4e342e, 0.8);

  // Curved Trunk
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.2, 2.5, 0.1),
    new THREE.Vector3(0.6, 5.0, 0.3),
    new THREE.Vector3(0.8, 7.2, 0.4),
  ]);
  const trunkGeo = new THREE.TubeGeometry(curve, 10, 0.22, 8, false);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  g.add(trunk);

  // Coconuts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const coco = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), cocoMat);
    coco.position.set(0.8 + Math.cos(a) * 0.25, 6.9, 0.4 + Math.sin(a) * 0.25);
    g.add(coco);
  }

  // Palm Fronds (Curved fans)
  const frondGeo = new THREE.ConeGeometry(0.5, 3.2, 5);
  frondGeo.translate(0, 1.6, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const frond = new THREE.Mesh(frondGeo, frondMat);
    frond.position.set(0.8, 7.2, 0.4);
    frond.rotation.y = a;
    frond.rotation.z = Math.PI / 3.2;
    g.add(frond);
  }

  return g;
}

// --- 12. TROPICAL SHADE TREE (Neem / Mango) ---
function buildShadeTree() {
  const g = new THREE.Group();
  g.name = 'ShadeTree';

  const barkMat = mat(0x4a2e18, 0.9);
  const leafMat = mat(0x2b8a3e, 0.7);

  // Main Trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.5, 8), barkMat);
  trunk.position.y = 1.75;
  g.add(trunk);

  // Layered Volumetric Foliage Canopy (Low-poly faceted clusters)
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
    g.add(fol);
  }

  return g;
}

// --- 13. ROAD BARRIER & BOLLARDS ---
function buildRoadBarrier() {
  const g = new THREE.Group();
  g.name = 'RoadBarrier';

  const concMat = mat(0xadb5bd, 0.85);
  const redMat = mat(0xe03131, 0.6);

  // Concrete Jersey barrier
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.9, 0.6), concMat);
  barrier.position.y = 0.45;
  g.add(barrier);

  // Red reflective stripes
  for (const x of [-0.8, 0, 0.8]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.8, 0.62), redMat);
    stripe.position.set(x, 0.45, 0);
    g.add(stripe);
  }

  return g;
}

// --- 14. TRAFFIC LIGHT ---
function buildTrafficLight() {
  const g = new THREE.Group();
  g.name = 'TrafficLight';

  const poleMat = mat(0x343a40, 0.5, 0.8);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8), poleMat);
  pole.position.y = 3.25;
  g.add(pole);

  // Horizontal arm
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 8), poleMat);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(1.75, 6.2, 0);
  g.add(arm);

  // Signal Housing
  const house = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.35), poleMat);
  house.position.set(3.2, 5.8, 0);
  g.add(house);

  // Red, Yellow, Green Lenses
  const lensRed = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0xff0000, 0.2, 0.1));
  lensRed.position.set(3.2, 6.2, 0.18);
  const lensYel = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0xffcc00, 0.2, 0.1));
  lensYel.position.set(3.2, 5.8, 0.18);
  const lensGrn = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), mat(0x00cc44, 0.2, 0.1));
  lensGrn.position.set(3.2, 5.4, 0.18);
  g.add(lensRed, lensYel, lensGrn);

  return g;
}

// --- 15. GHANA BUS ---
function buildBus() {
  const g = new THREE.Group();
  g.name = 'Bus';

  const bodyMat = mat(0xd9480f, 0.4, 0.2); // Warm orange transit bus
  const blackMat = mat(0x212529, 0.8);
  const winMat = glassMat(0x212529, 0.75);
  const chromeMat = mat(0xdde1e5, 0.15, 0.9);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.3, 7.8), bodyMat);
  body.position.y = 1.6;
  g.add(body);

  // Large Panoramic Windshield
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.05), winMat);
  frontGlass.position.set(0, 1.9, 3.91);
  g.add(frontGlass);

  // Destination screen
  const destScreen = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.06), mat(0x111111, 0.4));
  destScreen.position.set(0, 2.58, 3.91);
  g.add(destScreen);

  // Side Passenger Window Bands
  for (const sx of [-1.21, 1.21]) {
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.85, 6.8), winMat);
    sideGlass.position.set(sx, 1.9, -0.2);
    g.add(sideGlass);
  }

  // Bumpers
  const fBump = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.35, 0.2), blackMat);
  fBump.position.set(0, 0.55, 3.95);
  const rBump = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.35, 0.2), blackMat);
  rBump.position.set(0, 0.55, -3.95);
  g.add(fBump, rBump);

  // Dual wheels
  const tireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.34, 16);
  const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.36, 10);
  for (const [x, z] of [[-1.15, 2.4], [1.15, 2.4], [-1.15, -2.4], [1.15, -2.4]]) {
    const t = new THREE.Mesh(tireGeo, blackMat);
    t.rotation.z = Math.PI / 2;
    t.position.set(x, 0.48, z);
    const r = new THREE.Mesh(rimGeo, chromeMat);
    r.rotation.z = Math.PI / 2;
    r.position.set(x, 0.48, z);
    g.add(t, r);
  }

  return g;
}

// --- 16. TRADITIONAL ACCRA CHOP BAR ---
function buildChopBar() {
  const g = new THREE.Group();
  g.name = 'ChopBar';

  const woodMat = mat(0x6b4226, 0.85);
  const tinMat = mat(0xb08968, 0.6, 0.2); // Rusted tin
  const metalMat = mat(0xced4da, 0.2, 0.8);

  // Timber post frame
  const postGeo = new THREE.CylinderGeometry(0.09, 0.09, 2.8, 6);
  for (const [x, z] of [[-2.2, -1.6], [2.2, -1.6], [-2.2, 1.6], [2.2, 1.6]]) {
    const p = new THREE.Mesh(postGeo, woodMat);
    p.position.set(x, 1.4, z);
    g.add(p);
  }

  // Pitch corrugated roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.4, 4), tinMat);
  roof.position.y = 3.2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  // Dining Bench and Table
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.0), woodMat);
  table.position.set(0, 0.4, 0.3);
  const bench1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.35), woodMat);
  bench1.position.set(0, 0.22, 1.1);
  const bench2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.35), woodMat);
  bench2.position.set(0, 0.22, -0.5);
  g.add(table, bench1, bench2);

  // Big traditional cooking pots on hearth (Fufu/Soup pots)
  const potGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12);
  const pot1 = new THREE.Mesh(potGeo, metalMat);
  pot1.position.set(-1.4, 0.6, -1.0);
  const pot2 = new THREE.Mesh(potGeo, metalMat);
  pot2.position.set(-0.6, 0.6, -1.0);
  g.add(pot1, pot2);

  return g;
}

// --- 17. STYLIZED LOW-POLY GOAT ---
function buildGoat() {
  const g = new THREE.Group();
  g.name = 'Goat';

  const furMat = mat(0xe9ecef, 0.85); // Cream coat with brown patches
  const brownMat = mat(0x795548, 0.85);
  const hornMat = mat(0x495057, 0.5, 0.2);

  // Body
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), furMat);
  body.scale.set(1.5, 0.85, 0.75);
  body.position.y = 0.5;
  g.add(body);

  // Brown spots on back
  const patch = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), brownMat);
  patch.position.set(0.1, 0.65, 0.1);
  g.add(patch);

  // Neck and Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.35, 6), furMat);
  neck.position.set(0.48, 0.68, 0);
  neck.rotation.z = -0.4;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), furMat);
  head.scale.set(1.3, 1.0, 0.85);
  head.position.set(0.62, 0.82, 0);
  g.add(neck, head);

  // Horns
  const hornGeo = new THREE.CylinderGeometry(0.015, 0.03, 0.22, 5);
  for (const sz of [-0.07, 0.07]) {
    const horn = new THREE.Mesh(hornGeo, hornMat);
    horn.position.set(0.55, 0.98, sz);
    horn.rotation.z = -0.5;
    horn.rotation.x = sz * 1.5;
    g.add(horn);
  }

  // Drooping ears
  for (const sz of [-0.12, 0.12]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 4, 4), brownMat);
    ear.scale.set(1.2, 0.4, 0.3);
    ear.position.set(0.56, 0.78, sz);
    g.add(ear);
  }

  // 4 Legs
  const legGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.45, 6);
  for (const [lx, lz] of [[-0.3, -0.16], [-0.3, 0.16], [0.3, -0.16], [0.3, 0.16]]) {
    const leg = new THREE.Mesh(legGeo, furMat);
    leg.position.set(lx, 0.22, lz);
    g.add(leg);
  }

  // Little tail
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.18, 4), furMat);
  tail.position.set(-0.55, 0.65, 0);
  tail.rotation.z = 0.6;
  g.add(tail);

  return g;
}

async function run() {
  console.log('Generating modular stylized 3D assets for Night Market Rider...');

  await exportGLB(buildTrotro(), 'public/models/vehicles/trotro.glb');
  await exportGLB(buildTaxi(), 'public/models/vehicles/taxi.glb');
  await exportGLB(buildSedan(0xc92a2a), 'public/models/vehicles/car.glb');
  await exportGLB(buildBus(), 'public/models/vehicles/bus.glb');

  await exportGLB(buildLegonHall(), 'public/models/buildings/legon_hall.glb');
  await exportGLB(buildCompoundHouse(), 'public/models/buildings/compound_house.glb');
  await exportGLB(buildCommercialShop(), 'public/models/buildings/commercial_block.glb');
  await exportGLB(buildMarketStall(), 'public/models/buildings/market_stall.glb');
  await exportGLB(buildChopBar(), 'public/models/buildings/chop_bar.glb');

  await exportGLB(buildMoMoKiosk(), 'public/models/props/momo_kiosk.glb');
  await exportGLB(buildStreetlight(), 'public/models/props/streetlight.glb');
  await exportGLB(buildPowerPole(), 'public/models/props/power_pole.glb');
  await exportGLB(buildTrafficLight(), 'public/models/props/traffic_light.glb');
  await exportGLB(buildRoadBarrier(), 'public/models/props/road_barrier.glb');

  await exportGLB(buildPalmTree(), 'public/models/vegetation/palm_tree.glb');
  await exportGLB(buildShadeTree(), 'public/models/vegetation/shade_tree.glb');

  await exportGLB(buildGoat(), 'public/models/characters/goat.glb');

  console.log('All modular GLB models generated successfully!');
}

run().catch(console.error);
