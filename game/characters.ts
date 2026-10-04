import * as THREE from "three";

/**
 * Stylized human rigs for Night Market Rider.
 *
 * The goal is a believable human silhouette without turning the browser game
 * into a heavy character renderer. Geometry is shared between actors and the
 * lightweight joint hierarchy keeps the existing code-driven animation/IK.
 */
export interface HumanoidRig {
  group: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  armL: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Mesh };
  armR: { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Mesh };
  legL: { hip: THREE.Group; knee: THREE.Group; foot: THREE.Mesh };
  legR: { hip: THREE.Group; knee: THREE.Group; foot: THREE.Mesh };
}

export type HairStyle = "afro" | "short" | "wrap" | "bald" | "cap";

export interface HumanOptions {
  skin?: number;
  shirt?: number;
  pants?: number;
  shoes?: number;
  hair?: HairStyle;
  hairColor?: number;
  capColor?: number;
  scale?: number;
  bulk?: number;
  longSleeves?: boolean;
  shorts?: boolean;
  feminine?: boolean;
  gloves?: number;
  apron?: boolean;
  apronColor?: number;
  detail?: "full" | "simple";
}

export const SKIN_TONES = [0x432614, 0x52301a, 0x623b20, 0x744828, 0x875735, 0x9a6844];

export const LIMB = {
  upperArm: 0.295,
  foreArm: 0.265,
  thigh: 0.455,
  shin: 0.435,
  hipsY: 0.91,
} as const;

const geoCache = new Map<string, THREE.BufferGeometry>();
function G(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function M(color: number, roughness = 0.75, metalness = 0, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${color}/${roughness}/${metalness}/${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive: emissive ? color : 0x000000,
      emissiveIntensity: emissive,
    });
    matCache.set(key, m);
  }
  return m;
}

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  m.userData.shared = true;
  return m;
}

function lathe(key: string, pts: readonly [number, number][], seg = 12): THREE.BufferGeometry {
  return G(key, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    g.computeVertexNormals();
    return g;
  });
}

function capsule(key: string, radius: number, length: number, cap = 4, radial = 8): THREE.BufferGeometry {
  return G(key, () => new THREE.CapsuleGeometry(radius, length, cap, radial));
}

