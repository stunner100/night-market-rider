import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { nightMarketTexture, textTexture } from "./textures";
import { buildHumanoid, buildHelmet, HumanoidRig } from "./characters";

/**
 * Hand-built delivery bikes at real-world proportions. Each model has its own
 * frame, wheels, engine, bodywork, controls and riding position; the rider's
 * arms and legs reach for that bike's grips and pegs, so posture follows the bike.
 */
export interface RiderRig {
  group: THREE.Group; lean: THREE.Group; body: THREE.Group;
  frontWheel: THREE.Mesh; rearWheel: THREE.Mesh; brakeLight: THREE.Mesh;
  headlight: THREE.SpotLight; exhaust: THREE.Object3D; boxLid: THREE.Mesh;
  rider?: HumanoidRig; gripL: THREE.Object3D; gripR: THREE.Object3D;
  pegL: THREE.Object3D; pegR: THREE.Object3D; footDown: THREE.Object3D;
  /** Extra forward lean of the rider's torso for this bike (sport bikes tuck). */
  crouch: number;
  model: BikeModel;
}

export type BikeModel = "ace" | "haojue" | "scooter" | "apsonic";

const NM_YELLOW = 0xf2e35c;

const pbr = (color: number, roughness = .62, metalness = .06) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const paint = (color: number, roughness = .24) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness: .12, clearcoat: .78, clearcoatRoughness: .18 });
const rb = (w: number, h: number, d: number, r = .08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * .22, h * .22, d * .22));
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = .06) { const m = new THREE.Mesh(rb(w, h, d, r), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(rt: number, rbm: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rbm, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; return m; }
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, seg = 10) { const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length(); const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); m.castShadow = true; m.receiveShadow = true; return m; }

/** Real-world proportions (metres). z forward, y up, ground at 0. */
interface Spec {
  frontZ: number; rearZ: number;
  frontR: number; rearR: number; tireW: number; rearTireW: number;
  wheel: "spoke" | "cast" | "scooter";
  steerHead: THREE.Vector3;
  bar: { y: number; z: number; half: number; clipOn?: boolean };
  seat: { top: number; z: number; length: number };
  pegs: { y: number; z: number; x: number };
  box: { y: number; z: number; scale: number };
  lamp: THREE.Vector3;
  tail: THREE.Vector3;
  crouch: number;
}

const SPECS: Record<BikeModel, Spec> = {
  // Honda Ace 125 / CB125-style commuter: 18" wire wheels, upright, flat bench.
  ace: {
    frontZ: .64, rearZ: -.63, frontR: .31, rearR: .32, tireW: .085, rearTireW: .095, wheel: "spoke",
    steerHead: V(0, .98, .45), bar: { y: 1.08, z: .36, half: .36 }, seat: { top: .79, z: -.2, length: .7 },
    pegs: { y: .3, z: -.02, x: .2 }, box: { y: 0, z: -.6, scale: .6 }, lamp: V(0, .98, .6), tail: V(0, .82, -.88), crouch: -.04,
  },
  // Haojue Express 150: 17" cast wheels, modern commuter panels.
  haojue: {
    frontZ: .66, rearZ: -.64, frontR: .3, rearR: .31, tireW: .09, rearTireW: .11, wheel: "cast",
    steerHead: V(0, 1.0, .46), bar: { y: 1.09, z: .37, half: .37 }, seat: { top: .79, z: -.22, length: .72 },
    pegs: { y: .31, z: -.03, x: .21 }, box: { y: 0, z: -.62, scale: .62 }, lamp: V(0, .99, .62), tail: V(0, .84, -.9), crouch: 0,
  },
  // 110 cc scooter: 10" wheels, step-through floorboard, upright.
  scooter: {
    frontZ: .64, rearZ: -.6, frontR: .23, rearR: .23, tireW: .1, rearTireW: .11, wheel: "scooter",
    steerHead: V(0, .92, .5), bar: { y: 1.04, z: .42, half: .34 }, seat: { top: .76, z: -.22, length: .66 },
    pegs: { y: .3, z: .2, x: .13 }, box: { y: 0, z: -.56, scale: .74 }, lamp: V(0, .95, .62), tail: V(0, .76, -.82), crouch: -.12,
  },
  // 200 cc faired sport bike: low clip-ons, rear-set pegs, wide 17" tyres.
  apsonic: {
    frontZ: .7, rearZ: -.66, frontR: .3, rearR: .31, tireW: .11, rearTireW: .15, wheel: "cast",
    steerHead: V(0, .9, .5), bar: { y: .9, z: .42, half: .3, clipOn: true }, seat: { top: .8, z: -.2, length: .5 },
    pegs: { y: .36, z: -.2, x: .2 }, box: { y: 0, z: -.6, scale: .56 }, lamp: V(0, .88, .78), tail: V(0, .93, -.86), crouch: .32,
  },
};

