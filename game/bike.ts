import * as THREE from "three";
import { nightMarketTexture, textTexture } from "./textures";
import { buildHumanoid, buildHelmet, HumanoidRig } from "./characters";

export interface RiderRig {
  group: THREE.Group;      // world transform (position + heading)
  lean: THREE.Group;       // lean/tilt during turns & bumps
  body: THREE.Group;       // rider container for crouch anim
  frontWheel: THREE.Mesh;
  rearWheel: THREE.Mesh;
  brakeLight: THREE.Mesh;
  headlight: THREE.SpotLight;
  exhaust: THREE.Object3D;
  boxLid: THREE.Mesh;
  rider?: HumanoidRig;
  /** Handlebar grips, footpegs, and the planted-foot spot. Bike space. */
  gripL: THREE.Object3D;
  gripR: THREE.Object3D;
  pegL: THREE.Object3D;
  pegR: THREE.Object3D;
  footDown: THREE.Object3D;
}

// Brand truth (from /public/brand): black + NM yellow (#f2e35c), white text.
const NM_YELLOW = 0xf2e35c;

function pbr(color: number, roughness = 0.7, metalness = 0.0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function buildRider(): RiderRig {
  const group = new THREE.Group();
  const lean = new THREE.Group();
  group.add(lean);

  // ---- Motorbike ----
  const bike = new THREE.Group();
  lean.add(bike);

  const frameMat = pbr(0x1a1d20, 0.35, 0.7);
  const accentMat = pbr(NM_YELLOW, 0.3, 0.4);
  const chromeMat = pbr(0xdddddd, 0.08, 0.95);
  const blackMat = pbr(0x111111, 0.8, 0);

  // Frame — lower chassis
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 2.2), frameMat);
  lower.position.set(0, 0.62, 0); lower.castShadow = true; bike.add(lower);

  // Fuel tank — rounded shape
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), pbr(0x22262b, 0.25, 0.5));
  tank.scale.set(0.78, 0.55, 1.15);
  tank.position.set(0, 0.95, 0.62); tank.castShadow = true; bike.add(tank);

  // Tank stripe — NM yellow
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.7), accentMat);
  stripe.position.set(0, 1.05, 0.62); bike.add(stripe);

  // Brand logo planes
  const brand = nightMarketTexture();
  if (brand) {
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: brand, transparent: true }));
      p.position.set(sx * 0.26, 0.68, 0.1); p.rotation.y = sx * Math.PI / 2;
      bike.add(p);
    }
  }

  // Number plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22),
    new THREE.MeshBasicMaterial({ map: textTexture("NM 024", { bg: "#ffffff", fg: "#111111", font: 64 }) }));
  plate.position.set(0, 0.58, -1.28); plate.rotation.y = Math.PI; bike.add(plate);

  // Seat
  const seatMat = pbr(0x1a1a1a, 0.85, 0);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.7), seatMat);
  seat.position.set(0, 0.9, -0.28); seat.castShadow = true; bike.add(seat);

  // Wheels — tire + rim + spokes
  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 20);
  const tireMat = pbr(0x0a0a0a, 0.95, 0);
  const rimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.3, 12);
  const rimMat = pbr(0x888888, 0.15, 0.8);
  const spokeGeo = new THREE.BoxGeometry(0.03, 0.55, 0.03);

  const frontWheel = new THREE.Mesh(tireGeo, tireMat);
  frontWheel.rotation.z = Math.PI / 2; frontWheel.position.set(0, 0.42, 1.25); frontWheel.castShadow = true;
  bike.add(frontWheel);
  const frontRim = new THREE.Mesh(rimGeo, rimMat);
  frontRim.rotation.z = Math.PI / 2; frontRim.position.set(0, 0.42, 1.25);
  bike.add(frontRim);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, chromeMat);
    spoke.rotation.z = Math.PI / 2;
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spoke.position.set(0, 0.42, 1.25);
    bike.add(spoke);
  }

  const rearWheel = new THREE.Mesh(tireGeo, tireMat);
  rearWheel.rotation.z = Math.PI / 2; rearWheel.position.set(0, 0.42, -1.05); rearWheel.castShadow = true;
  bike.add(rearWheel);
  const rearRim = new THREE.Mesh(rimGeo, rimMat);
  rearRim.rotation.z = Math.PI / 2; rearRim.position.set(0, 0.42, -1.05);
  bike.add(rearRim);

  // Front fender
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.85), accentMat);
  fender.position.set(0, 0.82, 1.25); bike.add(fender);

  // Front fork
  const forkGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6);
  for (const sx of [-0.12, 0.12]) {
    const fork = new THREE.Mesh(forkGeo, chromeMat);
    fork.position.set(sx, 0.82, 1.25);
    bike.add(fork);
  }

  // Handlebars — close enough that a human arm actually reaches them
  const BAR_Z = 0.12, BAR_Y = 1.14;
  const handleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.92, 8);
  const handle = new THREE.Mesh(handleGeo, chromeMat);
  handle.rotation.z = Math.PI / 2; handle.position.set(0, BAR_Y, BAR_Z); bike.add(handle);
  // Grips
  const gripGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.14, 6);
  for (const sx of [-0.42, 0.42]) {
    const grip = new THREE.Mesh(gripGeo, blackMat);
    grip.rotation.z = Math.PI / 2; grip.position.set(sx, BAR_Y, BAR_Z);
    bike.add(grip);
  }
  const gripL = new THREE.Object3D(); gripL.position.set(-0.4, BAR_Y, BAR_Z); bike.add(gripL);
  const gripR = new THREE.Object3D(); gripR.position.set(0.4, BAR_Y, BAR_Z); bike.add(gripR);
  // Steering stem so the bars meet the front of the bike
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), chromeMat);
  stem.position.set(0, 0.95, 0.48);
  stem.rotation.x = 0.85;
  bike.add(stem);
  // Mirrors
  const mirrorStemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.22, 4);
  const mirrorFaceGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8);
  for (const sx of [-0.35, 0.35]) {
    const stem = new THREE.Mesh(mirrorStemGeo, chromeMat);
    stem.position.set(sx, BAR_Y + 0.12, BAR_Z);
    bike.add(stem);
    const mirror = new THREE.Mesh(mirrorFaceGeo, chromeMat);
    mirror.rotation.z = Math.PI / 2;
    mirror.position.set(sx, BAR_Y + 0.24, BAR_Z);
    bike.add(mirror);
  }

  // Engine block under tank
  const engineBlock = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.65), pbr(0x2d3135, 0.4, 0.8));
  engineBlock.position.set(0, 0.55, 0.15);
  engineBlock.castShadow = true;
  bike.add(engineBlock);
  // Engine cooling fins
  for (let f = -0.15; f <= 0.15; f += 0.08) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.58), chromeMat);
    fin.position.set(0, 0.55 + f, 0.15);
    bike.add(fin);
  }

  // Front disc brake rotor & caliper
  const discGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.02, 16);
  const disc = new THREE.Mesh(discGeo, chromeMat);
  disc.rotation.z = Math.PI / 2;
  disc.position.set(0.12, 0.42, 1.25);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.12), pbr(0xd9480f, 0.3, 0.4)); // Red caliper
  caliper.position.set(0.13, 0.52, 1.18);
  bike.add(disc, caliper);

  // Smartphone GPS Mount on Handlebar (Accra rider signature feature from photo!)
  const phoneBracket = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), blackMat);
  phoneBracket.position.set(0, BAR_Y + 0.06, BAR_Z + 0.05);
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.02), blackMat);
  phone.position.set(0, BAR_Y + 0.14, BAR_Z + 0.06);
  phone.rotation.x = -0.55; // Angled toward rider's eyes
  const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.21), new THREE.MeshBasicMaterial({ color: 0x1971c2 }));
  phoneScreen.position.set(0, BAR_Y + 0.14, BAR_Z + 0.075);
  phoneScreen.rotation.x = -0.55;
  bike.add(phoneBracket, phone, phoneScreen);

  // Headlight — glass housing + bulb (on front fairing)
  const lampHousing = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), chromeMat);
  lampHousing.scale.z = 0.6;
  lampHousing.position.set(0, 1.05, 1.45);
  lampHousing.castShadow = true;
  bike.add(lampHousing);

  const lampGlass = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({
    color: 0xfff6bf, roughness: 0.05, metalness: 0.3, emissive: 0xfff2c4, emissiveIntensity: 0.2,
  }));
  lampGlass.position.set(0, 1.05, 1.48);
  bike.add(lampGlass);

  // Turn signal indicators (amber lenses)
  for (const sx of [-0.26, 0.26]) {
    const blinker = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), new THREE.MeshStandardMaterial({
      color: 0xff922b, emissive: 0xff922b, emissiveIntensity: 0.3,
    }));
    blinker.position.set(sx, 1.02, 1.4);
    bike.add(blinker);
  }

  // Brake light
  const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0x550000 }));
  brakeLight.position.set(0, 0.88, -1.32);
  bike.add(brakeLight);

  // Exhaust pipe with chrome heat shield
  const exhaustPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.85, 8), chromeMat);
  exhaustPipe.rotation.x = Math.PI / 2;
  exhaustPipe.position.set(0.25, 0.45, -1.0);
  exhaustPipe.castShadow = true;
  bike.add(exhaustPipe);
  const heatShield = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.45, 8, 1, true, 0, Math.PI), chromeMat);
  heatShield.rotation.x = Math.PI / 2;
  heatShield.position.set(0.25, 0.46, -0.9);
  bike.add(heatShield);

  const exhaust = new THREE.Object3D();
  exhaust.position.set(0.28, 0.42, -1.45);
  bike.add(exhaust);

  // Footpegs
  const pegGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6);
  for (const sx of [-1, 1]) {
    const peg = new THREE.Mesh(pegGeo, chromeMat);
    peg.rotation.z = Math.PI / 2;
    peg.position.set(sx * 0.2, 0.42, 0.02);
    bike.add(peg);
  }
  const pegL = new THREE.Object3D(); pegL.position.set(-0.16, 0.5, 0.16); bike.add(pegL);
  const pegR = new THREE.Object3D(); pegR.position.set(0.16, 0.5, 0.16); bike.add(pegR);
  const footDown = new THREE.Object3D(); footDown.position.set(-0.34, 0.06, -0.18); bike.add(footDown);

  // Headlight spot
  const headlight = new THREE.SpotLight(0xfff2c4, 0, 45, 0.55, 0.5, 1.2);
  headlight.position.set(0, 1.2, 1.4);
  const headTarget = new THREE.Object3D();
  headTarget.position.set(0, 0.4, 15);
  bike.add(headTarget);
  headlight.target = headTarget;
  bike.add(headlight);

  // ---- Rider (stylized humanoid, NM branded) ----
  const body = new THREE.Group();
  lean.add(body);

  const human = buildHumanoid({
    skin: 0x5d3a1a,
    shirt: 0xf5c518, // Official Night Market Yellow
    pants: 0x2b3e50, // Denim jeans (from photo!)
    shoes: 0x212529, // Sneakers
    hair: "bald",
    gloves: 0x1c1c1c,
    longSleeves: true,
    detail: "full",
  });
  const r = human;
  r.group.position.set(0, 0.12, -0.22);
  r.torso.rotation.x = 0.18;
  body.add(r.group);

  // Reflective strips on the tee
  const reflMat = new THREE.MeshStandardMaterial({
    color: 0xe9ecef, roughness: 0.3, metalness: 0.2, emissive: 0xcccccc, emissiveIntensity: 0.15,
  });
  for (const y of [0.18, 0.32]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.02), reflMat);
    s.position.set(0, y, 0.145);
    r.torso.add(s);
  }

  // Helmet — NM yellow aerodynamic shell + visor
  const helmet = buildHelmet(NM_YELLOW);
  r.head.add(helmet);

  // Helmet logo sides
  if (brand) {
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.12), new THREE.MeshBasicMaterial({ map: brand, transparent: true }));
      p.position.set(sx * 0.2, 0.17, 0); p.rotation.y = sx * Math.PI / 2;
      r.head.add(p);
    }
  }
  // Chest logo
  if (brand) {
    const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.16), new THREE.MeshBasicMaterial({ map: brand, transparent: true }));
    chest.position.set(0, 0.3, 0.16);
    r.torso.add(chest);
  }

  // ---- Delivery box (hero branding) ----
  const boxG = new THREE.Group();
  boxG.position.set(0, 1.2, -1.15);
  lean.add(boxG);

  const boxBody = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.65), pbr(0x111113, 0.6, 0.1));
  boxBody.castShadow = true;
  boxG.add(boxBody);
  const boxLid = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.2, 0.68), accentMat);
  boxLid.position.y = 0.55;
  boxLid.castShadow = true;
  boxG.add(boxLid);

  // Padded handle on top of lid
  const lidHandle = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.08), blackMat);
  lidHandle.position.set(0, 0.68, 0);
  boxG.add(lidHandle);

  // Seams and straps
  const seam = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.04, 0.66), blackMat);
  seam.position.y = 0.38;
  boxG.add(seam);
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.67), blackMat);
    strap.position.set(sx * 0.28, 0, 0);
    boxG.add(strap);
  }
  // 3M Reflective safety strip with night glow
  const boxRefl = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.09, 0.66), reflMat);
  boxRefl.position.y = -0.28;
  boxG.add(boxRefl);

  // Logo planes using high-res Night Market brand asset
  if (brand) {
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), new THREE.MeshBasicMaterial({ map: brand, transparent: true }));
    rear.position.set(0, 0.02, -0.335);
    rear.rotation.y = Math.PI;
    boxG.add(rear);
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.33), new THREE.MeshBasicMaterial({ map: brand, transparent: true }));
      s.position.set(sx * 0.51, 0.02, 0);
      s.rotation.y = sx * Math.PI / 2;
      boxG.add(s);
    }
  } else {
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.28), new THREE.MeshBasicMaterial({ color: NM_YELLOW }));
    rear.position.set(0, 0.05, -0.335);
    rear.rotation.y = Math.PI;
    boxG.add(rear);
  }

  return { group, lean, body, frontWheel, rearWheel, brakeLight, headlight, exhaust, boxLid, rider: r, gripL, gripR, pegL, pegR, footDown };
}