function headGeometry(): THREE.BufferGeometry {
  return G("head-anatomical-v2", () => {
    const g = new THREE.SphereGeometry(0.148, 24, 18);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ny = v.y / 0.148;
      const nz = v.z / 0.148;

      // Slightly taller skull, narrower temples and a defined jaw/chin.
      v.y *= 1.07;
      if (ny < 0.18) {
        const t = THREE.MathUtils.clamp((0.18 - ny) / 1.15, 0, 1);
        v.x *= 1 - 0.30 * t * t;
        v.z += 0.008 * t;
      }
      if (ny > 0.38) v.x *= 0.98;

      // Cheek projection and a flatter back of skull.
      const cheek = Math.exp(-Math.pow((ny + 0.02) / 0.42, 2)) * Math.max(0, nz);
      v.x *= 1 + cheek * 0.055;
      if (nz < -0.18) v.z *= 0.94;

      // Chin taper.
      if (ny < -0.64) {
        const t = THREE.MathUtils.clamp((-0.64 - ny) / 0.36, 0, 1);
        v.x *= 1 - t * 0.22;
        v.z += t * 0.009;
      }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

const CHEST = lathe("chest-v2", [
  [0.102, 0.00],
  [0.120, 0.07],
  [0.142, 0.18],
  [0.162, 0.31],
  [0.166, 0.39],
  [0.142, 0.49],
  [0.092, 0.525],
], 14);

const UPPER_ARM = lathe("upper-arm-v2", [
  [0.042, 0.01],
  [0.061, -0.035],
  [0.058, -0.12],
  [0.050, -0.22],
  [0.040, -LIMB.upperArm],
], 10);

const FORE_ARM = lathe("fore-arm-v2", [
  [0.041, 0.01],
  [0.050, -0.055],
  [0.044, -0.14],
  [0.034, -0.225],
  [0.029, -LIMB.foreArm],
], 10);

const THIGH = lathe("thigh-v2", [
  [0.058, 0.015],
  [0.094, -0.055],
  [0.090, -0.17],
  [0.078, -0.29],
  [0.058, -0.40],
  [0.052, -LIMB.thigh],
], 12);

const SHIN = lathe("shin-v2", [
  [0.050, 0.01],
  [0.061, -0.08],
  [0.067, -0.18],
  [0.057, -0.28],
  [0.041, -0.37],
  [0.033, -LIMB.shin],
], 11);

function afroGeometry(full: boolean): THREE.BufferGeometry {
  return G(full ? "afro-v2-full" : "afro-v2", () => {
    const g = new THREE.IcosahedronGeometry(full ? 0.202 : 0.182, 2);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      if (n.z > 0.48 && n.y < 0.35) v.multiplyScalar(0.48);
      else v.multiplyScalar(1 + 0.045 * Math.sin(n.x * 18 + n.y * 11) * Math.cos(n.z * 15));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

let visorMat: THREE.MeshStandardMaterial | null = null;
function helmetVisor(): THREE.MeshStandardMaterial {
  if (!visorMat) {
    visorMat = new THREE.MeshStandardMaterial({
      color: 0x111820,
      roughness: 0.04,
      metalness: 0.35,
      transparent: true,
      opacity: 0.66,
    });
  }
  return visorMat;
}

export function buildHumanoid(o: HumanOptions = {}): HumanoidRig {
  const skin = o.skin ?? 0x6b4423;
  const skinM = M(skin, 0.61, 0, 0.015);
  const shirtM = M(o.shirt ?? 0xe67700, 0.80);
  const pantsM = M(o.pants ?? 0x343a40, 0.76);
  const shoeM = M(o.shoes ?? 0x24160c, 0.55, 0.05);
  const soleM = M(0x111111, 0.88);
  const hairM = M(o.hairColor ?? 0x12100e, 0.91);
  const eyeWhiteM = M(0xf0eee8, 0.42);
  const irisM = M(0x2a1a11, 0.32);
  const browM = hairM;
  const lipM = M(0x63352f, 0.54);
  const handM = o.gloves !== undefined ? M(o.gloves, 0.67, 0.03) : skinM;
  const detail = o.detail ?? "full";
  const bulk = o.bulk ?? 1;
  const fem = !!o.feminine;

  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = LIMB.hipsY;
  group.add(hips);

  const pelvisGeo = G("pelvis-v2", () => {
    const g = new THREE.SphereGeometry(0.137, 14, 10);
    g.scale(1, 0.68, 0.9);
    return g;
  });
  const pelvis = part(pelvisGeo, pantsM, 0, 0.015, 0);
  pelvis.scale.set((fem ? 1.36 : 1.18) * bulk, 1, 1);
  hips.add(pelvis);

  const belt = part(G("belt-v2", () => new THREE.CylinderGeometry(0.126, 0.132, 0.038, 14)), M(0x1b1c1e, 0.58, 0.08), 0, 0.085, 0);
  belt.scale.x = (fem ? 1.18 : 1.06) * bulk;
  hips.add(belt);

  const torso = new THREE.Group();
  torso.position.y = 0.085;
  hips.add(torso);

  const chest = part(CHEST, shirtM);
  chest.scale.set((fem ? 0.90 : 1) * bulk, 1, fem ? 0.93 : 1);
  torso.add(chest);

  // Rounded clavicle/shoulder bridge removes the action-figure block silhouette.
  const shoulderBridge = part(capsule("clavicle-v2", 0.048, 0.29, 4, 10), shirtM, 0, 0.405, 0);
  shoulderBridge.rotation.z = Math.PI / 2;
  shoulderBridge.scale.x = (fem ? 0.90 : 1) * bulk;
  torso.add(shoulderBridge);

  // Shirt collar and a hint of upper chest/neck transition.
  const collar = part(G("collar-v2", () => new THREE.TorusGeometry(0.078, 0.014, 6, 16)), shirtM, 0, 0.505, 0, false);
  collar.rotation.x = Math.PI / 2;
  torso.add(collar);

  if (o.apron) {
    const apronM = M(o.apronColor ?? 0xe67700, 0.76);
    const apron = part(G("apron-v2", () => {
      const g = new THREE.BoxGeometry(0.23, 0.34, 0.018, 2, 3, 1);
      g.translate(0, -0.02, 0);
      return g;
    }), apronM, 0, 0.25, 0.148);
    apron.rotation.x = -0.03;
    torso.add(apron);
    for (const sx of [-1, 1]) {
      const strap = part(capsule("apron-strap-v2", 0.008, 0.25, 2, 5), apronM, sx * 0.09, 0.39, 0.13, false);
      strap.rotation.z = sx * 0.33;
      torso.add(strap);
    }
  }

  const neck = new THREE.Group();
  neck.position.y = 0.515;
  torso.add(neck);
  const neckMesh = part(G("neck-v2", () => new THREE.CylinderGeometry(0.049, 0.061, 0.12, 10)), skinM, 0, 0.045, 0);
  neckMesh.scale.z = 0.94;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.y = 0.095;
  neck.add(head);
  const skull = part(headGeometry(), skinM, 0, 0.135, 0);
  if (fem) skull.scale.set(0.965, 1.025, 0.975);
  head.add(skull);

  addFace(head, skinM, eyeWhiteM, irisM, browM, lipM, detail, fem);
  addHair(head, o.hair ?? "afro", hairM, o.capColor ?? 0x1971c2, fem);

  const shoulderX = 0.205 * (fem ? 0.90 : 1) * bulk;
  const armL = buildArm(torso, -1, shoulderX, skinM, shirtM, handM, !!o.longSleeves);
  const armR = buildArm(torso, 1, shoulderX, skinM, shirtM, handM, !!o.longSleeves);

  const hipX = 0.096 * (fem ? 1.12 : 1) * bulk;
  const legL = buildLeg(hips, -1, hipX, pantsM, o.shorts ? skinM : pantsM, shoeM, soleM);
  const legR = buildLeg(hips, 1, hipX, pantsM, o.shorts ? skinM : pantsM, shoeM, soleM);

  group.scale.setScalar(o.scale ?? 1);
  return { group, hips, torso, neck, head, armL, armR, legL, legR };
}

function addFace(
  head: THREE.Group,
  skinM: THREE.Material,
  eyeWhiteM: THREE.Material,
  irisM: THREE.Material,
  browM: THREE.Material,
  lipM: THREE.Material,
  detail: "full" | "simple",
  feminine: boolean,
) {
  const eyeY = 0.166;
  if (detail === "simple") {
    for (const sx of [-1, 1] as const) {
      const eye = part(G("simple-eye-v2", () => new THREE.SphereGeometry(0.018, 7, 5)), irisM, sx * 0.050, eyeY, 0.145, false);
      eye.scale.z = 0.55;
      head.add(eye);
    }
    return;
  }

  for (const sx of [-1, 1] as const) {
    const eye = part(G("eye-white-v2", () => new THREE.SphereGeometry(0.025, 10, 7)), eyeWhiteM, sx * 0.052, eyeY, 0.132, false);
    eye.scale.set(1.18, 0.72, 0.55);
    head.add(eye);
    const iris = part(G("iris-v2", () => new THREE.SphereGeometry(0.0135, 8, 6)), irisM, sx * 0.052, eyeY, 0.149, false);
    iris.scale.z = 0.5;
    head.add(iris);

    const brow = part(capsule("brow-v2", 0.0065, 0.048, 2, 5), browM, sx * 0.052, 0.205, 0.133, false);
    brow.rotation.z = Math.PI / 2 + sx * -0.16;
    head.add(brow);

    const ear = part(G("ear-v2", () => new THREE.SphereGeometry(0.031, 8, 6)), skinM, sx * 0.142, 0.126, -0.004, false);
    ear.scale.set(0.38, 0.85, 0.55);
    head.add(ear);
  }

  // Nose bridge + tip reads much more naturally than a single sphere.
  const bridge = part(G("nose-bridge-v2", () => {
    const g = new THREE.CapsuleGeometry(0.010, 0.046, 3, 6);
    g.rotateX(Math.PI / 2);
    return g;
  }), skinM, 0, 0.139, 0.143, false);
  bridge.rotation.x = -0.18;
  head.add(bridge);
  const nose = part(G("nose-tip-v2", () => {
    const g = new THREE.SphereGeometry(0.019, 9, 7);
    g.scale(0.92, 0.72, 1.35);
    return g;
  }), skinM, 0, 0.112, 0.154, false);
  head.add(nose);

  const mouth = part(G("lips-v2", () => {
    const g = new THREE.SphereGeometry(0.027, 10, 6);
    g.scale(1.0, feminine ? 0.26 : 0.22, 0.34);
    return g;
  }), lipM, 0, 0.066, 0.145, false);
  head.add(mouth);

  // Small chin plane catches light and makes the lower face less spherical.
  const chin = part(G("chin-v2", () => {
    const g = new THREE.SphereGeometry(0.035, 8, 6);
    g.scale(1.25, 0.55, 0.45);
    return g;
  }), skinM, 0, 0.018, 0.118, false);
  head.add(chin);
}

function addHair(head: THREE.Group, hair: HairStyle, hairM: THREE.Material, capColor: number, fem: boolean) {
  switch (hair) {
    case "afro":
      head.add(part(afroGeometry(fem), hairM, 0, 0.185, -0.02));
      break;
    case "short": {
      const crop = part(G("hair-short-v2", () => new THREE.SphereGeometry(0.160, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.57)), hairM, 0, 0.212, -0.013);
      crop.scale.set(1.01, 0.9, 1.02);
      head.add(crop);
      break;
    }
    case "wrap": {
      const wrapM = M(capColor, 0.71);
      const band = part(G("wrap-band-v2", () => new THREE.TorusGeometry(0.151, 0.036, 7, 16)), wrapM, 0, 0.205, 0);
      band.rotation.x = Math.PI / 2;
      head.add(band);
      const top = part(G("wrap-top-v2", () => new THREE.SphereGeometry(0.096, 10, 8)), wrapM, 0, 0.285, -0.01);
      top.scale.set(1.0, 0.82, 0.95);
      head.add(top);
      head.add(part(G("wrap-knot-v2", () => new THREE.SphereGeometry(0.052, 8, 6)), wrapM, 0.10, 0.258, 0.05));
      break;
    }
    case "cap": {
      const capM = M(capColor, 0.66);
      const dome = part(G("cap-dome-v2", () => new THREE.SphereGeometry(0.169, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), capM, 0, 0.205, -0.012);
      dome.scale.y = 0.92;
      head.add(dome);
      const brim = part(G("cap-brim-v2", () => {
        const g = new THREE.CylinderGeometry(0.092, 0.092, 0.016, 14);
        g.scale(1.48, 1, 0.74);
        return g;
      }), capM, 0, 0.158, 0.105);
      brim.rotation.x = 0.38;
      head.add(brim);
      break;
    }
    case "bald":
      break;
  }
}

function buildArm(
  torso: THREE.Group,
  side: 1 | -1,
  shoulderX: number,
  skinM: THREE.Material,
  shirtM: THREE.Material,
  handM: THREE.Material,
  longSleeves: boolean,
) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * shoulderX, 0.405, 0);
  torso.add(shoulder);

  // The anatomical limb remains visible below a short sleeve. A sleeve shell is
  // added around the shoulder so the arm no longer reads as a single cylinder.
  shoulder.add(part(UPPER_ARM, longSleeves ? shirtM : skinM));
  if (!longSleeves) {
    const sleeve = part(G("short-sleeve-v2", () => {
      const g = new THREE.CylinderGeometry(0.064, 0.055, 0.13, 10);
      g.translate(0, -0.065, 0);
      return g;
    }), shirtM, 0, -0.005, 0);
    shoulder.add(sleeve);
  }

  const elbow = new THREE.Group();
  elbow.position.y = -LIMB.upperArm;
  shoulder.add(elbow);
  elbow.add(part(G("elbow-v2", () => new THREE.SphereGeometry(0.041, 9, 7)), longSleeves ? shirtM : skinM));
  elbow.add(part(FORE_ARM, longSleeves ? shirtM : skinM));

  const hand = part(G("hand-v2", () => {
    const g = new THREE.SphereGeometry(0.041, 10, 8);
    g.scale(0.88, 1.08, 0.62);
    return g;
  }), handM, 0, -LIMB.foreArm, 0);

  // Thumb and four very lightweight finger ridges. The silhouette remains low-poly
  // but reads as a hand instead of a mitten at close camera distances.
  const thumb = part(capsule("thumb-v2", 0.0105, 0.034, 2, 5), handM, side * 0.031, -0.005, 0.010, false);
  thumb.rotation.z = side * (Math.PI / 2 + 0.32);
  hand.add(thumb);
  for (let i = 0; i < 4; i++) {
    const finger = part(capsule("finger-v2", 0.0055, 0.030, 2, 4), handM, (i - 1.5) * 0.010, -0.024, 0.018, false);
    finger.rotation.x = 0.12;
    hand.add(finger);
  }
  elbow.add(hand);
  return { shoulder, elbow, hand };
}

function buildLeg(
  hips: THREE.Group,
  side: 1 | -1,
  hipX: number,
  pantsM: THREE.Material,
  shinM: THREE.Material,
  shoeM: THREE.Material,
  soleM: THREE.Material,
) {
  const hip = new THREE.Group();
  hip.position.set(side * hipX, -0.02, 0);
  hips.add(hip);
  hip.add(part(THIGH, pantsM));

  const knee = new THREE.Group();
  knee.position.y = -LIMB.thigh;
  hip.add(knee);
  knee.add(part(G("knee-v2", () => new THREE.SphereGeometry(0.050, 9, 7)), shinM));
  knee.add(part(SHIN, shinM));

  const foot = part(G("shoe-body-v2", () => {
    const g = new THREE.SphereGeometry(0.060, 12, 8);
    g.scale(1.04, 0.48, 1.82);
    g.translate(0, -0.028, 0.060);
    return g;
  }), shoeM, 0, -LIMB.shin, 0);
  foot.add(part(G("sole-v2", () => {
    const g = new THREE.BoxGeometry(0.105, 0.018, 0.19);
    g.translate(0, -0.055, 0.045);
    return g;
  }), soleM, 0, 0, 0, false));
  const toeCap = part(G("toe-cap-v2", () => {
    const g = new THREE.SphereGeometry(0.047, 8, 6);
    g.scale(1, 0.35, 0.65);
    return g;
  }), shoeM, 0, -0.018, 0.125, false);
  foot.add(toeCap);
  knee.add(foot);
  return { hip, knee, foot };
}

/** Rounded open-face motorcycle helmet with a transparent visor. */
export function buildHelmet(color = 0xf2e35c): THREE.Group {
  const g = new THREE.Group();
  const shellM = M(color, 0.26, 0.24);
  const darkM = M(0x111214, 0.58, 0.10);

  const shell = part(G("helmet-shell-v2", () => {
    const geo = new THREE.SphereGeometry(0.193, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.57);
    geo.translate(0, 0.175, -0.018);
    return geo;
  }), shellM);
  shell.scale.set(1.0, 0.98, 1.03);
  g.add(shell);

  const rear = part(G("helmet-rear-v2", () => {
    const geo = new THREE.SphereGeometry(0.155, 16, 10);
    geo.scale(1, 0.78, 0.62);
    return geo;
  }), shellM, 0, 0.135, -0.095);
  g.add(rear);

  const visor = part(G("helmet-visor-v2", () => {
    const geo = new THREE.SphereGeometry(0.155, 20, 10, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.18, Math.PI * 0.38);
    geo.scale(1.0, 0.83, 1.05);
    return geo;
  }), helmetVisor(), 0, 0.17, 0.055, false);
  visor.rotation.x = -0.05;
  g.add(visor);

  const rim = part(G("helmet-rim-v2", () => new THREE.TorusGeometry(0.158, 0.012, 6, 18)), darkM, 0, 0.107, -0.012, false);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);

  const strap = part(G("helmet-strap-v2", () => new THREE.TorusGeometry(0.090, 0.009, 5, 12, Math.PI)), darkM, 0, 0.047, 0.035, false);
  strap.rotation.x = Math.PI / 2;
  g.add(strap);
  return g;
}

export function buildHandBag(color = 0xf2e35c): THREE.Mesh {
  const bag = part(G("npc-bag-v2", () => new THREE.BoxGeometry(0.22, 0.16, 0.12, 2, 2, 1)), M(color, 0.55));
  bag.geometry.computeVertexNormals();
  return bag;
}

export function poseStanding(h: HumanoidRig) {
  h.armL.shoulder.rotation.set(0.06, 0, -0.08);
  h.armR.shoulder.rotation.set(0.06, 0, 0.08);
  h.armL.elbow.rotation.set(-0.16, 0, 0);
  h.armR.elbow.rotation.set(-0.16, 0, 0);
  h.legL.hip.rotation.set(0, 0, -0.025);
  h.legR.hip.rotation.set(0, 0, 0.025);
  h.legL.knee.rotation.set(0, 0, 0);
  h.legR.knee.rotation.set(0, 0, 0);
  h.torso.rotation.set(0, 0, 0);
  h.neck.rotation.set(0, 0, 0);
  h.head.rotation.set(0, 0, 0);
  h.hips.rotation.set(0, 0, 0);
  h.group.position.y = 0;
  plantFeet(h);
}

export function animateWalk(h: HumanoidRig, t: number, cadence = 4) {
  const s = Math.sin(t * cadence);
  const opposite = Math.sin(t * cadence + Math.PI);
  h.legL.hip.rotation.set(s * 0.52, 0, -0.035);
  h.legR.hip.rotation.set(opposite * 0.52, 0, 0.035);
  h.legL.knee.rotation.x = Math.max(0, -s) * 0.98;
  h.legR.knee.rotation.x = Math.max(0, -opposite) * 0.98;
  h.armL.shoulder.rotation.set(opposite * 0.44, 0, -0.08);
  h.armR.shoulder.rotation.set(s * 0.44, 0, 0.08);
  h.armL.elbow.rotation.x = -0.26 + Math.min(0, opposite) * 0.30;
  h.armR.elbow.rotation.x = -0.26 + Math.min(0, s) * 0.30;
  h.hips.rotation.set(0, s * 0.07, s * 0.025);
  h.torso.rotation.set(0.035, s * 0.075, -s * 0.02);
  h.neck.rotation.set(0, s * 0.025, 0);
  h.head.rotation.set(Math.sin(t * cadence * 0.5) * 0.018, Math.sin(t * cadence * 0.5) * 0.075, 0);
  h.group.position.y = Math.abs(Math.cos(t * cadence)) * 0.032;
  plantFeet(h);
}

export function animateIdle(h: HumanoidRig, t: number, seed = 0) {
  poseStanding(h);
  const breathe = t * 1.55 + seed;
  h.torso.rotation.x = 0.018 + Math.sin(breathe) * 0.014;
  h.torso.rotation.z = Math.sin(breathe * 0.55) * 0.014;
  h.hips.rotation.z = Math.sin(breathe * 0.42) * 0.012;
  h.head.rotation.y = Math.sin(t * 0.34 + seed * 2) * 0.30;
  h.head.rotation.x = Math.sin(t * 0.48 + seed) * 0.035;
  h.armL.shoulder.rotation.x = 0.06 + Math.sin(breathe) * 0.025;
  h.armR.shoulder.rotation.x = 0.06 + Math.sin(breathe + 1) * 0.025;
  plantFeet(h);
}

export function animateWave(h: HumanoidRig, t: number) {
  poseStanding(h);
  h.armR.shoulder.rotation.set(0.10, 0, 2.28);
  h.armR.elbow.rotation.z = Math.sin(t * 8.5) * 0.42;
  h.head.rotation.z = 0.055;
  h.head.rotation.y = 0.16;
  h.torso.rotation.z = -0.04;
  plantFeet(h);
}

export function animateHandoff(h: HumanoidRig, t: number) {
  poseStanding(h);
  h.armL.shoulder.rotation.set(-1.14, 0.22, -0.32);
  h.armL.elbow.rotation.x = -0.30 + Math.sin(t * 3) * 0.045;
  h.armR.shoulder.rotation.set(-0.61, -0.10, 0.22);
  h.armR.elbow.rotation.x = -0.42;
  h.torso.rotation.set(0.10, -0.15, 0);
  h.head.rotation.set(0.08, -0.16, 0);
  plantFeet(h);
}

export function animateReceive(h: HumanoidRig, t: number) {
  poseStanding(h);
  const bob = Math.sin(t * 3) * 0.035;
  h.armL.shoulder.rotation.set(-0.96, -0.18, -0.36);
  h.armR.shoulder.rotation.set(-0.96, 0.18, 0.36);
  h.armL.elbow.rotation.x = -0.48 + bob;
  h.armR.elbow.rotation.x = -0.48 - bob;
  h.torso.rotation.x = 0.07;
  h.head.rotation.set(0.10, 0, 0);
  plantFeet(h);
}

export interface RiderPose {
  t: number;
  dt: number;
  steer: number;
  speed: number;
  stopped: boolean;
  braking: boolean;
  boost: boolean;
  interact: "none" | "pickup" | "deliver";
}

export interface RiderAnchors {
  gripL: THREE.Object3D;
  gripR: THREE.Object3D;
  pegL: THREE.Object3D;
  pegR: THREE.Object3D;
  footDown: THREE.Object3D;
  frame: THREE.Object3D;
  reach?: THREE.Object3D | null;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _pole = new THREE.Vector3();
const _to = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _upper = new THREE.Vector3();
const _yAx = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const POLE_ARM_L = new THREE.Vector3(-0.5, -1, 0.2);
const POLE_ARM_R = new THREE.Vector3(0.5, -1, 0.2);
const POLE_LEG_L = new THREE.Vector3(-0.15, -0.35, 1);
const POLE_LEG_R = new THREE.Vector3(0.15, -0.35, 1);

function orientAppendage(mesh: THREE.Object3D, parent: THREE.Object3D, worldForward: THREE.Vector3, worldUp: THREE.Vector3) {
  parent.updateWorldMatrix(true, false);
  parent.getWorldQuaternion(_q).invert();
  _z.copy(worldForward).applyQuaternion(_q);
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1);
  _z.normalize();
  _y.copy(worldUp).applyQuaternion(_q);
  _y.addScaledVector(_z, -_y.dot(_z));
  if (_y.lengthSq() < 1e-6) _y.set(0, 1, 0);
  _y.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m4.makeBasis(_x, _y, _z);
  mesh.quaternion.setFromRotationMatrix(_m4);
}

function plantFeet(h: HumanoidRig) {
  h.group.updateWorldMatrix(true, false);
  _fwd.set(0, 0, 1).transformDirection(h.group.matrixWorld);
  _up.set(0, 1, 0);
  orientAppendage(h.legL.foot, h.legL.knee, _fwd, _up);
  orientAppendage(h.legR.foot, h.legR.knee, _fwd, _up);
}

function solveTwoBone(
  pivot: THREE.Object3D,
  mid: THREE.Object3D,
  upperLen: number,
  lowerLen: number,
  target: THREE.Vector3,
  pole: THREE.Vector3,
) {
  _to.subVectors(target, pivot.position);
  const raw = _to.length();
  if (raw < 1e-4) return;
  const max = upperLen + lowerLen - 1e-4;
  const min = Math.abs(upperLen - lowerLen) + 1e-4;
  const dist = Math.min(max, Math.max(min, raw));
  _to.multiplyScalar(dist / raw);

  const cosShoulder = THREE.MathUtils.clamp((upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist), -1, 1);
  const shoulderBend = Math.acos(cosShoulder);
  _bend.subVectors(pole, pivot.position);
  _x.crossVectors(_to, _bend);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); else _x.normalize();

  _upper.copy(_to).normalize().applyAxisAngle(_x, shoulderBend);
  _yAx.copy(_upper).negate();
  _z.crossVectors(_x, _yAx);
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_yAx, _z).normalize();
  _m4.makeBasis(_x, _yAx, _z);
  pivot.quaternion.setFromRotationMatrix(_m4);

  _elbow.copy(pivot.position).addScaledVector(_upper, upperLen);
  _to.subVectors(target, _elbow);
  if (_to.lengthSq() < 1e-8) return;
  _q.copy(pivot.quaternion).invert();
  _to.applyQuaternion(_q).normalize();
  _yAx.copy(_to).negate();
  _x.set(1, 0, 0);
  _z.crossVectors(_x, _yAx);
  if (_z.lengthSq() < 1e-8) { _x.set(0, 0, 1); _z.crossVectors(_x, _yAx); }
  _z.normalize();
  _x.crossVectors(_yAx, _z).normalize();
  _m4.makeBasis(_x, _yAx, _z);
  mid.quaternion.setFromRotationMatrix(_m4);
}

function aimBone(parent: THREE.Object3D, pivot: THREE.Object3D, mid: THREE.Object3D, worldPoint: THREE.Vector3, upperLen: number, lowerLen: number, poleOffset: THREE.Vector3) {
  parent.updateWorldMatrix(true, false);
  _p.copy(worldPoint);
  parent.worldToLocal(_p);
  _pole.copy(pivot.position).add(poleOffset);
  solveTwoBone(pivot, mid, upperLen, lowerLen, _p, _pole);
}

export function poseRider(h: HumanoidRig, a: RiderPose, anchors: RiderAnchors) {
  const k = Math.min(1, a.dt * 6);
  const stopped = a.stopped;
  const braking = a.braking && !stopped;
  const boost = a.boost && !stopped;
  let pitch = stopped ? 0.08 : braking ? 0.02 : boost ? 0.40 : 0.22;
  const freq = stopped ? 2.2 : 8 + Math.min(7, Math.abs(a.speed) * 0.35);
  const amp = stopped ? 0.010 : 0.009 + Math.min(0.016, Math.abs(a.speed) * 0.00065);
  pitch += Math.sin(a.t * freq) * amp;

  const lean = -a.steer * (stopped ? 0.035 : 0.17);
  h.torso.rotation.x += (pitch - h.torso.rotation.x) * k;
  h.torso.rotation.z += (lean - h.torso.rotation.z) * k;
  h.torso.rotation.y += (0 - h.torso.rotation.y) * k;
  h.neck.rotation.x += (pitch * 0.20 - h.neck.rotation.x) * k;
  h.hips.position.y = LIMB.hipsY + Math.sin(a.t * freq) * amp * 0.55;

  anchors.gripL.getWorldPosition(_fwd);
  aimBone(h.torso, h.armL.shoulder, h.armL.elbow, _fwd, LIMB.upperArm, LIMB.foreArm, POLE_ARM_L);

  if (a.interact !== "none" && anchors.reach) {
    anchors.reach.getWorldPosition(_up);
    _up.y += 1.2;
    aimBone(h.torso, h.armR.shoulder, h.armR.elbow, _up, LIMB.upperArm, LIMB.foreArm, POLE_ARM_R);
    h.torso.worldToLocal(_up);
    const look = Math.atan2(_up.x, _up.z);
    h.head.rotation.y += (THREE.MathUtils.clamp(look, -0.8, 0.8) - h.head.rotation.y) * k;
    h.head.rotation.x += (0.05 - h.head.rotation.x) * k;
  } else {
    anchors.gripR.getWorldPosition(_fwd);
    aimBone(h.torso, h.armR.shoulder, h.armR.elbow, _fwd, LIMB.upperArm, LIMB.foreArm, POLE_ARM_R);
    h.head.rotation.x += (-pitch * 0.72 - h.head.rotation.x) * k;
    h.head.rotation.y += (-a.steer * 0.38 - h.head.rotation.y) * k;
  }
  h.head.rotation.z += (a.steer * 0.055 - h.head.rotation.z) * k;

  const leftFootTarget = stopped ? anchors.footDown : anchors.pegL;
  leftFootTarget.getWorldPosition(_fwd);
  aimBone(h.hips, h.legL.hip, h.legL.knee, _fwd, LIMB.thigh, LIMB.shin, POLE_LEG_L);
  anchors.pegR.getWorldPosition(_fwd);
  aimBone(h.hips, h.legR.hip, h.legR.knee, _fwd, LIMB.thigh, LIMB.shin, POLE_LEG_R);

  anchors.frame.updateWorldMatrix(true, false);
  _fwd.set(0, 0, 1).transformDirection(anchors.frame.matrixWorld);
  if (stopped) _up.set(0, 1, 0); else _up.set(0, 1, 0).transformDirection(anchors.frame.matrixWorld);
  orientAppendage(h.legL.foot, h.legL.knee, _fwd, _up);
  orientAppendage(h.legR.foot, h.legR.knee, _fwd, _up);
}