export function buildRider(model: BikeModel = "ace"): RiderRig {
  const spec = SPECS[model];
  const group = new THREE.Group();
  const lean = new THREE.Group();
  const bike = new THREE.Group();
  const body = new THREE.Group();
  group.add(lean); lean.add(bike, body);

  const frameMat = pbr(0x11151a, .34, .72), chrome = pbr(0xd9dde0, .14, .88), black = pbr(0x0d1013, .84), rubber = pbr(0x050607, .97);
  const engineMat = pbr(0x3a3f45, .42, .7), alloy = pbr(0xb8bec4, .3, .75), exhaustMat = pbr(0xb9aaa0, .26, .78), seatMat = pbr(0x151719, .9);

  const { frontWheel, rearWheel } = wheels();
  forkAndSwingarm();
  ({ ace, haojue, scooter: scooterBody, apsonic: sportBody })[model]();
  const { gripL, gripR } = controls();
  const { brakeLight, headlight, exhaust } = lights();
  const { pegL, pegR, footDown } = feet();
  const rider = mountRider();
  const boxLid = deliveryBox();
  plate();
  batchStatic();

  return { group, lean, body, frontWheel, rearWheel, brakeLight, headlight, exhaust, boxLid, rider, gripL, gripR, pegL, pegR, footDown, crouch: spec.crouch, model };

  // ---------- shared parts ----------
  function wheels() {
    function make(z: number, r: number, w: number, front: boolean) {
      const tireGeo = new THREE.TorusGeometry(r - w / 2, w / 2, 12, 34); tireGeo.rotateY(Math.PI / 2);
      const wheel = new THREE.Mesh(tireGeo, rubber); wheel.name = "wheel"; wheel.position.set(0, r, z); wheel.castShadow = true; wheel.receiveShadow = true;
      const rimR = r - w * .95;
      const rimGeo = new THREE.TorusGeometry(rimR, .014, 8, 30); rimGeo.rotateY(Math.PI / 2);
      const rimMat = spec.wheel === "spoke" ? chrome : model === "apsonic" ? paint(0xe8590c, .3) : model === "scooter" ? pbr(0x2b2f33, .4, .5) : alloy;
      const rim = new THREE.Mesh(rimGeo, rimMat); rim.name = "wheel-rim"; wheel.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheel === "spoke" ? .075 : .05, spec.wheel === "spoke" ? .075 : .05, w * 1.2, 16), spec.wheel === "spoke" ? alloy : black);
      hub.rotation.z = Math.PI / 2; wheel.add(hub);
      if (spec.wheel === "spoke") {
        // 36 laced wire spokes, alternating sides of the hub.
        for (let i = 0; i < 36; i++) {
          const a = i / 36 * Math.PI * 2, side = i % 2 ? .03 : -.03;
          wheel.add(tube(V(side, Math.sin(a) * .07, Math.cos(a) * .07), V(0, Math.sin(a + .35) * rimR, Math.cos(a + .35) * rimR), .0035, chrome, 4));
        }
      } else {
        // Cast or scooter wheel: solid spokes (5 for cast, a disc face for scooters).
        const n = spec.wheel === "cast" ? 5 : 6;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          const s = new THREE.Mesh(new THREE.BoxGeometry(.03, rimR * (spec.wheel === "cast" ? .95 : .9), spec.wheel === "cast" ? .045 : .07), rimMat);
          s.position.set(0, Math.sin(a) * rimR * .47, Math.cos(a) * rimR * .47); s.rotation.x = -a; wheel.add(s);
        }
      }
      // Brakes: disc on cast front wheels, drums elsewhere.
      if (front && spec.wheel !== "spoke") { const disc = new THREE.Mesh(new THREE.CylinderGeometry(rimR * .78, rimR * .78, .008, 30), pbr(0xc7cdd2, .2, .9)); disc.rotation.z = Math.PI / 2; disc.position.x = -.06; wheel.add(disc); }
      else { const drum = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .05, 18), alloy); drum.rotation.z = Math.PI / 2; drum.position.x = front ? -.05 : .05; wheel.add(drum); }
      bike.add(wheel); return wheel;
    }
    return { frontWheel: make(spec.frontZ, spec.frontR, spec.tireW, true), rearWheel: make(spec.rearZ, spec.rearR, spec.rearTireW, false) };
  }

  function forkAndSwingarm() {
    const h = spec.steerHead;
    const fork = model === "apsonic" ? pbr(0xd7a72d, .22, .72) : model === "scooter" ? black : chrome;
    for (const x of [-.09, .09]) {
      bike.add(tube(V(x, h.y + .05, h.z), V(x, spec.frontR, spec.frontZ), model === "scooter" ? .028 : .022, fork, 10));
      if (spec.wheel === "spoke") bike.add(tube(V(x, spec.frontR + .2, spec.frontZ - .06), V(x, spec.frontR + .02, spec.frontZ - .01), .03, black, 8)); // fork gaiters
    }
    if (model !== "scooter") {
      // Swingarm and twin rear shocks (mono-shock on the sport bike).
      for (const x of [-.1, .1]) bike.add(tube(V(x, .4, -.05), V(x, spec.rearR, spec.rearZ), .022, frameMat));
      if (model === "apsonic") bike.add(tube(V(0, .45, -.1), V(0, .78, -.35), .03, pbr(0xe03131, .3, .4)));
      else for (const x of [-.12, .12]) {
        bike.add(tube(V(x, spec.rearR + .05, spec.rearZ + .05), V(x, .8, -.42), .028, chrome));
        bike.add(tube(V(x, spec.rearR + .2, spec.rearZ + .12), V(x, .68, -.34), .036, black)); // spring body
      }
    }
  }

  function controls() {
    const b = spec.bar;
    if (b.clipOn) {
      // Clip-ons: two short bars low and forward off the fork tops.
      for (const s of [-1, 1]) bike.add(tube(V(s * .09, b.y + .02, b.z + .06), V(s * b.half, b.y, b.z), .016, black, 8));
    } else {
      const handle = cyl(.014, .014, b.half * 2 - .1, 10, chrome, 0, b.y, b.z); handle.rotation.z = Math.PI / 2; bike.add(handle);
      bike.add(tube(V(0, spec.steerHead.y + .05, spec.steerHead.z), V(0, b.y, b.z), .025, chrome, 8));
    }
    for (const s of [-1, 1]) {
      const grip = cyl(.019, .019, .12, 10, black, s * (b.half - .03), b.y, b.z); grip.rotation.z = Math.PI / 2; bike.add(grip);
      bike.add(box(.04, .02, .12, black, s * (b.half - .12), b.y + .02, b.z + .05, .008)); // levers
      if (!b.clipOn) {
        bike.add(tube(V(s * (b.half - .14), b.y + .02, b.z), V(s * (b.half - .05), b.y + .3, b.z - .03), .007, chrome, 6));
        const mirror = model === "ace" ? cyl(.055, .055, .02, 16, chrome, s * (b.half - .05), b.y + .32, b.z - .03) : box(.14, .07, .02, black, s * (b.half - .04), b.y + .32, b.z - .03, .02);
        if (model === "ace") mirror.rotation.x = Math.PI / 2;
        bike.add(mirror);
      }
    }
    const gripL = new THREE.Object3D(), gripR = new THREE.Object3D();
    gripL.position.set(-(b.half - .04), b.y, b.z); gripR.position.set(b.half - .04, b.y, b.z);
    bike.add(gripL, gripR);
    return { gripL, gripR };
  }

  function lights() {
    const lensMat = new THREE.MeshStandardMaterial({ color: 0xf4fbff, emissive: 0xcfeaff, emissiveIntensity: 1.2, roughness: .08 });
    const l = spec.lamp;
    if (model === "ace") {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(.095, .08, .13, 22), chrome); shell.rotation.x = Math.PI / 2; shell.position.set(l.x, l.y, l.z); bike.add(shell);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(.085, 22), lensMat); lens.position.set(l.x, l.y, l.z + .066); bike.add(lens);
      for (const s of [-1, 1]) bike.add(cyl(.03, .03, .08, 10, pbr(0xffa52e, .2), s * .18, l.y - .02, l.z - .04));
    } else if (model === "haojue") {
      bike.add(box(.26, .22, .14, pbr(0x20252b, .3, .2), l.x, l.y, l.z, .04));
      bike.add(box(.2, .12, .02, lensMat, l.x, l.y + .01, l.z + .07, .02));
      for (const s of [-1, 1]) bike.add(box(.06, .04, .05, pbr(0xffa52e, .2), s * .17, l.y - .03, l.z));
    } else if (model === "apsonic") {
      for (const s of [-1, 1]) { const lens = box(.13, .05, .02, lensMat, s * .085, l.y, l.z, .015); lens.rotation.x = -.35; lens.rotation.y = s * .25; bike.add(lens); }
    } else {
      bike.add(box(.26, .08, .02, lensMat, l.x, l.y, l.z, .02));
    }
    const brakeLight = box(.16, .06, .03, new THREE.MeshBasicMaterial({ color: 0x550000 }), spec.tail.x, spec.tail.y, spec.tail.z, .015);
    bike.add(brakeLight);
    const headlight = new THREE.SpotLight(0xe8f6ff, 0, 55, .48, .5, 1.15);
    headlight.position.copy(l).add(V(0, 0, .08));
    const target = new THREE.Object3D(); target.position.set(0, .45, 18); bike.add(target, headlight); headlight.target = target;
    const exhaust = new THREE.Object3D(); exhaust.position.set(.2, .35, spec.rearZ - .2); bike.add(exhaust);
    return { brakeLight, headlight, exhaust };
  }

  function feet() {
    const p = spec.pegs;
    if (model !== "scooter") for (const s of [-1, 1]) { const peg = cyl(.016, .016, .12, 8, black, s * p.x, p.y, p.z); peg.rotation.z = Math.PI / 2; bike.add(peg); }
    const pegL = new THREE.Object3D(), pegR = new THREE.Object3D(), footDown = new THREE.Object3D();
    pegL.position.set(-p.x, p.y + .02, p.z); pegR.position.set(p.x, p.y + .02, p.z);
    footDown.position.set(-.34, .06, spec.seat.z + .12);
    bike.add(pegL, pegR, footDown);
    return { pegL, pegR, footDown };
  }

  function mountRider() {
    const r = buildHumanoid({ skin: 0x5d3a1a, shirt: NM_YELLOW, pants: 0x26394a, shoes: 0x151719, hair: "bald", gloves: 0x1c1c1c, longSleeves: true, detail: "full" });
    // Hips sit on the seat; the rest of the pose comes from the grip and peg anchors.
    r.group.position.set(0, spec.seat.top - .84, spec.seat.z - .02);
    r.torso.rotation.x = .24 + spec.crouch;
    body.add(r.group); r.head.add(buildHelmet(NM_YELLOW));
    const refl = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: .28, metalness: .18, emissive: 0xbfc3c7, emissiveIntensity: .10 });
    for (const y of [.18, .32]) r.torso.add(box(.31, .034, .018, refl, 0, y, .145, .008));
    const brand = nightMarketTexture(); if (brand) { const chest = new THREE.Mesh(new THREE.PlaneGeometry(.24, .15), new THREE.MeshBasicMaterial({ map: brand, transparent: true, toneMapped: false })); chest.position.set(0, .30, .16); r.torso.add(chest); }
    return r;
  }

  function deliveryBox() {
    const s = spec.box.scale;
    // The box sits on a rack just above the rear of the seat (real delivery boxes are ~45 cm tall).
    const rackY = spec.seat.top + .06;
    const g = new THREE.Group(); g.position.set(0, rackY + .4 * s, spec.box.z); g.scale.setScalar(s); lean.add(g);
    bike.add(box(.36, .025, .42, frameMat, 0, rackY - .012, spec.box.z, .01));
    const shell = pbr(0x101318, .54, .10); g.add(box(.92, .78, .62, shell, 0, 0, 0, .09));
    const boxLid = box(.96, .17, .65, paint(NM_YELLOW, .25), 0, .47, 0, .075); g.add(boxLid);
    const strap = pbr(0x08090b, .84); for (const x of [-.27, .27]) g.add(box(.055, .74, .64, strap, x, 0, 0, .018));
    const refl = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: .3, metalness: .2, emissive: 0x8c9196, emissiveIntensity: .08 }); g.add(box(.93, .07, .63, refl, 0, -.24, 0, .018));
    const brand = nightMarketTexture(); if (brand) { const rear = new THREE.Mesh(new THREE.PlaneGeometry(.76, .46), new THREE.MeshBasicMaterial({ map: brand, transparent: true, toneMapped: false })); rear.position.set(0, .02, -.315); rear.rotation.y = Math.PI; g.add(rear); }
    return boxLid;
  }

  function plate() {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.22, .1), new THREE.MeshBasicMaterial({ map: textTexture("NM 024", { bg: "#fff", fg: "#111", font: 64 }) }));
    p.position.set(0, spec.tail.y - .12, spec.tail.z - .03); p.rotation.y = Math.PI; p.rotation.x = .2; bike.add(p);
  }

  function seat(color = 0x151719, raised = 0) {
    const s = spec.seat;
    const m = box(.28, .09, s.length, color === 0x151719 ? seatMat : pbr(color, .9), 0, s.top - .045 + raised, s.z, .045);
    bike.add(m);
  }

  function singleCylinderEngine(fins: boolean, x = 0, z = .12) {
    bike.add(box(.26, .26, .34, engineMat, x, .4, z, .05)); // crankcase
    const cyl1 = box(.17, .2, .17, fins ? alloy : engineMat, x, .58, z + .1, .03); cyl1.rotation.x = -.35; bike.add(cyl1);
    if (fins) for (let i = 0; i < 6; i++) { const f = box(.24, .012, .22, alloy, x, .5 + i * .03, z + .1 + i * .012, .004); f.rotation.x = -.35; bike.add(f); }
    bike.add(cyl(.07, .07, .05, 16, alloy, x + .14, .4, z - .02).rotateZ(Math.PI / 2) as THREE.Mesh); // side cover
  }

  function sideExhaust(fromY: number, fromZ: number, toZ: number, mufflerY: number, upswept = false) {
    bike.add(tube(V(.04, fromY, fromZ), V(.12, .26, fromZ - .2), .02, exhaustMat, 8));
    bike.add(tube(V(.12, .26, fromZ - .2), V(.16, mufflerY - .02, toZ + .32), .02, exhaustMat, 8));
    const muffler = box(upswept ? .11 : .1, upswept ? .12 : .1, .42, upswept ? pbr(0x2a2d31, .3, .6) : chrome, .17, mufflerY, toZ + .1, .04);
    muffler.rotation.x = upswept ? -.32 : -.08; bike.add(muffler);
  }

  // ---------- models ----------
  function ace() {
    const red = paint(0xc92a2a, .22);
    // Single-cradle steel frame.
    bike.add(tube(V(0, .98, .44), V(0, .82, -.2), .025, frameMat));
    bike.add(tube(V(0, .95, .42), V(0, .3, .25), .024, frameMat));
    bike.add(tube(V(0, .3, .25), V(0, .3, -.1), .022, frameMat));
    for (const x of [-.12, .12]) bike.add(tube(V(x, .8, -.2), V(x, .86, -.82), .016, frameMat));
    // Teardrop tank with chrome badge and rubber knee pads.
    const tank = new THREE.Mesh(new THREE.SphereGeometry(.2, 22, 14), red); tank.scale.set(.75, .58, 1.35); tank.position.set(0, .93, .22); tank.castShadow = true; bike.add(tank);
    for (const s of [-1, 1]) { bike.add(box(.02, .05, .12, chrome, s * .145, .93, .3, .01)); bike.add(box(.03, .09, .13, black, s * .14, .88, .1, .02)); }
    bike.add(box(.04, .02, .06, black, 0, 1.05, .26, .01)); // fuel cap
    // Side covers, flat bench seat, chrome grab rail.
    for (const s of [-1, 1]) bike.add(box(.04, .16, .24, red, s * .13, .7, -.22, .04));
    seat();
    for (const s of [-1, 1]) bike.add(tube(V(s * .15, .84, -.42), V(s * .15, .85, -.78), .012, chrome, 6));
    // Chrome fenders.
    const ff = box(.11, .02, .44, chrome, 0, spec.frontR * 2 + .04, spec.frontZ - .02, .01); ff.rotation.x = -.05; bike.add(ff);
    const rf = box(.13, .02, .44, chrome, 0, spec.rearR * 2 + .05, spec.rearZ - .12, .01); rf.rotation.x = .25; bike.add(rf);
    singleCylinderEngine(true);
    sideExhaust(.6, .26, spec.rearZ, .36);
    bike.add(box(.14, .08, .12, black, 0, .74, .0, .02)); // air box
  }

  function haojue() {
    const blue = paint(0x1856d8, .22), dark = paint(0x20252b, .24);
    // Diamond frame with the engine as a stressed member.
    for (const x of [-.08, .08]) {
      bike.add(tube(V(x, .98, .46), V(x, .8, -.22), .024, frameMat));
      bike.add(tube(V(x, .8, -.22), V(x * 1.6, .86, -.82), .016, frameMat));
    }
    bike.add(tube(V(0, .95, .44), V(0, .5, .22), .022, frameMat));
    // Angular tank with plastic shrouds and decal stripe.
    bike.add(box(.34, .2, .42, blue, 0, .92, .2, .07));
    for (const s of [-1, 1]) { const sh = box(.04, .2, .3, dark, s * .19, .82, .3, .03); sh.rotation.z = s * .15; bike.add(sh); bike.add(box(.042, .03, .3, pbr(0xf8f9fa, .4), s * .2, .9, .3, .01)); }
    // Seat cowl panels and step seat.
    for (const s of [-1, 1]) bike.add(box(.04, .14, .46, blue, s * .13, .74, -.48, .04));
    seat();
    bike.add(box(.22, .1, .2, dark, 0, .84, -.78, .04));
    // Plastic fenders.
    bike.add(box(.12, .03, .4, dark, 0, spec.frontR * 2 + .04, spec.frontZ - .02, .02));
    bike.add(box(.14, .03, .26, dark, 0, .74, spec.rearZ - .2, .02));
    singleCylinderEngine(true);
    bike.add(box(.06, .18, .24, dark, .14, .4, .14, .02)); // engine guard
    for (const s of [-1, 1]) bike.add(tube(V(s * .16, .62, .32), V(s * .2, .3, .2), .014, chrome, 6)); // crash bars
    sideExhaust(.6, .26, spec.rearZ, .4, true);
  }

  function scooterBody() {
    const yellow = paint(0xf2e35c, .26), white = paint(0xf1f3f5, .3), grey = pbr(0x2b2f33, .85);
    // Underbone: curved spine from the head tube down under the floor and up to the seat.
    bike.add(tube(V(0, .9, .48), V(0, .3, .3), .03, frameMat));
    bike.add(tube(V(0, .3, .3), V(0, .3, -.2), .03, frameMat));
    bike.add(tube(V(0, .3, -.2), V(0, .7, -.5), .03, frameMat));
    // Front: leg shield, nose with headlamp, small front fender.
    const shield = box(.42, .55, .05, yellow, 0, .66, .42, .08); shield.rotation.x = .18; bike.add(shield);
    const inner = box(.38, .45, .03, white, 0, .62, .39, .06); inner.rotation.x = .18; bike.add(inner);
    bike.add(box(.3, .22, .2, yellow, 0, .95, .55, .08));
    bike.add(box(.12, .05, .32, yellow, 0, spec.frontR * 2 + .03, spec.frontZ, .02));
    // Floorboard where the feet rest.
    bike.add(box(.34, .04, .46, grey, 0, .3, .12, .02));
    // Rounded rear body over the engine, with a side stripe.
    bike.add(box(.4, .34, .76, yellow, 0, .58, -.42, .14));
    for (const s of [-1, 1]) bike.add(box(.012, .05, .6, white, s * .2, .6, -.42, .01));
    seat();
    // Swing-arm engine unit (CVT case) on the left with a short muffler on the right.
    bike.add(box(.12, .18, .5, engineMat, -.12, .26, -.48, .05));
    bike.add(box(.1, .1, .3, chrome, .14, .24, -.62, .03));
    bike.add(tube(V(-.1, .32, -.3), V(-.1, spec.rearR, spec.rearZ), .02, engineMat));
  }

  function sportBody() {
    const blackP = paint(0x1d1f22, .2), orange = paint(0xe8590c, .22), glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2430, roughness: .1, transparent: true, opacity: .6, clearcoat: .6 });
    // Twin-spar frame visible behind the fairing.
    for (const s of [-1, 1]) bike.add(tube(V(s * .1, .9, .48), V(s * .13, .62, -.12), .03, alloy));
    // Nose fairing, side fairings with stripes, belly pan.
    const nose = box(.34, .28, .3, blackP, 0, .88, .7, .1); nose.rotation.x = -.3; bike.add(nose);
    const screen = box(.26, .2, .015, glassMat, 0, 1.06, .62, .02); screen.rotation.x = -.7; bike.add(screen);
    for (const s of [-1, 1]) {
      const side = box(.03, .36, .6, blackP, s * .2, .7, .3, .05); side.rotation.z = s * .1; bike.add(side);
      bike.add(box(.032, .05, .54, orange, s * .205, .78, .3, .01));
    }
    bike.add(box(.32, .1, .44, blackP, 0, .3, .12, .04));
    // Angular tank with an orange spine, raised tail with pillion cowl.
    bike.add(box(.34, .22, .4, blackP, 0, .9, .14, .08));
    bike.add(box(.06, .02, .38, orange, 0, 1.015, .14, .01));
    seat(0x151719, .02);
    const tail = box(.24, .14, .44, blackP, 0, .9, -.62, .05); tail.rotation.x = -.18; bike.add(tail);
    bike.add(box(.12, .02, .34, orange, 0, .975, -.62, .01));
    bike.add(box(.11, .03, .3, blackP, 0, spec.frontR * 2 + .03, spec.frontZ, .02));
    singleCylinderEngine(false, 0, .1);
    sideExhaust(.55, .24, spec.rearZ, .52, true);
  }

  /** Merge static meshes by material to keep draw calls low (wheels, lights and anchors stay separate). */
  function batchStatic() {
    const keep = new Set<THREE.Object3D>([frontWheel, rearWheel, brakeLight]);
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...bike.children]) {
      if (!(child instanceof THREE.Mesh) || keep.has(child) || child.children.length || Array.isArray(child.material) || (child.material as THREE.Material).transparent) continue;
      child.updateMatrix();
      const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geo.applyMatrix4(child.matrix);
      for (const name of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(name)) geo.deleteAttribute(name);
      if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
      const list = buckets.get(child.material) ?? []; list.push(geo); buckets.set(child.material, list);
      bike.remove(child); child.geometry.dispose();
    }
    for (const [material, geos] of Array.from(buckets.entries())) {
      const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; bike.add(mesh);
    }
  }
}
