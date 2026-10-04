import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { nightMarketTexture, textTexture } from "./textures";
import { buildHumanoid, buildHelmet, HumanoidRig } from "./characters";

export interface RiderRig {
  group: THREE.Group; lean: THREE.Group; body: THREE.Group;
  frontWheel: THREE.Mesh; rearWheel: THREE.Mesh; brakeLight: THREE.Mesh;
  headlight: THREE.SpotLight; exhaust: THREE.Object3D; boxLid: THREE.Mesh;
  rider?: HumanoidRig; gripL: THREE.Object3D; gripR: THREE.Object3D;
  pegL: THREE.Object3D; pegR: THREE.Object3D; footDown: THREE.Object3D;
}

const NM_YELLOW = 0xf2e35c;
const BIKE_BLUE = 0x1856d8;
const GRAPHITE = 0x20252b;
const GOLD = 0xd7a72d;

const pbr = (color: number, roughness = .62, metalness = .06) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const paint = (color: number, roughness = .24) => new THREE.MeshPhysicalMaterial({ color, roughness, metalness: .12, clearcoat: .78, clearcoatRoughness: .18 });
const rb = (w: number, h: number, d: number, r = .08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * .22, h * .22, d * .22));
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = .06) { const m = new THREE.Mesh(rb(w, h, d, r), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(rt: number, rbm: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rbm, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; return m; }
function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material, seg = 10) { const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length(); const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); m.castShadow = true; m.receiveShadow = true; return m; }

