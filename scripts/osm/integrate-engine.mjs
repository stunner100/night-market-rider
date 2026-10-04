#!/usr/bin/env node
import fs from "node:fs/promises";

const path = "game/engine.ts";
let src = await fs.readFile(path, "utf8");
if (src.includes('import { AccraWorldRuntime } from "./world/accra-runtime";')) {
  console.log("Engine already has Accra runtime integration.");
  process.exit(0);
}

function replaceOnce(needle, replacement, label) {
  if (!src.includes(needle)) throw new Error(`Could not find ${label}`);
  src = src.replace(needle, replacement);
}

replaceOnce(
  'import { buildHumanoid, buildHandBag, animateIdle, animateWalk, animateWave, animateHandoff, animateReceive, poseRider, SKIN_TONES, HumanoidRig, HairStyle } from "./characters";\n',
  'import { buildHumanoid, buildHandBag, animateIdle, animateWalk, animateWave, animateHandoff, animateReceive, poseRider, SKIN_TONES, HumanoidRig, HairStyle } from "./characters";\nimport { AccraWorldRuntime } from "./world/accra-runtime";\n',
  "engine import"
);

replaceOnce(
  '  camPos = new THREE.Vector3(0, 5, -28);\n  private _bannerTimer: ReturnType<typeof setTimeout> | null = null;\n  private _fuelWarned = false;\n',
  '  camPos = new THREE.Vector3(0, 5, -28);\n  osmWorld: AccraWorldRuntime;\n  osmActive = false;\n  private _osmRoute: { x: number; z: number }[] = [];\n  private _osmRouteTarget = "";\n  private _osmRouteAt = 0;\n  private _bannerTimer: ReturnType<typeof setTimeout> | null = null;\n  private _fuelWarned = false;\n',
  "OSM fields"
);

replaceOnce(
  '    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);\n',
  '    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);\n',
  "camera far plane"
);

replaceOnce(
  '    this.world = buildWorld(this.scene, this.isMobile);\n    this.rig = buildRider();\n',
  '    this.world = buildWorld(this.scene, this.isMobile);\n    this.osmWorld = new AccraWorldRuntime(this.scene, this.isMobile);\n    this.rig = buildRider();\n',
  "runtime construction"
);

replaceOnce(
  '    this.bindKeys();\n    this.loop();\n  }\n\n  resize = () => {\n',
  '    this.bindKeys();\n    this.loop();\n    void this.initializeAccraWorld();\n  }\n\n  private async initializeAccraWorld() {\n    const available = await this.osmWorld.initialize();\n    if (!available || !this.running) return;\n    await this.osmWorld.prime(this.px, this.pz);\n    if (!this.osmWorld.ready || !this.running) return;\n\n    // Preserve mission markers while hiding the old handcrafted city.\n    this.scene.attach(this.world.pickupMarker);\n    this.scene.attach(this.world.dropMarker);\n    this.scene.attach(this.world.arrowHelper);\n    this.world.group.visible = false;\n\n    // Do not collide with invisible fallback actors once the real map is active.\n    this.world.traffic.length = 0;\n    this.world.peds.length = 0;\n    this.world.ramps.length = 0;\n    this.world.potholes.length = 0;\n    this.world.coins.length = 0;\n    this.world.fuelStations.length = 0;\n    this.world.colliders.length = 0;\n\n    const snapped = this.osmWorld.nearestRoadPoint(this.px, this.pz, 120);\n    if (snapped) { this.px = snapped.x; this.pz = snapped.z; }\n    this.osmActive = true;\n    useGame.getState().pushToast("🗺️ Real Accra map loaded");\n  }\n\n  resize = () => {\n',
  "runtime initialization"
);

replaceOnce(
  '    this.px = 0; this.pz = -18; this.heading = Math.PI; this.speed = 0;\n',
  '    this.px = 0; this.pz = -18; this.heading = Math.PI; this.speed = 0;\n    if (this.osmActive) {\n      const snapped = this.osmWorld.nearestRoadPoint(this.px, this.pz, 120);\n      if (snapped) { this.px = snapped.x; this.pz = snapped.z; }\n    }\n',
  "OSM run spawn"
);

