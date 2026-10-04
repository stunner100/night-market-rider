import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { buildingTexture, trotroTexture, corrugatedTexture, woodTexture, carPaintTexture } from "./textures";

const loader = new GLTFLoader();
const modelCache = new Map<string, THREE.Group>();
const pendingLoads = new Map<string, Promise<THREE.Group>>();

export function loadModel(path: string): Promise<THREE.Group> {
  const cached = modelCache.get(path);
  if (cached) return Promise.resolve(cached.clone(true));
  const pending = pendingLoads.get(path);
  if (pending) return pending.then((g) => g.clone(true));
  const p = new Promise<THREE.Group>((resolve, reject) => {
    loader.load(path, (gltf) => {
      const root = gltf.scene;
      root.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      modelCache.set(path, root); pendingLoads.delete(path); resolve(root.clone(true));
    }, undefined, (err) => { pendingLoads.delete(path); reject(err); });
  });
  pendingLoads.set(path, p);
  return p;
}

const pbr = (color: number, roughness = 0.65, metalness = 0.06) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const paint = (color: number) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22 });
const glass = (color = 0x20303e, opacity = 0.78) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, metalness: 0.08, transparent: true, opacity, clearcoat: 0.75, clearcoatRoughness: 0.08 });
const rb = (w: number, h: number, d: number, r = 0.1) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * .22, h * .22, d * .22));
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = .08) {
  const m = new THREE.Mesh(rb(w, h, d, r), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
function wheel(g: THREE.Group, x: number, z: number, radius: number, tire: THREE.Material, rim: THREE.Material) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .28, 20), tire); t.rotation.z = Math.PI / 2; t.position.set(x, radius, z); t.castShadow = true; t.name = "wheel";
  const r = new THREE.Mesh(new THREE.CylinderGeometry(radius * .56, radius * .56, .30, 16), rim); r.rotation.z = Math.PI / 2; r.position.set(x, radius, z); r.castShadow = true; r.name = "wheel-rim";
  g.add(t, r);
}
function lamps(g: THREE.Group, frontZ: number, rearZ: number, y: number, span: number) {
  const head = new THREE.MeshStandardMaterial({ color: 0xfff2bf, roughness: .15, emissive: 0xffd17a, emissiveIntensity: .45 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8f1111, roughness: .2, emissive: 0x550000, emissiveIntensity: .45 });
  for (const x of [-span, span]) { g.add(box(.38, .17, .06, head, x, y, frontZ, .025)); g.add(box(.38, .17, .06, tail, x, y, rearZ, .025)); }
}
function brake(g: THREE.Group, z: number, y: number, w = 1.1) { const m = box(w, .12, .045, new THREE.MeshBasicMaterial({ color: 0x550000 }), 0, y, z, .02); m.name = "brake"; g.add(m); }

export function createTrotroMesh(): THREE.Group {
  const g = new THREE.Group(); g.name = "Trotro";
  const body = paint(0xf7f8f9); body.map = trotroTexture(); const dark = pbr(0x171b1e, .78, .18); const chrome = pbr(0xdfe3e6, .16, .9); const green = pbr(0x268a4b, .46); const yellow = pbr(0xf4c542, .46); const win = glass();
  g.add(box(2.32, 1.75, 5.02, body, 0, 1.38, 0, .22), box(2.34, .36, 4.95, dark, 0, .63, 0, .07), box(2.24, .9, .76, body, 0, 1.15, 2.55, .18));
  const wind = box(2.03, .76, .045, win, 0, 1.82, 2.55, .02); wind.rotation.x = -.12; g.add(wind, box(1.52, .23, .07, yellow, 0, 2.25, 2.51, .03));
  for (const s of [-1, 1]) { const x = s * 1.17; g.add(box(.035, .15, 4.55, green, x, 1.16, 0, .01), box(.035, .08, 4.55, yellow, x, .91, 0, .01)); for (const z of [-1.42, -.55, .32, 1.19]) g.add(box(.03, .61, .72, win, x, 1.78, z, .01)); }
  g.add(box(2.23, .15, 4.82, body, 0, 2.31, 0, .08)); for (const x of [-.82, .82]) g.add(box(.055, .09, 3.6, dark, x, 2.48, -.1, .02)); for (const z of [-1.65, -.55, .55, 1.65]) g.add(box(1.75, .06, .05, dark, 0, 2.49, z, .02));
  g.add(box(.72, .32, .88, pbr(0x845ef7, .78), -.38, 2.68, .15, .07), box(.62, .27, .72, pbr(0xd9480f, .78), .38, 2.65, -.55, .07));
  lamps(g, 2.93, -2.57, .92, .69); brake(g, -2.58, .78, 1.2); for (const [x, z] of [[-1.12, 1.55], [1.12, 1.55], [-1.12, -1.55], [1.12, -1.55]] as const) wheel(g, x, z, .42, dark, chrome); return g;
}

