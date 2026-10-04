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
const pbr = (color: number, roughness = .62, metalness = .06) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const paint = (color: number) => new THREE.MeshPhysicalMaterial({ color, roughness: .25, metalness: .45, clearcoat: .65, clearcoatRoughness: .2 });
const rb = (w: number, h: number, d: number, r = .08) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w * .22, h * .22, d * .22));
function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, r = .06) { const m = new THREE.Mesh(rb(w, h, d, r), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function cyl(rt: number, rbm: number, h: number, seg: number, mat: THREE.Material, x: number, y: number, z: number) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rbm, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; return m; }

export function buildRider(): RiderRig {
  const group = new THREE.Group(), lean = new THREE.Group(), bike = new THREE.Group(), body = new THREE.Group(); group.add(lean); lean.add(bike, body);
  const frame = pbr(0x15191d, .35, .72), accent = paint(NM_YELLOW), chrome = pbr(0xdde1e4, .12, .92), black = pbr(0x101214, .82), rubber = pbr(0x08090a, .96), rim = pbr(0x8a9298, .18, .82);

  gFrame();
  const { frontWheel, rearWheel } = gWheels();
  const { gripL, gripR, pegL, pegR, footDown } = gControls();
  const { brakeLight, headlight, exhaust } = gLighting();
  const rider = gRider();
  const boxLid = gDeliveryBox();
  return { group, lean, body, frontWheel, rearWheel, brakeLight, headlight, exhaust, boxLid, rider, gripL, gripR, pegL, pegR, footDown };

  function gFrame() {
    bike.add(box(.46, .28, 2.05, frame, 0, .59, .02, .11));
    const tank = new THREE.Mesh(new THREE.SphereGeometry(.33, 20, 14), paint(0x22272c)); tank.scale.set(.82, .58, 1.18); tank.position.set(0, .96, .58); tank.castShadow = true; bike.add(tank);
    const tankStripe = box(.48, .06, .78, accent, 0, 1.06, .57, .025); bike.add(tankStripe);
    const seat = box(.42, .13, .78, pbr(0x161719, .88), 0, .92, -.31, .06); bike.add(seat);
    const tail = box(.40, .18, .55, frame, 0, .83, -.92, .08); bike.add(tail);
    const engine = box(.42, .48, .68, pbr(0x2b3035, .38, .78), 0, .54, .12, .07); bike.add(engine);
    for (let y = .39; y <= .69; y += .075) bike.add(box(.46, .018, .60, chrome, 0, y, .12, .008));
    for (const side of [-1, 1]) { const rail = cyl(.025, .025, 1.24, 8, frame, side * .23, .66, -.05); rail.rotation.x = .54; bike.add(rail); }
    const chain = box(.055, .08, 1.12, pbr(0x353a3f, .42, .82), .27, .43, -.35, .02); bike.add(chain);
    const exhaustPipe = cyl(.055, .065, .95, 10, chrome, .28, .43, -.96); exhaustPipe.rotation.x = Math.PI / 2; bike.add(exhaustPipe);
    bike.add(box(.13, .13, .58, pbr(0x8e969c, .2, .88), .28, .43, -1.17, .045));
    const brand = nightMarketTexture(); if (brand) for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.45, .22), new THREE.MeshBasicMaterial({ map: brand, transparent: true })); p.position.set(s * .265, .83, .23); p.rotation.y = s * Math.PI / 2; bike.add(p); }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.5, .22), new THREE.MeshBasicMaterial({ map: textTexture("NM 024", { bg: "#fff", fg: "#111", font: 64 }) })); plate.position.set(0, .62, -1.34); plate.rotation.y = Math.PI; bike.add(plate);
  }

  function gWheels() {
    const tg = new THREE.TorusGeometry(.36, .085, 10, 28), rg = new THREE.TorusGeometry(.275, .025, 8, 24), spoke = new THREE.BoxGeometry(.018, .52, .018);
    function make(z: number) { const root = new THREE.Group(); root.position.set(0, .42, z); root.rotation.y = Math.PI / 2; const tire = new THREE.Mesh(tg, rubber), rr = new THREE.Mesh(rg, rim); tire.castShadow = true; rr.castShadow = true; root.add(tire, rr); for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(spoke, chrome); s.rotation.z = i / 6 * Math.PI; root.add(s); } const spin = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .24, 12), chrome); spin.rotation.z = Math.PI / 2; root.add(spin); bike.add(root); return tire; }
    const frontWheel = make(1.28), rearWheel = make(-1.08);
    const forkMat = pbr(0xb4bbc0, .18, .9); for (const x of [-.12, .12]) { const f = cyl(.03, .03, .95, 10, forkMat, x, .88, .92); f.rotation.x = -.24; bike.add(f); }
    const fender = box(.38, .10, .90, accent, 0, .79, 1.27, .08); fender.rotation.x = -.02; bike.add(fender);
    const disc = cyl(.23, .23, .018, 22, chrome, .13, .42, 1.28); disc.rotation.z = Math.PI / 2; bike.add(disc, box(.08, .16, .12, pbr(0xd9480f, .3, .4), .14, .52, 1.19, .025));
    return { frontWheel, rearWheel };
  }

  function gControls() {
    const BAR_Y = 1.18, BAR_Z = .30; const handle = cyl(.032, .032, .96, 10, chrome, 0, BAR_Y, BAR_Z); handle.rotation.z = Math.PI / 2; bike.add(handle);
    for (const x of [-.44, .44]) { const g = cyl(.045, .045, .15, 8, black, x, BAR_Y, BAR_Z); g.rotation.z = Math.PI / 2; bike.add(g); const stem = cyl(.014, .014, .27, 6, chrome, x * .8, BAR_Y + .14, BAR_Z); stem.rotation.z = x > 0 ? -.2 : .2; bike.add(stem); const mir = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 8), chrome); mir.scale.set(1.2, .8, .2); mir.position.set(x * .9, BAR_Y + .28, BAR_Z); bike.add(mir); }
    const stem = cyl(.035, .035, .84, 10, chrome, 0, .94, .58); stem.rotation.x = .82; bike.add(stem);
    const gripL = new THREE.Object3D(), gripR = new THREE.Object3D(); gripL.position.set(-.40, BAR_Y, BAR_Z); gripR.position.set(.40, BAR_Y, BAR_Z); bike.add(gripL, gripR);
    const phone = box(.15, .24, .025, black, 0, BAR_Y + .15, BAR_Z + .03, .025); phone.rotation.x = -.55; const screen = new THREE.Mesh(new THREE.PlaneGeometry(.125, .205), new THREE.MeshBasicMaterial({ color: 0x2b78e4 })); screen.position.set(0, BAR_Y + .15, BAR_Z + .047); screen.rotation.x = -.55; bike.add(phone, screen);
    for (const x of [-.22, .22]) { const p = cyl(.025, .025, .18, 8, chrome, x, .43, .02); p.rotation.z = Math.PI / 2; bike.add(p); }
    const pegL = new THREE.Object3D(), pegR = new THREE.Object3D(), footDown = new THREE.Object3D(); pegL.position.set(-.17, .50, .14); pegR.position.set(.17, .50, .14); footDown.position.set(-.35, .06, -.18); bike.add(pegL, pegR, footDown); return { gripL, gripR, pegL, pegR, footDown };
  }

  function gLighting() {
    const housing = new THREE.Mesh(new THREE.SphereGeometry(.19, 18, 12), chrome); housing.scale.z = .62; housing.position.set(0, 1.04, 1.47); housing.castShadow = true; const lens = new THREE.Mesh(new THREE.SphereGeometry(.145, 16, 10), new THREE.MeshStandardMaterial({ color: 0xfff5c7, roughness: .06, emissive: 0xffe2a0, emissiveIntensity: .28 })); lens.scale.z = .55; lens.position.set(0, 1.04, 1.51); bike.add(housing, lens);
    for (const x of [-.27, .27]) { const b = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff922b, emissive: 0xff922b, emissiveIntensity: .28 })); b.position.set(x, 1.01, 1.43); bike.add(b); }
    const brakeLight = box(.30, .14, .055, new THREE.MeshBasicMaterial({ color: 0x550000 }), 0, .88, -1.34, .025); bike.add(brakeLight);
    const headlight = new THREE.SpotLight(0xfff2c4, 0, 50, .50, .55, 1.2); headlight.position.set(0, 1.15, 1.42); const target = new THREE.Object3D(); target.position.set(0, .35, 17); bike.add(target, headlight); headlight.target = target;
    const exhaust = new THREE.Object3D(); exhaust.position.set(.28, .43, -1.55); bike.add(exhaust); return { brakeLight, headlight, exhaust };
  }

  function gRider() {
    const r = buildHumanoid({ skin: 0x5d3a1a, shirt: NM_YELLOW, pants: 0x26394a, shoes: 0x151719, hair: "bald", gloves: 0x1c1c1c, longSleeves: true, detail: "full" });
    r.group.position.set(0, .12, -.24); r.torso.rotation.x = .18; body.add(r.group); const helmet = buildHelmet(NM_YELLOW); r.head.add(helmet);
    const refl = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: .28, metalness: .18, emissive: 0xbfc3c7, emissiveIntensity: .10 }); for (const y of [.18, .32]) r.torso.add(box(.31, .034, .018, refl, 0, y, .145, .008));
    const brand = nightMarketTexture(); if (brand) { const chest = new THREE.Mesh(new THREE.PlaneGeometry(.24, .15), new THREE.MeshBasicMaterial({ map: brand, transparent: true })); chest.position.set(0, .30, .16); r.torso.add(chest); for (const s of [-1, 1]) { const hp = new THREE.Mesh(new THREE.PlaneGeometry(.16, .10), new THREE.MeshBasicMaterial({ map: brand, transparent: true })); hp.position.set(s * .195, .16, 0); hp.rotation.y = s * Math.PI / 2; r.head.add(hp); } }
    return r;
  }

  function gDeliveryBox() {
    const g = new THREE.Group(); g.position.set(0, 1.20, -1.17); lean.add(g); const shell = pbr(0x111315, .58, .10); g.add(box(1.02, .92, .68, shell, 0, 0, 0, .10)); const boxLid = box(1.06, .20, .71, accent, 0, .56, 0, .08); g.add(boxLid); const strap = pbr(0x0a0b0c, .82); for (const x of [-.29, .29]) g.add(box(.065, .88, .70, strap, x, 0, 0, .02)); const refl = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: .3, metalness: .2, emissive: 0x8c9196, emissiveIntensity: .08 }); g.add(box(1.03, .085, .69, refl, 0, -.28, 0, .02)); const brand = nightMarketTexture(); if (brand) { const rear = new THREE.Mesh(new THREE.PlaneGeometry(.84, .54), new THREE.MeshBasicMaterial({ map: brand, transparent: true })); rear.position.set(0, .02, -.345); rear.rotation.y = Math.PI; g.add(rear); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.50, .32), new THREE.MeshBasicMaterial({ map: brand, transparent: true })); p.position.set(s * .515, .02, 0); p.rotation.y = s * Math.PI / 2; g.add(p); } } return boxLid;
  }
}