replaceOnce(
  '    const order = makeOrder(s.orderIndex);\n    s.set({ phase: "offer", order, timeLeft: order.timeTotal, banner: null });\n',
  '    const order = makeOrder(s.orderIndex);\n    if (this.osmActive) {\n      const pickup = this.osmWorld.nearestRoadPoint(order.pickupX, order.pickupZ, 180);\n      const drop = this.osmWorld.nearestRoadPoint(order.dropX, order.dropZ, 180);\n      if (pickup) { order.pickupX = pickup.x; order.pickupZ = pickup.z; }\n      if (drop) { order.dropX = drop.x; order.dropZ = drop.z; }\n    }\n    this._osmRouteTarget = "";\n    this._osmRoute.length = 0;\n    s.set({ phase: "offer", order, timeLeft: order.timeTotal, banner: null });\n',
  "order road snapping"
);

replaceOnce(
  '  onRoad(x: number, z: number) {\n    if (Math.abs(x) < 6.8 || Math.abs(z) < 6.8) return true;\n',
  '  onRoad(x: number, z: number) {\n    if (this.osmActive) return this.osmWorld.isOnRoad(x, z, 1.2);\n    if (Math.abs(x) < 6.8 || Math.abs(z) < 6.8) return true;\n',
  "OSM road check"
);

replaceOnce(
  '    const nx = this.px + Math.sin(this.heading) * this.speed * dt;\n    const nz = this.pz + Math.cos(this.heading) * this.speed * dt;\n    this.px = THREE.MathUtils.clamp(nx, -98, 98);\n    this.pz = THREE.MathUtils.clamp(nz, -98, 98);\n\n    // ramps & potholes\n',
  '    const nx = this.px + Math.sin(this.heading) * this.speed * dt;\n    const nz = this.pz + Math.cos(this.heading) * this.speed * dt;\n    if (this.osmActive) {\n      this.px = THREE.MathUtils.clamp(nx, -2500, 3800);\n      this.pz = THREE.MathUtils.clamp(nz, -3200, 1600);\n    } else {\n      this.px = THREE.MathUtils.clamp(nx, -98, 98);\n      this.pz = THREE.MathUtils.clamp(nz, -98, 98);\n    }\n\n    if (this.osmActive && riding && this.crashCool <= 0) {\n      const hit = this.osmWorld.collidesBuilding(this.px, this.pz, 0.9);\n      if (hit) {\n        this.px -= Math.sin(this.heading) * this.speed * dt * 1.5;\n        this.pz -= Math.cos(this.heading) * this.speed * dt * 1.5;\n        this.crash(`💥 Collided with ${hit}! Easy oo.`);\n      }\n    }\n\n    // ramps & potholes\n',
  "large-world movement"
);

replaceOnce(
  '    const t = performance.now() / 1000;\n    this.world.update(dt, t, this.nightF, this.px, this.pz);\n',
  '    const t = performance.now() / 1000;\n    if (this.osmActive) void this.osmWorld.update(this.px, this.pz);\n    this.world.update(dt, t, this.nightF, this.px, this.pz);\n',
  "chunk streaming"
);

const oldNav = `  updateNav(o: ReturnType<typeof makeOrder> | null, phase: string) {\n    const show = !!o && (phase === "toPickup" || phase === "toDropoff" || phase === "offer");\n    for (const c of this.chevrons) c.visible = show;\n    if (!show || !o) return;\n    const tx = phase === "toDropoff" ? o.dropX : o.pickupX;\n    const tz = phase === "toDropoff" ? o.dropZ : o.pickupZ;\n    const dx = tx - this.px, dz = tz - this.pz;\n    const dist = Math.hypot(dx, dz);\n    const ang = Math.atan2(dx, dz);\n    const n = this.chevrons.length;\n    for (let i = 0; i < n; i++) {\n      const d = 6 + i * 5;\n      if (d > dist - 3) { this.chevrons[i].visible = false; continue; }\n      this.chevrons[i].visible = true;\n      this.chevrons[i].position.set(this.px + Math.sin(ang) * d, 0.7 + Math.sin(performance.now() / 300 + i) * 0.15, this.pz + Math.cos(ang) * d);\n      this.chevrons[i].rotation.z = -ang;\n    }\n    if (this.targetLabel) this.targetLabel.position.y = 9 + Math.sin(performance.now() / 400) * 0.5;\n  }\n`;