export function buildRider(): RiderRig {
  const group = new THREE.Group();
  const lean = new THREE.Group();
  const bike = new THREE.Group();
  const body = new THREE.Group();
  group.add(lean); lean.add(bike, body);

  const frame = pbr(0x11151a, .34, .72), graphite = paint(GRAPHITE, .22), graphiteDark = paint(0x151a1f, .27), accent = paint(NM_YELLOW, .25), blue = paint(BIKE_BLUE, .20), chrome = pbr(0xd9dde0, .14, .88), black = pbr(0x0d1013, .84), rubber = pbr(0x050607, .97), gold = pbr(GOLD, .22, .72), engineMat = pbr(0x252a30, .40, .70), exhaustMat = pbr(0xb9aaa0, .26, .78);

  gFrame();
  const { frontWheel, rearWheel } = gWheels();
  const { gripL, gripR, pegL, pegR, footDown } = gControls();
  const { brakeLight, headlight, exhaust } = gLighting();
  const rider = gRider();
  const boxLid = gDeliveryBox();

  return { group, lean, body, frontWheel, rearWheel, brakeLight, headlight, exhaust, boxLid, rider, gripL, gripR, pegL, pegR, footDown };

  function gFrame() {
    bike.add(tube(new THREE.Vector3(-.23, .64, .58), new THREE.Vector3(-.23, .82, -.66), .035, frame));
    bike.add(tube(new THREE.Vector3(.23, .64, .58), new THREE.Vector3(.23, .82, -.66), .035, frame));
    bike.add(tube(new THREE.Vector3(-.23, .76, -.54), new THREE.Vector3(-.19, .51, -1.20), .032, frame));
    bike.add(tube(new THREE.Vector3(.23, .76, -.54), new THREE.Vector3(.19, .51, -1.20), .032, frame));

    const tank = new THREE.Mesh(new THREE.SphereGeometry(.42, 24, 16), graphite); tank.scale.set(.96, .66, 1.22); tank.position.set(0, 1.04, .35); tank.castShadow = true; tank.receiveShadow = true; bike.add(tank);
    for (const side of [-1, 1]) {
      const shoulder = box(.11, .36, .60, graphiteDark, side * .39, .96, .38, .045); shoulder.rotation.z = side * .14; shoulder.rotation.x = -.10; bike.add(shoulder);
      const stripe = box(.025, .23, .44, blue, side * .445, .97, .43, .01); stripe.rotation.z = side * .14; bike.add(stripe);
    }

    const riderSeat = box(.52, .14, .72, pbr(0x15171a, .90), 0, .93, -.34, .07); riderSeat.rotation.x = -.035; bike.add(riderSeat);
    const passengerSeat = box(.45, .12, .43, pbr(0x121417, .90), 0, 1.02, -.90, .06); passengerSeat.rotation.x = -.08; bike.add(passengerSeat);
    const tail = box(.38, .15, .46, graphiteDark, 0, .94, -1.17, .06); tail.rotation.x = -.10; bike.add(tail);

    bike.add(box(.62, .56, .64, engineMat, 0, .55, .13, .08));
    bike.add(box(.66, .22, .52, engineMat, 0, .76, .26, .06));
    for (let y = .38; y <= .69; y += .075) bike.add(box(.67, .014, .54, pbr(0x41474d, .35, .72), 0, y, .14, .006));
    bike.add(box(.67, .62, .11, pbr(0x15191d, .48, .70), 0, .67, .73, .025));
    for (let y = .41; y <= .92; y += .055) bike.add(box(.62, .012, .014, pbr(0x4a5056, .36, .72), 0, y, .792, .004));

    for (const side of [-1, 1]) { const shroud = box(.10, .44, .48, graphiteDark, side * .37, .75, .56, .035); shroud.rotation.z = side * .10; shroud.rotation.x = -.08; bike.add(shroud); }
    for (const side of [-1, 1]) bike.add(tube(new THREE.Vector3(side * .25, .49, -.24), new THREE.Vector3(side * .23, .43, -1.22), .043, frame));
    bike.add(box(.05, .07, .98, pbr(0x292e33, .48, .78), .27, .47, -.72, .018));

    for (const x of [-.18, -.06, .06, .18]) {
      bike.add(tube(new THREE.Vector3(x, .50, .48), new THREE.Vector3(x * 1.08, .24, .20), .025, exhaustMat, 9));
      bike.add(tube(new THREE.Vector3(x * 1.08, .24, .20), new THREE.Vector3(.18 + x * .35, .25, -.36), .025, exhaustMat, 9));
    }
    bike.add(tube(new THREE.Vector3(.12, .25, -.36), new THREE.Vector3(.31, .38, -.72), .055, exhaustMat, 10));
    const muffler = box(.24, .22, .62, pbr(0x9ca3a8, .24, .82), .34, .42, -.91, .045); muffler.rotation.x = -.16; bike.add(muffler);
    const mufflerCap = box(.19, .16, .17, black, .34, .42, -1.22, .035); mufflerCap.rotation.x = -.16; bike.add(mufflerCap);

    const brand = nightMarketTexture();
    if (brand) for (const side of [-1, 1]) { const decal = new THREE.Mesh(new THREE.PlaneGeometry(.32, .16), new THREE.MeshBasicMaterial({ map: brand, transparent: true, toneMapped: false })); decal.position.set(side * .445, .92, .12); decal.rotation.y = side * Math.PI / 2; bike.add(decal); }

    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.46, .20), new THREE.MeshBasicMaterial({ map: textTexture("NM 024", { bg: "#fff", fg: "#111", font: 64 }) })); plate.position.set(0, .67, -1.53); plate.rotation.y = Math.PI; bike.add(plate);
    bike.add(tube(new THREE.Vector3(0, .89, -1.31), new THREE.Vector3(0, .68, -1.49), .018, black, 8));
  }

  function gWheels() {
    const tireGeo = new THREE.TorusGeometry(.315, .078, 12, 34); tireGeo.rotateY(Math.PI / 2);
    const rimGeo = new THREE.TorusGeometry(.267, .025, 8, 28); rimGeo.rotateY(Math.PI / 2);
    const spokeGeo = new THREE.BoxGeometry(.022, .49, .025);
    const hubGeo = new THREE.CylinderGeometry(.06, .06, .23, 14); hubGeo.rotateZ(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(.245, .245, .012, 34); discGeo.rotateZ(Math.PI / 2);

    function make(z: number, front: boolean) {
      const wheel = new THREE.Mesh(tireGeo, rubber); wheel.name = "wheel"; wheel.position.set(0, .42, z); wheel.castShadow = true; wheel.receiveShadow = true;
      const rr = new THREE.Mesh(rimGeo, blue); rr.name = "wheel-rim"; rr.castShadow = true; wheel.add(rr);
      for (let i = 0; i < 8; i++) { const spoke = new THREE.Mesh(spokeGeo, blue); spoke.rotation.x = i / 8 * Math.PI; spoke.castShadow = true; wheel.add(spoke); }
      const hub = new THREE.Mesh(hubGeo, chrome); hub.castShadow = true; wheel.add(hub);
      const discMat = pbr(0xc7cdd2, .20, .90);
      if (front) for (const x of [-.095, .095]) { const disc = new THREE.Mesh(discGeo, discMat); disc.position.x = x; disc.castShadow = true; wheel.add(disc); }
      else { const disc = new THREE.Mesh(discGeo, discMat); disc.position.x = .095; disc.scale.set(.78, .78, .78); wheel.add(disc); }
      bike.add(wheel); return wheel;
    }

    const frontWheel = make(1.35, true), rearWheel = make(-1.23, false);
    for (const x of [-.15, .15]) {
      bike.add(tube(new THREE.Vector3(x, 1.31, .80), new THREE.Vector3(x, .50, 1.35), .037, gold, 12));
      bike.add(tube(new THREE.Vector3(x, .71, 1.20), new THREE.Vector3(x, .47, 1.36), .049, black, 12));
    }
    const fender = box(.48, .07, .66, graphiteDark, 0, .76, 1.34, .045); fender.rotation.x = -.02; bike.add(fender);
    for (const x of [-.16, .16]) bike.add(box(.07, .18, .11, pbr(0x1a1f24, .28, .62), x, .50, 1.25, .022));
    return { frontWheel, rearWheel };
  }

  function gControls() {
    const BAR_Y = 1.30, BAR_Z = .73;
    const handle = cyl(.030, .030, .98, 12, chrome, 0, BAR_Y, BAR_Z); handle.rotation.z = Math.PI / 2; bike.add(handle);
    for (const x of [-.45, .45]) {
      const grip = cyl(.042, .042, .16, 10, black, x, BAR_Y, BAR_Z); grip.rotation.z = Math.PI / 2; bike.add(grip);
      bike.add(tube(new THREE.Vector3(x * .92, BAR_Y + .02, BAR_Z), new THREE.Vector3(x * 1.15, BAR_Y + .31, BAR_Z - .02), .012, black, 8));
      const mirror = box(.18, .10, .035, graphiteDark, x * 1.16, BAR_Y + .33, BAR_Z - .02, .025); mirror.rotation.z = x > 0 ? -.18 : .18; bike.add(mirror);
    }
    const dash = box(.24, .14, .05, black, 0, BAR_Y + .09, BAR_Z + .03, .025); dash.rotation.x = -.35; bike.add(dash);
    const dashScreen = new THREE.Mesh(new THREE.PlaneGeometry(.19, .09), new THREE.MeshBasicMaterial({ color: 0x67b7ff, toneMapped: false })); dashScreen.position.set(0, BAR_Y + .09, BAR_Z + .061); dashScreen.rotation.x = -.35; bike.add(dashScreen);
    const gripL = new THREE.Object3D(), gripR = new THREE.Object3D(); gripL.position.set(-.41, BAR_Y, BAR_Z); gripR.position.set(.41, BAR_Y, BAR_Z); bike.add(gripL, gripR);
    for (const x of [-.24, .24]) { const peg = cyl(.023, .023, .18, 8, chrome, x, .51, -.05); peg.rotation.z = Math.PI / 2; bike.add(peg); }
    const pegL = new THREE.Object3D(), pegR = new THREE.Object3D(), footDown = new THREE.Object3D(); pegL.position.set(-.20, .54, -.04); pegR.position.set(.20, .54, -.04); footDown.position.set(-.37, .06, -.20); bike.add(pegL, pegR, footDown);
    return { gripL, gripR, pegL, pegR, footDown };
  }

  function gLighting() {
    const cowl = box(.47, .33, .15, graphiteDark, 0, 1.18, 1.51, .055); cowl.rotation.x = -.05; bike.add(cowl);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0xeaf7ff, roughness: .08, metalness: .08, emissive: 0xbfe9ff, emissiveIntensity: 1.25 });
    for (const side of [-1, 1]) {
      const lamp = box(.16, .23, .035, ledMat, side * .13, 1.17, 1.595, .025); lamp.rotation.z = side * .10; bike.add(lamp);
      const indicator = new THREE.Mesh(new THREE.SphereGeometry(.040, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffa52e, emissive: 0xff8b00, emissiveIntensity: .70, roughness: .18 })); indicator.position.set(side * .34, 1.16, 1.49); bike.add(indicator);
    }
    const flyscreen = box(.44, .20, .025, new THREE.MeshPhysicalMaterial({ color: 0x111820, roughness: .18, metalness: .05, transparent: true, opacity: .76, clearcoat: .50 }), 0, 1.42, 1.48, .025); flyscreen.rotation.x = -.28; bike.add(flyscreen);
    const brakeLight = box(.28, .105, .045, new THREE.MeshBasicMaterial({ color: 0x550000 }), 0, 1.02, -1.41, .022); bike.add(brakeLight);
    const headlight = new THREE.SpotLight(0xe8f6ff, 0, 55, .48, .50, 1.15); headlight.position.set(0, 1.20, 1.56); const target = new THREE.Object3D(); target.position.set(0, .45, 18); bike.add(target, headlight); headlight.target = target;
    const exhaust = new THREE.Object3D(); exhaust.position.set(.34, .42, -1.30); bike.add(exhaust);
    return { brakeLight, headlight, exhaust };
  }

  function gRider() {
    const r = buildHumanoid({ skin: 0x5d3a1a, shirt: NM_YELLOW, pants: 0x26394a, shoes: 0x151719, hair: "bald", gloves: 0x1c1c1c, longSleeves: true, detail: "full" });
    r.group.position.set(0, .15, -.23); r.torso.rotation.x = .24; body.add(r.group); r.head.add(buildHelmet(NM_YELLOW));
    const refl = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: .28, metalness: .18, emissive: 0xbfc3c7, emissiveIntensity: .10 });
    for (const y of [.18, .32]) r.torso.add(box(.31, .034, .018, refl, 0, y, .145, .008));
    const brand = nightMarketTexture(); if (brand) { const chest = new THREE.Mesh(new THREE.PlaneGeometry(.24, .15), new THREE.MeshBasicMaterial({ map: brand, transparent: true, toneMapped: false })); chest.position.set(0, .30, .16); r.torso.add(chest); }
    return r;
  }

  function gDeliveryBox() {
    const g = new THREE.Group(); g.position.set(0, 1.31, -1.08); lean.add(g);
    const shell = pbr(0x101318, .54, .10); g.add(box(.92, .78, .62, shell, 0, 0, 0, .09));
    const boxLid = box(.96, .17, .65, accent, 0, .47, 0, .075); g.add(boxLid);
    const strap = pbr(0x08090b, .84); for (const x of [-.27, .27]) g.add(box(.055, .74, .64, strap, x, 0, 0, .018));
    const refl = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: .3, metalness: .2, emissive: 0x8c9196, emissiveIntensity: .08 }); g.add(box(.93, .07, .63, refl, 0, -.24, 0, .018));
    const brand = nightMarketTexture(); if (brand) { const rear = new THREE.Mesh(new THREE.PlaneGeometry(.76, .46), new THREE.MeshBasicMaterial({ map: brand, transparent: true, toneMapped: false })); rear.position.set(0, .02, -.315); rear.rotation.y = Math.PI; g.add(rear); }
    return boxLid;
  }
}