function sedanBase(name: string, color: number, taxi = false): THREE.Group {
  const g = new THREE.Group(); g.name = name; const body = paint(color); body.map = carPaintTexture("#" + color.toString(16).padStart(6, "0")); const dark = pbr(0x14171a, .8, .12); const chrome = pbr(0xe4e7ea, .15, .9); const win = glass(); const accent = taxi ? paint(0xf59f00) : body;
  g.add(box(1.86, .62, 4.14, body, 0, .75, 0, .2), box(1.72, .34, .92, accent, 0, 1.02, 1.56, .15), box(1.72, .32, .84, accent, 0, 1.01, -1.65, .15), box(1.56, .66, 2.16, body, 0, 1.34, -.12, .16));
  const fw = box(1.43, .54, .045, win, 0, 1.39, .94, .02); fw.rotation.x = -.28; const rw = box(1.43, .49, .045, win, 0, 1.39, -1.14, .02); rw.rotation.x = .23; g.add(fw, rw);
  for (const s of [-1, 1]) { const x = s * .795; for (const z of [-.58, .36]) g.add(box(.03, .46, .68, win, x, 1.38, z, .01)); g.add(box(.035, .05, 1.9, chrome, x, 1.05, -.05, .01)); }
  if (taxi) g.add(box(.66, .19, .27, pbr(0xffd43b, .35), 0, 1.82, -.08, .05));
  lamps(g, 2.11, -2.11, .8, .58); brake(g, -2.13, .93); for (const [x, z] of [[-.95, 1.37], [.95, 1.37], [-.95, -1.37], [.95, -1.37]] as const) wheel(g, x, z, .38, dark, chrome); return g;
}
export const createTaxiMesh = () => sedanBase("GhanaTaxi", 0x1769aa, true);
export const createCarMesh = (colorHex = 0xc92a2a) => sedanBase("Sedan", colorHex, false);

export function createBusMesh(): THREE.Group {
  const g = new THREE.Group(); g.name = "Bus"; const body = paint(0xd9480f); const cream = pbr(0xf1f3f5, .55); const dark = pbr(0x17191b, .8, .16); const chrome = pbr(0xdde2e6, .15, .9); const win = glass();
  g.add(box(2.42, 2.28, 7.65, body, 0, 1.62, 0, .24), box(2.44, .30, 7.58, cream, 0, 1.02, 0, .06)); const f = box(2.18, 1.04, .05, win, 0, 2.03, 3.82, .02); f.rotation.x = -.04; g.add(f);
  for (const s of [-1, 1]) for (const z of [-2.65, -1.68, -.71, .26, 1.23, 2.2]) g.add(box(.03, .72, .77, win, s * 1.218, 2.03, z, .01));
  lamps(g, 3.88, -3.88, 1.08, .73); brake(g, -3.9, 1.28, 1.42); for (const [x, z] of [[-1.16, 2.55], [1.16, 2.55], [-1.16, -2.55], [1.16, -2.55]] as const) wheel(g, x, z, .48, dark, chrome); return g;
}

