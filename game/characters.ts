import * as THREE from "three";

/**
 * Stylized low-poly humans for Night Market Rider.
 *
 * Shared lathed limbs, a sculpted head, mitten hands and rounded shoes.
 * Joints are a lightweight rig: NPCs are posed in code, the rider is
 * solved with two-bone IK so the hands stay on the bars and the feet
 * stay on the pegs.
 *
 * Meshes are marked `userData.shared` so spawn/despawn does not dispose
 * geometry that other characters are still using.
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
  /** Uniform height. Non-uniform scale would skew the joints. */
  scale?: number;
  /** Shoulder and hip width. */
  bulk?: number;
  longSleeves?: boolean;
  shorts?: boolean;
  feminine?: boolean;
  /** Riding gloves. Omit for bare hands. */
  gloves?: number;
  apron?: boolean;
  apronColor?: number;
  detail?: "full" | "simple";
}

export const SKIN_TONES = [0x4a2c17, 0x5c3820, 0x6b4423, 0x7a4e2c, 0x8b5a34];

/** Bone lengths. Joint positions and IK use the same numbers. */
export const LIMB = {
  upperArm: 0.29,
  foreArm: 0.26,
  thigh: 0.45,
  shin: 0.43,
  hipsY: 0.9,
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
  m.userData.shared = true;
  return m;
}

function lathe(key: string, pts: readonly [number, number][], seg = 10): THREE.BufferGeometry {
  return G(key, () => {
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
    g.computeVertexNormals();
    return g;
  });
}