const newNav = `  updateNav(o: ReturnType<typeof makeOrder> | null, phase: string) {\n    const show = !!o && (phase === "toPickup" || phase === "toDropoff" || phase === "offer");\n    for (const c of this.chevrons) c.visible = show;\n    if (!show || !o) return;\n    const tx = phase === "toDropoff" ? o.dropX : o.pickupX;\n    const tz = phase === "toDropoff" ? o.dropZ : o.pickupZ;\n\n    if (this.osmActive) {\n      const now = performance.now();\n      const targetKey = \`${'${phase}'}:${'${tx.toFixed(1)}'}:${'${tz.toFixed(1)}'}\`;\n      if (targetKey !== this._osmRouteTarget || now - this._osmRouteAt > 900) {\n        this._osmRoute = this.osmWorld.route({ x: this.px, z: this.pz }, { x: tx, z: tz });\n        this._osmRouteTarget = targetKey;\n        this._osmRouteAt = now;\n      }\n      const route = this._osmRoute;\n      const pointAt = (wanted: number) => {\n        let walked = 0;\n        for (let j = 0; j < route.length - 1; j++) {\n          const a = route[j], b = route[j + 1];\n          const len = Math.hypot(b.x - a.x, b.z - a.z);\n          if (walked + len >= wanted) {\n            const u = len > 0 ? (wanted - walked) / len : 0;\n            return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, ang: Math.atan2(b.x - a.x, b.z - a.z) };\n          }\n          walked += len;\n        }\n        return null;\n      };\n      for (let i = 0; i < this.chevrons.length; i++) {\n        const p = pointAt(7 + i * 7);\n        if (!p) { this.chevrons[i].visible = false; continue; }\n        this.chevrons[i].visible = true;\n        this.chevrons[i].position.set(p.x, 0.7 + Math.sin(now / 300 + i) * 0.15, p.z);\n        this.chevrons[i].rotation.z = -p.ang;\n      }\n    } else {\n      const dx = tx - this.px, dz = tz - this.pz;\n      const dist = Math.hypot(dx, dz);\n      const ang = Math.atan2(dx, dz);\n      const n = this.chevrons.length;\n      for (let i = 0; i < n; i++) {\n        const d = 6 + i * 5;\n        if (d > dist - 3) { this.chevrons[i].visible = false; continue; }\n        this.chevrons[i].visible = true;\n        this.chevrons[i].position.set(this.px + Math.sin(ang) * d, 0.7 + Math.sin(performance.now() / 300 + i) * 0.15, this.pz + Math.cos(ang) * d);\n        this.chevrons[i].rotation.z = -ang;\n      }\n    }\n    if (this.targetLabel) this.targetLabel.position.y = 9 + Math.sin(performance.now() / 400) * 0.5;\n  }\n`;
replaceOnce(oldNav, newNav, "route-aware navigation");

replaceOnce(
  '    if (this.skyDome) {\n      this.skyDome.rotation.y = performance.now() * 0.00003;\n',
  '    if (this.skyDome) {\n      this.skyDome.position.set(this.px, 0, this.pz);\n      this.skyDome.rotation.y = performance.now() * 0.00003;\n',
  "sky recentering"
);

replaceOnce(
  '    this.world.sun.position.set(sunX, sunY, sunZ);\n',
  '    this.world.sun.position.set((this.osmActive ? this.px : 0) + sunX, sunY, (this.osmActive ? this.pz : 0) + sunZ);\n',
  "sun recentering"
);

replaceOnce(
  '    this.audio.dispose();\n    // dispose sky dome\n',
  '    this.audio.dispose();\n    this.osmWorld.dispose();\n    // dispose sky dome\n',
  "OSM disposal"
);

await fs.writeFile(path, src);
console.log("Integrated Accra OSM runtime into game/engine.ts");