function facade(g: THREE.Group, width: number, floors: number, cols: number, frontZ: number, y0: number, stepY: number) {
  const trim = pbr(0x404850, .55, .12), win = glass(0x26394a, .8); const usable = width - 1.3, dx = usable / cols;
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) { const x = -usable / 2 + dx * (c + .5), y = y0 + f * stepY; g.add(box(dx * .62, .94, .08, trim, x, y, frontZ, .02), box(dx * .54, .79, .1, win, x, y, frontZ + .03, .02)); }
}
export function createLegonHallMesh(): THREE.Group { const g = new THREE.Group(); g.name = "LegonHall"; const wall = pbr(0xf0eadf, .82); wall.map = buildingTexture("#f0eadf", 3, 8); const roof = pbr(0xa85738, .7); g.add(box(14, 7, 8, wall, 0, 3.5, 0, .12)); const r = new THREE.Mesh(new THREE.ConeGeometry(10.5, 3.1, 4), roof); r.position.y = 8.55; r.rotation.y = Math.PI / 4; r.castShadow = true; g.add(r); facade(g, 12.6, 2, 6, 4.04, 2.15, 2.15); for (const x of [-2.7, -.9, .9, 2.7]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, 5.7, 14), pbr(0xf8f9fa, .7)); c.position.set(x, 3.15, 5.45); c.castShadow = true; g.add(c); } return g; }
export function createCompoundHouseMesh(): THREE.Group { const g = new THREE.Group(); g.name = "CompoundHouse"; const wall = pbr(0xfff3bf, .82); wall.map = buildingTexture("#fff3bf", 3, 5); const b = pbr(0x59616a, .72), gate = pbr(0x212529, .42, .75); g.add(box(4.8, 2.4, .34, b, -4.6, 1.2, 6), box(4.8, 2.4, .34, b, 4.6, 1.2, 6), box(14, 2.4, .34, b, 0, 1.2, -6), box(.34, 2.4, 12, b, -7, 1.2, 0), box(.34, 2.4, 12, b, 7, 1.2, 0), box(3.95, 2.15, .13, gate, 0, 1.08, 6.02), box(9, 6, 8, wall, 0, 3, -.55, .13)); facade(g, 8.2, 2, 3, 3.47, 2, 2.05); const tank = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, 1.4, 18), pbr(0x151719, .62)); tank.position.set(3.2, 7.35, -3.2); g.add(tank); return g; }
export function createCommercialShopMesh(): THREE.Group { const g = new THREE.Group(); g.name = "CommercialShop"; const wall = pbr(0xdbe4ff, .8); wall.map = buildingTexture("#dbe4ff", 4, 6); const dark = pbr(0x3f4750, .52, .16), awn = pbr(0xc92a2a, .68), sign = pbr(0xf2e35c, .45); g.add(box(8, 8, 7, wall, 0, 4, 0, .14)); facade(g, 7.4, 2, 4, 3.54, 4.55, 1.55); g.add(box(7.75, 3.05, .2, dark, 0, 1.55, 3.56), box(5.2, .68, .18, sign, 0, 3.66, 3.72)); const shade = box(7.2, .1, 1.62, awn, 0, 3.12, 4.15, .03); shade.rotation.x = -.2; g.add(shade); return g; }
export function createMarketStallMesh(): THREE.Group { const g = new THREE.Group(); g.name = "MarketStall"; const wood = pbr(0x6b4226, .9); wood.map = woodTexture(); const tin = pbr(0xadb5bd, .55, .28); tin.map = corrugatedTexture("#adb5bd"); for (const [x, z] of [[-1.42, -1.02], [1.42, -1.02], [-1.42, 1.02], [1.42, 1.02]] as const) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 2.65, 8), wood); p.position.set(x, 1.33, z); g.add(p); } const roof = box(3.3, .08, 2.48, tin, 0, 2.66, 0, .025); roof.rotation.x = -.12; g.add(roof, box(2.82, .88, 1.34, wood, 0, .44, .22)); return g; }
export function createChopBarMesh(): THREE.Group { const g = createMarketStallMesh(); g.name = "ChopBar"; g.scale.set(1.45, 1.08, 1.35); const pot = new THREE.Mesh(new THREE.CylinderGeometry(.37, .31, .5, 14), pbr(0xd5d9dd, .24, .8)); pot.position.set(-.9, .62, -.5); g.add(pot); return g; }
export function createMoMoKioskMesh(): THREE.Group { const g = new THREE.Group(); g.name = "MoMoKiosk"; const yellow = pbr(0xffcc00, .44), navy = pbr(0x073763, .44), dark = pbr(0x212529, .6, .7); g.add(box(1.86, 2.46, 1.86, yellow, 0, 1.23, 0, .09), box(1.9, .36, 1.9, navy, 0, .22, 0), box(1.14, .94, .1, dark, 0, 1.44, .95), box(1.34, .1, .42, navy, 0, .95, 1.16), box(1.62, .38, .1, navy, 0, 2.22, .96)); return g; }