function headGeometry(): THREE.BufferGeometry {
  return G("headHuman", () => {
    const g = new THREE.SphereGeometry(0.142, 20, 16);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ny = v.y / 0.145;
      const nz = v.z / 0.145;
      if (ny < 0.05) {
        const t = Math.min(1, (0.05 - ny) / 0.9);
        const s = t * t;
        v.x *= 1 - s * 0.28;
        v.z += s * 0.01;
      }
      const cheek = Math.exp(-((ny + 0.02) ** 2) / 0.16) * Math.max(0, nz);
      v.x *= 1 + cheek * 0.04;
      if (nz < -0.2) v.z *= 0.94;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

function afroGeometry(full: boolean): THREE.BufferGeometry {
  return G(full ? "afroFull" : "afro", () => {
    const g = new THREE.IcosahedronGeometry(full ? 0.198 : 0.176, 1);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      if (n.z > 0.42 && n.y < 0.42) v.multiplyScalar(0.42);
      else v.multiplyScalar(1 + 0.075 * Math.sin(n.x * 17.0 + n.y * 9.0) * Math.cos(n.z * 13.0));
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

const UPPER_ARM = lathe("armUp", [
  [0.028, 0.01],
  [0.058, -0.03],
  [0.052, -0.14],
  [0.044, -0.26],
  [0.038, -LIMB.upperArm],
]);
const FORE_ARM = lathe("armLo", [
  [0.04, 0.01],
  [0.044, -0.05],
  [0.036, -0.15],
  [0.03, -LIMB.foreArm],
]);
const THIGH = lathe("thigh", [
  [0.04, 0.02],
  [0.092, -0.05],
  [0.084, -0.2],
  [0.064, -0.38],
  [0.056, -LIMB.thigh],
]);
const SHIN = lathe("shin", [
  [0.052, 0.01],
  [0.058, -0.08],
  [0.064, -0.18],
  [0.042, -0.34],
  [0.034, -LIMB.shin],
]);
const CHEST = lathe("chest", [
  [0.112, 0],
  [0.132, 0.08],
  [0.156, 0.2],
  [0.162, 0.32],
  [0.14, 0.42],
  [0.1, 0.5],
]);

let visorMat: THREE.MeshStandardMaterial | null = null;
function helmetVisor(): THREE.MeshStandardMaterial {
  if (!visorMat) {
    visorMat = new THREE.MeshStandardMaterial({
      color: 0x1a1c22,
      roughness: 0.06,
      metalness: 0.45,
      transparent: true,
      opacity: 0.72,
    });
  }
  return visorMat;
}

export function buildHumanoid(o: HumanOptions = {}): HumanoidRig {
  const skinM = M(o.skin ?? 0x6b4423, 0.58, 0, 0.05);
  const shirtM = M(o.shirt ?? 0xe67700, 0.82);
  const pantsM = M(o.pants ?? 0x343a40, 0.78);
  const shoeM = M(o.shoes ?? 0x24160c, 0.62, 0.04);
  const soleM = M(0x120e0c, 0.8);
  const hairM = M(o.hairColor ?? 0x14110e, 0.9);
  const darkM = M(0x1a120e, 0.45);
  const whiteM = M(0xf4f1ea, 0.35);
  const sleeveM = o.longSleeves ? shirtM : skinM;
  const shinM = o.shorts ? skinM : pantsM;
  const handM = o.gloves !== undefined ? M(o.gloves, 0.7, 0.02) : skinM;
  const detail = o.detail ?? "full";
  const bulk = o.bulk ?? 1;
  const fem = !!o.feminine;

  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = LIMB.hipsY;
  group.add(hips);

  const pelvis = part(G("pelvis", () => new THREE.SphereGeometry(0.13, 10, 8)), pantsM, 0, 0.02, 0);
  pelvis.scale.set(fem ? 1.38 : 1.18, 0.72, 0.95);
  hips.add(pelvis);
  const belt = part(G("belt", () => new THREE.CylinderGeometry(0.118, 0.122, 0.045, 10)), M(0x1a1a1a, 0.6), 0, 0.07, 0);
  belt.scale.x = fem ? 1.2 : 1.08;
  hips.add(belt);

  const torso = new THREE.Group();
  torso.position.y = 0.08;
  hips.add(torso);
  const chest = part(CHEST, shirtM, 0, 0, 0);
  chest.scale.set(fem ? 0.9 * bulk : bulk, 1, fem ? 0.92 : 0.98);
  torso.add(chest);
  const shoulders = part(
    G("shoulderBar", () => {
      const g = new THREE.CapsuleGeometry(0.046, 0.22, 3, 6);
      g.rotateZ(Math.PI / 2);
      return g;
    }),
    shirtM,
    0,
    0.4,
    0,
  );
  shoulders.scale.x = fem ? 0.88 * bulk : bulk;
  torso.add(shoulders);
  torso.add(part(G("collar", () => new THREE.TorusGeometry(0.078, 0.016, 5, 10)), shirtM, 0, 0.5, 0, false));

  if (o.apron) {
    const apron = part(
      G("apron", () => {
        const g = new THREE.SphereGeometry(0.12, 8, 6);
        g.scale(1.05, 1.35, 0.28);
        return g;
      }),
      M(o.apronColor ?? 0xe67700, 0.75),
      0,
      0.24,
      0.12,
    );
    torso.add(apron);
  }

  const neck = new THREE.Group();
  neck.position.y = 0.5;
  torso.add(neck);
  neck.add(part(G("neck", () => new THREE.CylinderGeometry(0.048, 0.058, 0.11, 8)), skinM, 0, 0.04, 0));

  const head = new THREE.Group();
  head.position.y = 0.09;
  neck.add(head);
  const skull = part(headGeometry(), skinM, 0, 0.13, 0);
  if (fem) skull.scale.set(0.96, 1.04, 0.98);
  head.add(skull);

  if (detail === "full") {
    for (const sx of [-1, 1] as const) {
      head.add(part(G("eyeW", () => new THREE.SphereGeometry(0.026, 8, 6)), whiteM, sx * 0.05, 0.158, 0.128, false));
      head.add(part(G("pupil", () => new THREE.SphereGeometry(0.014, 6, 5)), darkM, sx * 0.05, 0.158, 0.148, false));
      const brow = part(G("browC", () => {
        const g = new THREE.CapsuleGeometry(0.008, 0.042, 2, 4);
        g.rotateZ(Math.PI / 2);
        return g;
      }), hairM, sx * 0.052, 0.198, 0.132, false);
      brow.rotation.z = sx * -0.28;
      head.add(brow);
      const ear = part(G("ear", () => new THREE.SphereGeometry(0.028, 6, 5)), skinM, sx * 0.138, 0.125, -0.01, false);
      ear.scale.set(0.38, 0.85, 0.55);
      head.add(ear);
    }
    const nose = part(G("nose", () => {
      const g = new THREE.SphereGeometry(0.016, 6, 5);
      g.scale(0.7, 0.85, 1.35);
      return g;
    }), skinM, 0, 0.112, 0.148, false);
    head.add(nose);
    head.add(part(G("mouth", () => {
      const g = new THREE.TorusGeometry(0.026, 0.006, 4, 10, Math.PI * 0.9);
      g.rotateX(Math.PI / 2.15);
      return g;
    }), M(0x5a2a1c, 0.5), 0, 0.072, 0.138, false));
  } else {
    for (const sx of [-1, 1] as const) {
      head.add(part(G("eyeS", () => new THREE.SphereGeometry(0.02, 6, 5)), darkM, sx * 0.05, 0.158, 0.14, false));
    }
  }

  addHair(head, o.hair ?? "afro", hairM, o.capColor ?? 0x1971c2, fem);

  const shoulderX = 0.2 * (fem ? 0.9 : 1) * bulk;
  const armL = buildArm(torso, -1, shoulderX, shirtM, sleeveM, handM);
  const armR = buildArm(torso, 1, shoulderX, shirtM, sleeveM, handM);
  const hipX = 0.095 * (fem ? 1.12 : 1);
  const legL = buildLeg(hips, -1, hipX, pantsM, shinM, shoeM, soleM);
  const legR = buildLeg(hips, 1, hipX, pantsM, shinM, shoeM, soleM);

  group.scale.setScalar(o.scale ?? 1);
  return { group, hips, torso, neck, head, armL, armR, legL, legR };
}

function addHair(head: THREE.Group, hair: HairStyle, hairM: THREE.Material, capColor: number, fem: boolean) {
  switch (hair) {
    case "afro":
      head.add(part(afroGeometry(fem), hairM, 0, 0.17, -0.02));
      break;
    case "short":
      head.add(part(G("hairShort", () => new THREE.SphereGeometry(0.158, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58)), hairM, 0, 0.2, -0.015));
      break;
    case "wrap": {
      const wrapM = M(capColor, 0.7);
      const band = part(G("wrapBand", () => new THREE.TorusGeometry(0.15, 0.042, 6, 12)), wrapM, 0, 0.2, 0);
      band.rotation.x = Math.PI / 2;
      head.add(band);
      head.add(part(G("wrapKnot", () => new THREE.SphereGeometry(0.055, 7, 6)), wrapM, 0.1, 0.25, 0.02));
      head.add(part(G("wrapTop", () => new THREE.SphereGeometry(0.09, 8, 6)), wrapM, 0, 0.27, -0.01));
      break;
    }
    case "cap": {
      const capM = M(capColor, 0.65);
      head.add(part(G("capDome", () => new THREE.SphereGeometry(0.168, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), capM, 0, 0.2, -0.01));
      const brim = part(G("capBrim", () => {
        const g = new THREE.CylinderGeometry(0.09, 0.09, 0.016, 10);
        g.scale(1.45, 1, 0.7);
        return g;
      }), capM, 0, 0.15, 0.1);
      brim.rotation.x = 0.4;
      head.add(brim);
      break;
    }
    case "bald":
      break;
    default: {
      const neverStyle: never = hair;
      return neverStyle;
    }
  }
}

function buildArm(
  torso: THREE.Group,
  side: 1 | -1,
  shoulderX: number,
  shirtM: THREE.Material,
  sleeveM: THREE.Material,
  handM: THREE.Material,
) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * shoulderX, 0.4, 0);
  torso.add(shoulder);
  shoulder.add(part(UPPER_ARM, shirtM));
  const elbow = new THREE.Group();
  elbow.position.y = -LIMB.upperArm;
  shoulder.add(elbow);
  elbow.add(part(G("elbow", () => new THREE.SphereGeometry(0.04, 7, 6)), sleeveM));
  elbow.add(part(FORE_ARM, sleeveM));
  const hand = part(G("palm", () => {
    const g = new THREE.SphereGeometry(0.038, 8, 6);
    g.scale(0.85, 1.05, 0.62);
    return g;
  }), handM, 0, -LIMB.foreArm, 0);
  const thumb = part(G("thumb", () => {
    const g = new THREE.CapsuleGeometry(0.011, 0.028, 2, 4);
    g.rotateZ(Math.PI / 2);
    return g;
  }), handM, side * 0.03, 0.01, 0.012, false);
  thumb.rotation.z = side * 0.6;
  hand.add(thumb);
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
  knee.add(part(G("knee", () => new THREE.SphereGeometry(0.048, 7, 6)), shinM));
  knee.add(part(SHIN, shinM));
  const foot = part(G("shoeBody", () => {
    const g = new THREE.SphereGeometry(0.058, 8, 6);
    g.scale(1.05, 0.48, 1.75);
    g.translate(0, -0.028, 0.055);
    return g;
  }), shoeM, 0, -LIMB.shin, 0);
  foot.add(part(G("sole", () => {
    const g = new THREE.SphereGeometry(0.048, 6, 4);
    g.scale(1.08, 0.22, 1.7);
    g.translate(0, -0.05, 0.045);
    return g;
  }), soleM, 0, 0, 0, false));
  knee.add(foot);
  return { hip, knee, foot };
}

/** Open-face motorcycle helmet. Sits on the sculpted head (skull center y ≈ 0.13). */
export function buildHelmet(color = 0xf2e35c): THREE.Group {
  const g = new THREE.Group();
  const shellM = M(color, 0.28, 0.22);
  g.add(part(G("helmShell", () => {
    const geo = new THREE.SphereGeometry(0.188, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    geo.translate(0, 0.175, -0.02);
    return geo;
  }), shellM));
  const brim = part(G("helmBrim", () => {
    const geo = new THREE.CylinderGeometry(0.09, 0.09, 0.016, 10);
    geo.scale(1.4, 1, 0.48);
    return geo;
  }), shellM, 0, 0.155, 0.12);
  brim.rotation.x = 0.35;
  g.add(brim);
  g.add(part(G("helmShade", () => {
    const geo = new THREE.SphereGeometry(0.06, 8, 4);
    geo.scale(1.7, 0.28, 0.45);
    return geo;
  }), helmetVisor(), 0, 0.168, 0.145, false));
  const strap = part(G("helmStrap", () => new THREE.TorusGeometry(0.09, 0.012, 4, 8, Math.PI)), M(0x1a1a1a, 0.7), 0, 0.05, 0.04, false);
  strap.rotation.x = Math.PI / 2;
  g.add(strap);
  const rim = part(G("helmRim", () => new THREE.TorusGeometry(0.155, 0.014, 5, 14)), M(0x111111, 0.55), 0, 0.1, -0.01, false);
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  return g;
}

export function buildHandBag(color = 0xf2e35c): THREE.Mesh {
  return part(G("npc-bag", () => new THREE.BoxGeometry(0.22, 0.16, 0.12)), M(color, 0.55));
}

export function poseStanding(h: HumanoidRig) {
  h.armL.shoulder.rotation.set(0.08, 0, -0.1);
  h.armR.shoulder.rotation.set(0.08, 0, 0.1);
  h.armL.elbow.rotation.set(-0.18, 0, 0);
  h.armR.elbow.rotation.set(-0.18, 0, 0);
  h.legL.hip.rotation.set(0, 0, -0.03);
  h.legR.hip.rotation.set(0, 0, 0.03);
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
  const s2 = Math.sin(t * cadence + Math.PI);
  h.legL.hip.rotation.set(s * 0.55, 0, -0.04);
  h.legR.hip.rotation.set(s2 * 0.55, 0, 0.04);
  h.legL.knee.rotation.x = Math.max(0, -s) * 1.05;
  h.legR.knee.rotation.x = Math.max(0, -s2) * 1.05;
  h.armL.shoulder.rotation.set(s2 * 0.5, 0, -0.1);
  h.armR.shoulder.rotation.set(s * 0.5, 0, 0.1);
  h.armL.elbow.rotation.x = -0.28 + Math.min(0, s2) * 0.35;
  h.armR.elbow.rotation.x = -0.28 + Math.min(0, s) * 0.35;
  h.hips.rotation.set(0, s * 0.08, s * 0.03);
  h.torso.rotation.set(0.05, s * 0.1, -s * 0.03);
  h.neck.rotation.set(0, s * 0.04, 0);
  h.head.rotation.set(0, Math.sin(t * cadence * 0.5) * 0.12, 0);
  h.group.position.y = Math.abs(Math.cos(t * cadence)) * 0.04;
  plantFeet(h);
}

export function animateIdle(h: HumanoidRig, t: number, seed = 0) {
  poseStanding(h);
  const b = t * 1.6 + seed;
  h.torso.rotation.x = 0.02 + Math.sin(b) * 0.018;
  h.torso.rotation.z = Math.sin(b * 0.55) * 0.02;
  h.hips.rotation.z = Math.sin(b * 0.4) * 0.015;
  h.head.rotation.y = Math.sin(t * 0.35 + seed * 2) * 0.4;
  h.head.rotation.x = Math.sin(t * 0.5 + seed) * 0.05;
  h.armL.shoulder.rotation.x = 0.08 + Math.sin(b) * 0.04;
  h.armR.shoulder.rotation.x = 0.08 + Math.sin(b + 1) * 0.04;
  plantFeet(h);
}

export function animateWave(h: HumanoidRig, t: number) {
  poseStanding(h);
  h.armR.shoulder.rotation.set(0.15, 0, 2.35);
  h.armR.elbow.rotation.z = Math.sin(t * 9) * 0.45;
  h.head.rotation.z = 0.08;
  h.head.rotation.y = 0.2;
  h.torso.rotation.z = -0.05;
  plantFeet(h);
}

/** Parcel hand-off — the left hand (the one holding the bag) reaches out. */
export function animateHandoff(h: HumanoidRig, t: number) {
  poseStanding(h);
  h.armL.shoulder.rotation.set(-1.2, 0.25, -0.35);
  h.armL.elbow.rotation.x = -0.3 + Math.sin(t * 3) * 0.05;
  h.armR.shoulder.rotation.set(-0.65, -0.1, 0.25);
  h.armR.elbow.rotation.x = -0.45;
  h.torso.rotation.set(0.12, -0.18, 0);
  h.head.rotation.set(0.1, -0.2, 0);
  plantFeet(h);
}

/** Customer receives with both hands up. */
export function animateReceive(h: HumanoidRig, t: number) {
  poseStanding(h);
  const bob = Math.sin(t * 3) * 0.04;
  h.armL.shoulder.rotation.set(-1.0, -0.2, -0.4);
  h.armR.shoulder.rotation.set(-1.0, 0.2, 0.4);
  h.armL.elbow.rotation.x = -0.5 + bob;
  h.armR.elbow.rotation.x = -0.5 - bob;
  h.torso.rotation.x = 0.08;
  h.head.rotation.set(0.12, 0, 0);
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
  /** Bike frame the feet align to while rolling. */
  frame: THREE.Object3D;
  /** Chest-height reach target during a hand-off. Feet origin is fine; Y is lifted. */
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

/** Flat feet: local +Z is the toe, local +Y is up, both expressed in world axes. */
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

  const cosShoulder = THREE.MathUtils.clamp(
    (upperLen * upperLen + dist * dist - lowerLen * lowerLen) / (2 * upperLen * dist),
    -1, 1,
  );
  const shoulderBend = Math.acos(cosShoulder);

  _bend.subVectors(pole, pivot.position);
  _x.crossVectors(_to, _bend);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  else _x.normalize();

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
  if (_z.lengthSq() < 1e-8) {
    _x.set(0, 0, 1);
    _z.crossVectors(_x, _yAx);
  }
  _z.normalize();
  _x.crossVectors(_yAx, _z).normalize();
  _m4.makeBasis(_x, _yAx, _z);
  mid.quaternion.setFromRotationMatrix(_m4);
}

function aimBone(
  parent: THREE.Object3D,
  pivot: THREE.Object3D,
  mid: THREE.Object3D,
  worldPoint: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
  poleOffset: THREE.Vector3,
) {
  parent.updateWorldMatrix(true, false);
  _p.copy(worldPoint);
  parent.worldToLocal(_p);
  _pole.copy(pivot.position).add(poleOffset);
  solveTwoBone(pivot, mid, upperLen, lowerLen, _p, _pole);
}

/** Seated rider: torso reacts to speed, IK keeps hands and feet planted. */
export function poseRider(h: HumanoidRig, a: RiderPose, anchors: RiderAnchors) {
  const k = Math.min(1, a.dt * 6);
  const stopped = a.stopped;
  const braking = a.braking && !stopped;
  const boost = a.boost && !stopped;
  let pitch = 0.22;
  if (stopped) pitch = 0.08;
  else if (braking) pitch = 0.02;
  else if (boost) pitch = 0.4;
  const freq = stopped ? 2.2 : 8 + Math.min(7, Math.abs(a.speed) * 0.35);
  const amp = stopped ? 0.012 : 0.01 + Math.min(0.018, Math.abs(a.speed) * 0.0007);
  pitch += Math.sin(a.t * freq) * amp;

  const lean = -a.steer * (stopped ? 0.04 : 0.18);
  h.torso.rotation.x += (pitch - h.torso.rotation.x) * k;
  h.torso.rotation.z += (lean - h.torso.rotation.z) * k;
  h.torso.rotation.y += (0 - h.torso.rotation.y) * k;
  h.neck.rotation.x += (pitch * 0.22 - h.neck.rotation.x) * k;
  h.hips.position.y = LIMB.hipsY + Math.sin(a.t * freq) * amp * 0.6;

  anchors.gripL.getWorldPosition(_fwd);
  aimBone(h.torso, h.armL.shoulder, h.armL.elbow, _fwd, LIMB.upperArm, LIMB.foreArm, POLE_ARM_L);

  const reaching = a.interact !== "none" && anchors.reach;
  if (reaching && anchors.reach) {
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
    h.head.rotation.x += (-pitch * 0.75 - h.head.rotation.x) * k;
    h.head.rotation.y += (-a.steer * 0.4 - h.head.rotation.y) * k;
  }
  h.head.rotation.z += (a.steer * 0.06 - h.head.rotation.z) * k;

  const footL = stopped ? anchors.footDown : anchors.pegL;
  footL.getWorldPosition(_fwd);
  aimBone(h.hips, h.legL.hip, h.legL.knee, _fwd, LIMB.thigh, LIMB.shin, POLE_LEG_L);
  anchors.pegR.getWorldPosition(_fwd);
  aimBone(h.hips, h.legR.hip, h.legR.knee, _fwd, LIMB.thigh, LIMB.shin, POLE_LEG_R);

  anchors.frame.updateWorldMatrix(true, false);
  _fwd.set(0, 0, 1).transformDirection(anchors.frame.matrixWorld);
  if (stopped) _up.set(0, 1, 0);
  else _up.set(0, 1, 0).transformDirection(anchors.frame.matrixWorld);
  orientAppendage(h.legL.foot, h.legL.knee, _fwd, _up);
  orientAppendage(h.legR.foot, h.legR.knee, _fwd, _up);
}