export function createStreetlightMesh(): THREE.Group { const g = new THREE.Group(); g.name = "Streetlight"; const steel = pbr(0x7e8790, .38, .78), lm = new THREE.MeshStandardMaterial({ color: 0xfff3bf, roughness: .18, emissive: 0xffd77d, emissiveIntensity: .18 }); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .18, 8.5, 12), steel); pole.position.y = 4.25; pole.castShadow = true; const arm = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 2.4, 10), steel); arm.position.set(.95, 8.36, 0); arm.rotation.z = -Math.PI / 3; const bulb = box(.58, .07, .26, lm, 1.86, 8.57, 0, .02); bulb.name = "lamp"; g.add(pole, arm, bulb); return g; }
export function createPowerPoleMesh(): THREE.Group { const g = new THREE.Group(); g.name = "PowerPole"; const wood = pbr(0x5c4033, .9); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 9.5, 10), wood); pole.position.y = 4.75; pole.castShadow = true; g.add(pole, box(2.5, .12, .12, wood, 0, 9.08, 0)); return g; }
export function createTrafficLightMesh(): THREE.Group { const g = new THREE.Group(); g.name = "TrafficLight"; const dark = pbr(0x343a40, .45, .8); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 6.5, 10), dark); pole.position.y = 3.25; const arm = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, 3.6, 10), dark); arm.rotation.z = Math.PI / 2; arm.position.set(1.78, 6.18, 0); g.add(pole, arm, box(.48, 1.34, .44, dark, 3.28, 5.78, 0)); for (const [c, y] of [[0xff2b2b, 6.16], [0xffc107, 5.78], [0x2fb344, 5.4]] as const) { const m = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .16 })); m.scale.z = .35; m.position.set(3.28, y, .24); g.add(m); } return g; }
export function createRoadBarrierMesh(): THREE.Group { const g = new THREE.Group(); g.name = "RoadBarrier"; const c = pbr(0xaeb5bc, .86), red = pbr(0xe03131, .6); g.add(box(3, .9, .62, c, 0, .45, 0)); for (const x of [-.92, 0, .92]) { const s = box(.36, .82, .64, red, x, .46, 0, .025); s.rotation.z = -.12; g.add(s); } return g; }
export function createPalmTreeMesh(): THREE.Group { const g = new THREE.Group(); g.name = "PalmTree"; const trunk = pbr(0x795548, .9), leaf = pbr(0x2f9e44, .68); const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(.15, 2.5, .08), new THREE.Vector3(.48, 5, .24), new THREE.Vector3(.72, 7.2, .36)]); const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, .23, 10, false), trunk); t.castShadow = true; g.add(t); const f = new THREE.ConeGeometry(.56, 3.4, 6); f.translate(0, 1.7, 0); for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(f, leaf); m.position.set(.72, 7.23, .36); m.rotation.y = i / 9 * Math.PI * 2; m.rotation.z = Math.PI / 3.15; m.castShadow = true; g.add(m); } return g; }
export function createShadeTreeMesh(): THREE.Group { const g = new THREE.Group(); g.name = "ShadeTree"; const bark = pbr(0x4a2e18, .9), a = pbr(0x2b8a3e, .72), b = pbr(0x237a35, .76); const t = new THREE.Mesh(new THREE.CylinderGeometry(.34, .55, 3.6, 10), bark); t.position.y = 1.8; t.castShadow = true; g.add(t); const blobs = [[0, 4.5, 0, 2.35], [-1.25, 4.15, .62, 1.75], [1.28, 4.3, -.52, 1.82], [.42, 4.9, 1.05, 1.62], [-.54, 5.25, -.82, 1.55], [.05, 6.05, .04, 1.48]]; blobs.forEach(([x, y, z, s], i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), i % 2 ? a : b); m.position.set(x, y, z); m.castShadow = true; g.add(m); }); return g; }
export function createGoatMesh(): THREE.Group { const g = new THREE.Group(); g.name = "Goat"; const fur = pbr(0xe9ecef, .86), brown = pbr(0x795548, .86); const body = new THREE.Mesh(new THREE.SphereGeometry(.38, 10, 8), fur); body.scale.set(1.55, .84, .78); body.position.y = .52; body.castShadow = true; const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 9, 7), fur); head.scale.set(1.32, 1, .86); head.position.set(.64, .84, 0); g.add(body, head); const patch = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), brown); patch.position.set(.1, .68, .1); g.add(patch); for (const [x, z] of [[-.3, -.16], [-.3, .16], [.3, -.16], [.3, .16]] as const) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.045, .052, .46, 7), fur); leg.position.set(x, .23, z); g.add(leg); } return g; }

export function clearModelCache() {
  modelCache.forEach((m) => m.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach((x) => x.dispose()); else o.material.dispose(); } }));
  modelCache.clear(); pendingLoads.clear();
}
