import * as THREE from "three";
import { buildWorld, World } from "./world";
import { buildRider, RiderRig } from "./bike";
import { makeOrder, saveBoard, separateOrderFromRider, useGame } from "./store";
import { GameAudio } from "./audio";
import { textTexture, skyDomeTexture, disposeTextureCache } from "./textures";
import { buildHumanoid, buildHandBag, animateIdle, animateWalk, animateWave, animateHandoff, animateReceive, poseRider, SKIN_TONES, HumanoidRig, HairStyle } from "./characters";
import { AccraWorldRuntime } from "./world/accra-runtime";
import { formatWorldDistance, polylineLength, worldUnitsToMetres } from "./world/distance";
import { BOOST_FUEL_PER_SECOND, CRUISE_FUEL_PER_SECOND, fuelBrand } from "./world/fuel-stations";
import { buildMinimapFrame, type MinimapFrame } from "./world/minimap-data";
import { cueFromRoute } from "./world/navigation";
import { OsmGameplay } from "./world/osm-gameplay";
import { chooseRoadside } from "./world/roadside-placement";
import { BIKE_BODY_RADIUS, WALK_SPEED, canRemount, chooseDismountPoint, stepWalk } from "./world/on-foot";

export interface Input { up: boolean; down: boolean; left: boolean; right: boolean; boost: boolean; }

interface Particle { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Shared particle geometry — one sphere reused for all particles
const particleGeo = new THREE.SphereGeometry(0.15, 6, 5);

const NIGHT_FLOOR = 0.86;

type RideTrafficKind = "car" | "taxi" | "trotro" | "bus" | "okada";

function rideTrafficKind(kind: string): RideTrafficKind {
  switch (kind) {
    case "car":
    case "taxi":
    case "trotro":
    case "bus":
    case "okada":
      return kind;
    default:
      return "car";
  }
}

function trafficReach(kind: string): number {
  const named = rideTrafficKind(kind);
  switch (named) {
    case "bus":
      return 3.2;
    case "trotro":
      return 2.55;
    case "okada":
      return 1.35;
    case "car":
    case "taxi":
      return 2.5;
    default: {
      const neverKind: never = named;
      return neverKind;
    }
  }
}

function trafficCrashLine(kind: string): string {
  const named = rideTrafficKind(kind);
  switch (named) {
    case "trotro":
      return "🚐 Trotro bump! Slow am.";
    case "bus":
      return "🚌 Bus bump! Easy oo.";
    case "taxi":
      return "🚕 Taxi crash! Chale, easy oo.";
    case "okada":
      return "🏍️ Okada crash! Chale, easy oo.";
    case "car":
      return "🚗 Crash! Chale, easy oo.";
    default: {
      const neverKind: never = named;
      return neverKind;
    }
  }
}

// Pre-allocated Color objects for applySky
const _skyDay = new THREE.Color(0x87ceeb);
const _skySunset = new THREE.Color(0xc46a3a);
const _skyNight = new THREE.Color(0x0c1428);
const _skyResult = new THREE.Color();
const _fogNight = new THREE.Color(0x182033);
const _fogResult = new THREE.Color();
const _hemiDay = new THREE.Color(0xcde1f8);
const _hemiNight = new THREE.Color(0x1b2c52);
const _groundDay = new THREE.Color(0x8a6d48);
const _groundNight = new THREE.Color(0x3d2a18);
const _sunDay = new THREE.Color(0xffeedd);
const _sunNight = new THREE.Color(0xb7c6de);
const _ambientDay = new THREE.Color(0xfff4e8);
const _ambientNight = new THREE.Color(0xffe2b8);
const _white = new THREE.Color(0xffffff);
// Pre-allocated Vector3 for exhaust position
const _exhaustPos = new THREE.Vector3();
// Pre-allocated Vector3 for menu camera target
const _menuTarget = new THREE.Vector3();

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  rig: RiderRig;
  audio = new GameAudio();
  input: Input = { up: false, down: false, left: false, right: false, boost: false };
  // player
  px = 0; pz = -18; heading = Math.PI; speed = 0;
  onFoot = false;
  bikeX = 0; bikeZ = -18; bikeHeading = Math.PI;
  walker: HumanoidRig;
  walkMoving = false;
  vy = 0; py = 0; bump = 0; shake = 0;
  boostOn = false;
  crashCool = 0; potCool = 0; nearCool = 0; coinCool = 0;
  // flow
  pickupT = 0; deliverT = 0; deliveredT = 0; countdownT = 0;
  orderCollisions = 0;
  vendorNPC: THREE.Group | null = null;
  customerNPC: THREE.Group | null = null;
  vendorRig: HumanoidRig | null = null;
  customerRig: HumanoidRig | null = null;
  targetLabel: THREE.Sprite | null = null;
  skyDome: THREE.Mesh | null = null;
  particles: Particle[] = [];
  chevrons: THREE.Mesh[] = [];
  dustTimer = 0;
  nightF = NIGHT_FLOOR; // deep dusk → full night, never noon
  streetGlow: THREE.PointLight;
  hudTimer = 0;
  running = true;
  clock = new THREE.Clock();
  isMobile = false;
  quality: "high" | "low";
  camPos = new THREE.Vector3(0, 5, -28);
  osmWorld: AccraWorldRuntime;
  osmActive = false;
  osmPlay: OsmGameplay | null = null;
  private _osmRoute: { x: number; z: number }[] = [];
  private _osmRouteTarget = "";
  private _osmRouteAt = 0;
  private _osmRouteFromX = 0;
  private _osmRouteFromZ = 0;
  private _bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private _fuelWarned = false;

  constructor(public canvas: HTMLCanvasElement) {
    this.isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || "ontouchstart" in window;
    this.quality = this.isMobile ? "low" : "high";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // HDR tone mapping for photorealistic lighting
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.scene.background = new THREE.Color(0x0b1024);

    // Stylized Tropical Sky Dome
    const skyDomeGeo = new THREE.SphereGeometry(350, 24, 16);
    const skyDomeMat = new THREE.MeshBasicMaterial({
      map: skyDomeTexture(),
      side: THREE.BackSide,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
    this.scene.add(this.skyDome);

    this.world = buildWorld(this.scene, this.isMobile);
    this.streetGlow = new THREE.PointLight(0xffb15a, 18, 24, 2);
    this.streetGlow.position.set(0, 5.2, 0);
    this.scene.add(this.streetGlow);
    this.osmWorld = new AccraWorldRuntime(this.scene, this.isMobile);
    this.rig = buildRider();
    this.scene.add(this.rig.group);
    this.walker = buildHumanoid({
      skin: 0x5d3a1a, shirt: 0xf2e35c, pants: 0x26394a, shoes: 0x151719,
      hair: "short", hairColor: 0x1a120c, longSleeves: true, detail: "full",
    });
    this.walker.group.visible = false;
    this.scene.add(this.walker.group);
    // attach world headlight to rig
    this.world.headlight = this.rig.headlight;
    // nav chevrons
    const geo = new THREE.ConeGeometry(0.55, 1.1, 4);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf2e35c, transparent: true, opacity: 0.9 }));
      m.rotation.x = Math.PI / 2;
      this.scene.add(m);
      this.chevrons.push(m);
    }
    this.resize();
    window.addEventListener("resize", this.resize);
    this.bindKeys();
    this.loop();
    void this.initializeAccraWorld();
  }

  private async initializeAccraWorld() {
    const available = await this.osmWorld.initialize();
    if (!available || !this.running) return;
    await this.osmWorld.prime(this.px, this.pz);
    if (!this.osmWorld.ready || !this.running) return;

    // Preserve mission markers while hiding the old handcrafted city.
    this.scene.attach(this.world.pickupMarker);
    this.scene.attach(this.world.dropMarker);
    this.scene.attach(this.world.arrowHelper);
    this.world.group.visible = false;

    // Do not collide with invisible fallback actors once the real map is active.
    this.world.traffic.length = 0;
    this.world.peds.length = 0;
    this.world.ramps.length = 0;
    this.world.potholes.length = 0;
    this.world.coins.length = 0;
    this.world.fuelStations.length = 0;
    this.world.colliders.length = 0;

    const snapped = this.osmWorld.nearestRoadPoint(this.px, this.pz, 120);
    if (snapped) { this.px = snapped.x; this.pz = snapped.z; }
    this.osmActive = true;
    this.osmPlay = new OsmGameplay(this.scene, this.osmWorld, this.isMobile);
    this.osmPlay.start(this.px, this.pz);
    useGame.getState().pushToast("🗺️ Real Accra map loaded");
  }

  private tickOsm(dt: number, elapsed: number) {
    if (!this.osmActive || !this.osmPlay) return;
    void this.osmWorld.update(this.px, this.pz);
    const order = useGame.getState().order;
    const zones = order
      ? [{ x: order.pickupX, z: order.pickupZ, r: 22 }, { x: order.dropX, z: order.dropZ, r: 22 }]
      : [];
    this.osmPlay.update(dt, this.px, this.pz, elapsed, zones);
  }

  private placeActor(x: number, z: number): { x: number; z: number; yaw: number } {
    if (!this.osmActive) return { x: x + 3.5, z: z + 1, yaw: 0 };
    const spot = chooseRoadside({
      nearestFrame: (px, pz, max) => this.osmWorld.nearestRoadFrame(px, pz, max),
      blocked: (px, pz) => {
        if (this.osmWorld.collidesBuilding(px, pz, 0.55)) return true;
        const frame = this.osmWorld.nearestRoadFrame(px, pz, 6);
        return !!frame && Math.hypot(px - frame.x, pz - frame.z) < frame.width * 0.38;
      },
    }, x, z);
    return spot ?? { x: x + 3.5, z: z + 1, yaw: 0 };
  }

  collectMinimap(): MinimapFrame | null {
    if (!this.osmActive) return null;
    const state = useGame.getState();
    const order = state.order;
    const phase = state.phase;
    const navigating = phase === "offer" || phase === "toPickup" || phase === "toDropoff";
    return buildMinimapFrame({
      px: this.px,
      pz: this.pz,
      roads: this.osmWorld.visibleRoads(this.px, this.pz, 1),
      route: navigating ? this._osmRoute : [],
      pickup: order && (phase === "offer" || phase === "toPickup" || phase === "pickup") ? { x: order.pickupX, z: order.pickupZ } : null,
      drop: order && (phase === "toDropoff" || phase === "deliver") ? { x: order.dropX, z: order.dropZ } : null,
      fuel: (this.osmPlay?.fuelBodies() ?? []).map(station => ({ x: station.x, z: station.z })),
      landmarks: this.osmWorld.locations.map(location => ({ x: location.x, z: location.z, name: location.name })),
      radius: 130,
    });
  }

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private _onKeyDown = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (e.code === "Escape" || e.code === "KeyP") {
      e.preventDefault();
      const s = useGame.getState();
      if (s.paused) this.resumeGame();
      else this.pauseGame();
      return;
    }
    this.audio.ensure();
    this._applyKey(e.code, true);
    if (e.code === "KeyF" && !e.repeat) this.toggleFoot();
    if (e.code === "KeyH" && !e.repeat) { this.audio.horn(); useGame.getState().pushToast("📯 Poooop!"); }
    if (e.code === "Enter") this.confirm();
  };
  private _onKeyUp = (e: KeyboardEvent) => this._applyKey(e.code, false);

  private _applyKey(code: string, v: boolean) {
    if (code === "KeyW" || code === "ArrowUp") this.input.up = v;
    if (code === "KeyS" || code === "ArrowDown") this.input.down = v;
    if (code === "KeyA" || code === "ArrowLeft") this.input.left = v;
    if (code === "KeyD" || code === "ArrowRight") this.input.right = v;
    if (code === "Space") this.input.boost = v;
  }

  private _onVis = () => { if (document.hidden) this.pauseGame(); };

  bindKeys() {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("visibilitychange", this._onVis);
  }

  confirm() {
    const s = useGame.getState();
    if (s.paused) { this.resumeGame(); return; }
    if (s.phase === "offer") this.acceptOrder();
  }

  toggleFoot() {
    const s = useGame.getState();
    if (s.paused) return;
    const allowed = s.phase === "offer" || s.phase === "toPickup" || s.phase === "toDropoff" || s.phase === "pickup" || s.phase === "deliver" || s.phase === "delivered";
    if (!allowed) return;
    if (!this.onFoot) {
      if (s.phase === "pickup" || s.phase === "deliver") {
        s.pushToast("Finish the handoff, then hop off.");
        return;
      }
      const spot = chooseDismountPoint(this.px, this.pz, this.heading, (x, z) => this.footBlocked(x, z, false));
      this.bikeX = this.px;
      this.bikeZ = this.pz;
      this.bikeHeading = this.heading;
      this.px = spot.x;
      this.pz = spot.z;
      this.speed = 0;
      this.boostOn = false;
      this.onFoot = true;
      this.walkMoving = false;
      s.set({ onFoot: true, nearBike: true });
      s.pushToast("On foot. WASD to walk — F remounts the bike.");
      return;
    }
    if (!canRemount(this.px, this.pz, this.bikeX, this.bikeZ)) {
      s.pushToast("Walk back to your okada to remount.");
      return;
    }
    this.px = this.bikeX;
    this.pz = this.bikeZ;
    this.heading = this.bikeHeading;
    this.speed = 0;
    this.onFoot = false;
    this.walkMoving = false;
    s.set({ onFoot: false, nearBike: false });
    s.pushToast("Back on the bike.");
  }

  private footBlocked(x: number, z: number, bike: boolean): boolean {
    if (this.osmActive) {
      if (this.osmWorld.collidesBuilding(x, z, 0.42)) return true;
    } else {
      for (const col of this.world.colliders) {
        if (x >= col.minX && x <= col.maxX && z >= col.minZ && z <= col.maxZ) return true;
      }
    }
    return bike && Math.hypot(x - this.bikeX, z - this.bikeZ) < BIKE_BODY_RADIUS;
  }

  private stepOnFoot(dt: number) {
    const forward = (this.input.up ? 1 : 0) - (this.input.down ? 1 : 0);
    const turn = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const command = {
      forward: forward > 0 ? 1 : forward < 0 ? -1 : 0,
      turn: turn > 0 ? 1 : turn < 0 ? -1 : 0,
    } as const;
    const next = stepWalk(
      { x: this.px, z: this.pz, heading: this.heading },
      command,
      dt,
      (x, z) => this.footBlocked(x, z, true),
    );
    if (this.osmActive) {
      this.px = THREE.MathUtils.clamp(next.x, -2500, 3800);
      this.pz = THREE.MathUtils.clamp(next.z, -3200, 1600);
    } else {
      this.px = THREE.MathUtils.clamp(next.x, -98, 98);
      this.pz = THREE.MathUtils.clamp(next.z, -98, 98);
    }
    this.heading = next.heading;
    this.walkMoving = next.moving;
    this.speed = 0;
    this.boostOn = false;
  }

  pauseGame() {
    const s = useGame.getState();
    if (s.paused) return;
    if (!["offer", "countdown", "toPickup", "pickup", "toDropoff", "deliver", "delivered"].includes(s.phase)) return;
    s.set({ paused: true });
    this.audio.setPaused(true);
  }

  resumeGame() {
    const s = useGame.getState();
    if (!s.paused) return;
    s.set({ paused: false });
    this.audio.setPaused(false);
  }

  quitToMenu() {
    const s = useGame.getState();
    s.set({ paused: false, phase: "menu", order: null, banner: null, timeLeft: 0, turnHint: "", onFoot: false, nearBike: false });
    this.onFoot = false;
    this.walkMoving = false;
    this.audio.setPaused(false);
    this.audio.setEngine(0, false);
    this.clearNPCs();
    this.world.setMarkers(null, null, "menu");
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
      this.scene.remove(this.targetLabel);
      this.targetLabel = null;
    }
    this.speed = 0;
  }

  startRun() {
    const s = useGame.getState();
    s.set({
      phase: "countdown", countdown: 3, order: null, orderIndex: 0,
      earnings: 0, xp: 0, deliveries: 0, streak: 0, bestStreak: 0,
      rating: 5.0, ratingsCount: 0, score: 0, strikes: 0, timeLeft: 0,
      lastDelivery: null, banner: null, fuel: 100, paused: false, onFoot: false, nearBike: false,
    });
    this.onFoot = false;
    this.walkMoving = false;
    this.audio.setPaused(false);
    this._fuelWarned = false;
    this.px = 0; this.pz = -18; this.heading = Math.PI; this.speed = 0;
    if (this.osmActive) {
      const snapped = this.osmWorld.nearestRoadPoint(this.px, this.pz, 120);
      if (snapped) { this.px = snapped.x; this.pz = snapped.z; }
    }
    this.nightF = NIGHT_FLOOR; this.orderCollisions = 0;
    this.clearNPCs();
    this.countdownT = 3.2;
    this.audio.ensure();
    this.audio.blip(523, 0.3, "sawtooth", 0.25); // engine rev
  }

  offerNext() {
    const s = useGame.getState();
    const order = this.osmActive
      ? separateOrderFromRider(makeOrder(s.orderIndex), this.px, this.pz, s.orderIndex)
      : makeOrder(s.orderIndex);
    if (this.osmActive) {
      const pickup = this.osmWorld.nearestRoadPoint(order.pickupX, order.pickupZ, 180);
      const drop = this.osmWorld.nearestRoadPoint(order.dropX, order.dropZ, 180);
      if (pickup) { order.pickupX = pickup.x; order.pickupZ = pickup.z; }
      if (drop) { order.dropX = drop.x; order.dropZ = drop.z; }
      const route = this.osmWorld.route({ x: order.pickupX, z: order.pickupZ }, { x: order.dropX, z: order.dropZ });
      const routed = polylineLength(route);
      const straight = Math.hypot(order.dropX - order.pickupX, order.dropZ - order.pickupZ);
      if (straight > 20 && routed > straight * 1.15) {
        order.timeTotal = Math.round(order.timeTotal * Math.min(1.85, routed / straight));
      }
    }
    this._osmRouteTarget = "";
    this._osmRoute.length = 0;
    s.set({ phase: "offer", order, timeLeft: order.timeTotal, banner: null });
    this.world.setMarkers({ x: order.pickupX, z: order.pickupZ }, null, "offer");
    this.spawnVendor(order);
    this.setTargetLabel(`${order.vendor}`, order.pickupX, order.pickupZ);
    this.audio.blip(880, 0.2, "sine", 0.3);
    this.audio.blip(1174, 0.25, "sine", 0.3, 0.15);
  }

  acceptOrder() {
    const s = useGame.getState();
    if (s.phase !== "offer" || !s.order) return;
    s.set({ phase: "toPickup" });
    this.world.setMarkers({ x: s.order.pickupX, z: s.order.pickupZ }, null, "toPickup");
    s.pushToast(`Order accepted — head to ${s.order.vendor}!`);
  }

  private _pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

  spawnVendor(order: { pickupX: number; pickupZ: number }) {
    this.clearNPCs();
    const rig = buildHumanoid({
      skin: this._pick(SKIN_TONES),
      shirt: this._pick([0x0b3d2e, 0x6b1d3a, 0x143d6b, 0xe9ecef]),
      pants: 0x2b2b2b,
      hair: this._pick(["afro", "short", "cap", "wrap"] as HairStyle[]),
      capColor: this._pick([0xd6336c, 0x1971c2, 0xf2e35c]),
      scale: 0.96 + Math.random() * 0.08,
      bulk: 0.96 + Math.random() * 0.1,
      feminine: Math.random() < 0.4,
      apron: true,
      apronColor: 0xe67700,
    });
    const bag = buildHandBag(0xf2e35c);
    bag.position.set(0, -0.02, 0.05);
    rig.armL.hand.add(bag);
    const spot = this.placeActor(order.pickupX, order.pickupZ);
    rig.group.position.set(spot.x, 0, spot.z);
    rig.group.rotation.y = spot.yaw;
    this.scene.add(rig.group);
    this.vendorNPC = rig.group;
    this.vendorRig = rig;
  }
  spawnCustomer(order: { dropX: number; dropZ: number }) {
    if (this.vendorNPC) { this._disposeGroup(this.vendorNPC); this.scene.remove(this.vendorNPC); this.vendorNPC = null; this.vendorRig = null; }
    const rig = buildHumanoid({
      skin: this._pick(SKIN_TONES),
      shirt: this._pick([0xd6336c, 0x2f9e44, 0xe9ecef, 0x1971c2]),
      pants: this._pick([0x1971c2, 0x343a40, 0x2b2b2b]),
      hair: this._pick(["afro", "short", "wrap", "bald", "cap"] as HairStyle[]),
      capColor: this._pick([0xd6336c, 0x1971c2, 0x2f9e44]),
      scale: 0.93 + Math.random() * 0.12,
      bulk: 0.9 + Math.random() * 0.2,
      feminine: Math.random() < 0.4,
      longSleeves: Math.random() < 0.3,
      shorts: Math.random() < 0.3,
    });
    const spot = this.placeActor(order.dropX, order.dropZ);
    rig.group.position.set(spot.x, 0, spot.z);
    rig.group.rotation.y = spot.yaw;
    this.scene.add(rig.group);
    this.customerNPC = rig.group;
    this.customerRig = rig;
  }
  clearNPCs() {
    if (this.vendorNPC) { this._disposeGroup(this.vendorNPC); this.scene.remove(this.vendorNPC); }
    if (this.customerNPC) { this._disposeGroup(this.customerNPC); this.scene.remove(this.customerNPC); }
    this.vendorNPC = this.customerNPC = null;
    this.vendorRig = this.customerRig = null;
  }

  private _disposeGroup(g: THREE.Group) {
    g.traverse((o) => {
      if (o.userData.shared) return; // shared humanoid assets persist across spawns
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
  }

  /** Ease an NPC around to face the rider instead of snapping. */
  private _faceRider(obj: THREE.Object3D, dt: number) {
    const want = Math.atan2(this.px - obj.position.x, this.pz - obj.position.z);
    let dy = want - obj.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    obj.rotation.y += dy * Math.min(1, dt * 3.2);
  }

  /** Per-frame NPC animation: face the player, wave, walk up, or hand off. */
  private settleRoadside(group: THREE.Group | null, anchorX: number, anchorZ: number) {
    if (!group || !this.osmActive) return;
    if (Math.hypot(this.px - anchorX, this.pz - anchorZ) > 90) return;
    if (!this.osmWorld.nearestRoadFrame(anchorX, anchorZ, 30)) return;
    const crowded = !!this.osmWorld.collidesBuilding(group.position.x, group.position.z, 0.45);
    const frame = this.osmWorld.nearestRoadFrame(group.position.x, group.position.z, 8);
    const inLane = !!frame && Math.hypot(group.position.x - frame.x, group.position.z - frame.z) < frame.width * 0.35;
    if (!crowded && !inLane) return;
    const spot = this.placeActor(anchorX, anchorZ);
    group.position.set(spot.x, 0, spot.z);
    group.rotation.y = spot.yaw;
  }

  private animateNPCs(t: number, phase: string, dt: number) {
    const order = useGame.getState().order;
    if (order && (phase === "offer" || phase === "toPickup")) this.settleRoadside(this.vendorNPC, order.pickupX, order.pickupZ);
    if (order && phase === "toDropoff") this.settleRoadside(this.customerNPC, order.dropX, order.dropZ);
    if (this.vendorRig && this.vendorNPC) {
      const v = this.vendorNPC;
      this._faceRider(v, dt);
      const d = Math.hypot(this.px - v.position.x, this.pz - v.position.z);
      if (phase === "pickup") {
        if (d > 2.3) animateWalk(this.vendorRig, t, 5);
        else animateHandoff(this.vendorRig, t);
      } else if (phase === "offer" || phase === "toPickup") {
        if ((t % 7) < 1.6) animateWave(this.vendorRig, t);
        else animateIdle(this.vendorRig, t, 2.3);
      }
    }
    if (this.customerRig && this.customerNPC) {
      const c = this.customerNPC;
      this._faceRider(c, dt);
      const d = Math.hypot(this.px - c.position.x, this.pz - c.position.z);
      if (phase === "deliver") {
        if (d > 2.3) animateWalk(this.customerRig, t, 5);
        else animateReceive(this.customerRig, t);
      } else if (phase === "toDropoff") {
        if ((t % 8) < 1.6) animateWave(this.customerRig, t);
        else animateIdle(this.customerRig, t, 4.1);
      }
    }
  }
  setTargetLabel(text: string, x: number, z: number) {
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
      this.scene.remove(this.targetLabel);
      this.targetLabel = null;
    }
    const tex = textTexture(`📍 ${text}`, { bg: "#0b0b0c", fg: "#f2e35c", border: "#f2e35c", w: 512, h: 128 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(7.2, 1.8, 1);
    sp.position.set(x, 4.6, z);
    this.scene.add(sp);
    this.targetLabel = sp;
  }

  onRoad(x: number, z: number) {
    if (this.osmActive) return this.osmWorld.isOnRoad(x, z, 1.2);
    if (Math.abs(x) < 6.8 || Math.abs(z) < 6.8) return true;
    if (Math.abs(Math.abs(x) - 60) < 5.4 && Math.abs(z) < 66) return true;
    if (Math.abs(Math.abs(z) - 60) < 5.4 && Math.abs(x) < 66) return true;
    return false;
  }

  crash(why: string) {
    const s = useGame.getState();
    if (this.crashCool > 0) return;
    this.crashCool = 1.6;
    this.speed = -Math.min(3, Math.abs(this.speed) * 0.15); // slight bounce-back
    this.shake = 1.2;
    this.orderCollisions++;
    this.audio.crash();
    this.sparks(this.px, this.pz);
    const strikes = s.strikes + 1;
    const streak = 0;
    const rating = Math.max(2.5, s.rating - 0.3);
    s.set({ strikes, streak, rating });
    s.pushToast(why);
    if (strikes >= 3) this.gameOver();
    else s.set({ banner: `CRASH! ${3 - strikes} ${3 - strikes === 1 ? "chance" : "chances"} left` });
  }

  failOrder(why: string) {
    const s = useGame.getState();
    this.audio.fail();
    const strikes = s.strikes + 1;
    s.set({ strikes, streak: 0, rating: Math.max(2.5, s.rating - 0.4) });
    s.pushToast(why);
    if (strikes >= 3) { this.gameOver(); return; }
    s.set({ orderIndex: s.orderIndex + 1 });
    this.offerNext();
  }

  completeDelivery() {
    const s = useGame.getState();
    const o = s.order!;
    const timeBonus = Math.max(0, Math.round(s.timeLeft * 5));
    const noCrash = this.orderCollisions === 0;
    const newStreak = s.streak + 1;
    const mult = newStreak >= 10 ? 2 : newStreak >= 5 ? 1.5 : newStreak >= 3 ? 1.25 : 1;
    const reward = Math.round(o.reward * mult * 100) / 100;
    const xpGain = Math.round((o.xp + timeBonus + (noCrash ? 200 : 0)) * mult);
    const ratingNew = Math.min(5, Math.max(3.2, 5 - this.orderCollisions * 0.4 - (s.timeLeft < 10 ? 0.3 : 0)));
    const ratingsCount = s.ratingsCount + 1;
    const rating = Math.round(((s.rating * s.ratingsCount + ratingNew) / ratingsCount) * 10) / 10;
    const score = s.score + xpGain + Math.round(reward * 100);
    const deliveries = s.deliveries + 1;
    this.audio.deliver();
    s.set({
      phase: "delivered", earnings: Math.round((s.earnings + reward) * 100) / 100,
      xp: s.xp + xpGain, deliveries, streak: newStreak,
      bestStreak: Math.max(s.bestStreak, newStreak),
      rating, ratingsCount, score,
      lastDelivery: { reward, xp: xpGain, rating: ratingNew, streak: newStreak },
      banner: null,
    });
    if (noCrash) s.pushToast("✨ PERFECT DELIVERY · NO COLLISION BONUS");
    if (s.timeLeft > o.timeTotal * 0.4) s.pushToast("⚡ EXPRESS DELIVERY +500");
    this.deliveredT = 2.6;
    this.world.setMarkers(null, null, "delivered");
    if (this.targetLabel) { this.scene.remove(this.targetLabel); this.targetLabel = null; }
    // Deep dusk already; later deliveries only settle into full night.
    this.nightF = Math.min(1, NIGHT_FLOOR + (1 - NIGHT_FLOOR) * (deliveries / 10));
  }

  gameOver() {
    const s = useGame.getState();
    s.set({ phase: "gameover" });
    this.audio.fail();
    this.world.setMarkers(null, null, "gameover");
    saveBoard(s.nickname || "Rider", s.score);
  }

  spawnPuff(x: number, y: number, z: number, color: number, n = 6, spread = 2) {
    if (this.isMobile && this.particles.length > 60) return;
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
      const m = new THREE.Mesh(particleGeo, mat);
      const s = rand(0.08, 0.2) / 0.15;
      m.scale.set(s, s, s);
      m.position.set(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4));
      this.scene.add(m);
      this.particles.push({ mesh: m, vx: rand(-spread, spread), vy: rand(1, 3), vz: rand(-spread, spread), life: 0, max: rand(0.4, 0.9) });
    }
  }
  sparks(x: number, z: number) { this.spawnPuff(x, 1, z, 0xffd43b, 14, 5); }

  update(dt: number) {
    const s = useGame.getState();
    const phase = s.phase;

    // paused: freeze gameplay, keep rendering
    if (s.paused) {
      this.audio.setEngine(0, false);
      return;
    }

    // ---- menu demo: slow orbit ----
    if (phase === "menu" || phase === "loading") {
      const t = performance.now() / 1000;
      this.px = Math.sin(t * 0.1) * 4; this.pz = -18;
      this.heading = Math.PI + Math.sin(t * 0.2) * 0.2;
      this.speed = 0;
      if (this.osmActive) {
        const snapped = this.osmWorld.nearestRoadPoint(0, -18, 80);
        if (snapped) { this.px = snapped.x + Math.sin(t * 0.1) * 4; this.pz = snapped.z; }
      }
      this.tickOsm(dt, t);
      this.world.update(dt, t, NIGHT_FLOOR, this.px, this.pz);
      this.syncRig(dt, t, 0);
      this.updateCamera(dt, true);
      this.applySky(NIGHT_FLOOR);
      return;
    }

    // countdown
    if (phase === "countdown") {
      this.countdownT -= dt;
      const c = Math.ceil(this.countdownT);
      if (c !== s.countdown && c >= 0) {
        s.set({ countdown: Math.max(0, c) });
        if (c > 0) this.audio.countBeep(false); else { this.audio.countBeep(true); s.pushToast("LET'S RIDE! 🛵"); }
      }
      if (this.countdownT <= 0) this.offerNext();
    }

    const riding = ["offer", "toPickup", "pickup", "toDropoff", "deliver"].includes(phase);
    const canDrive = ["offer", "toPickup", "toDropoff"].includes(phase) && !this.onFoot;

    // --- physics ---
    const orderDiff = Math.min(1, s.orderIndex / 10);
    const maxSp = 26 + orderDiff * 2;
    const boostMax = 37;
    const wantBoost = this.input.boost && s.boost > 1 && this.input.up;
    this.boostOn = wantBoost && canDrive;
    const wantReverse = this.input.down && Math.abs(this.speed) <= 0.3;
    const target = !canDrive ? 0 : this.input.up ? (this.boostOn ? boostMax : maxSp) : wantReverse ? -5.5 : 0;
    const accel = this.input.down ? 34 : 20;
    // Can't accelerate without fuel
    const effectiveTarget = s.fuel <= 0 ? 0 : target;
    if (this.speed < effectiveTarget) this.speed = Math.min(effectiveTarget, this.speed + accel * dt);
    else if (this.speed > effectiveTarget) this.speed = Math.max(effectiveTarget, this.speed - (this.input.up ? 4 : 26) * dt);
    if (!this.onRoad(this.px, this.pz) && this.speed > 8) this.speed = Math.max(8, this.speed - 14 * dt);
    if (this.boostOn) s.boost = Math.max(0, s.boost - 22 * dt);
    else s.boost = Math.min(100, s.boost + (this.speed > 12 ? 6 : 3.5) * dt);

    // Fuel consumption
    if (canDrive && Math.abs(this.speed) > 0.5) {
      const fuelRate = this.boostOn ? BOOST_FUEL_PER_SECOND : CRUISE_FUEL_PER_SECOND;
      s.fuel = Math.max(0, s.fuel - fuelRate * dt);
    }
    // Out of fuel — can't accelerate
    if (!this.onFoot && s.fuel <= 0) {
      this.speed = Math.max(0, this.speed - 12 * dt); // coast to stop
      if (this.speed < 0.5 && this._fuelWarned !== true) {
        this._fuelWarned = true;
        s.pushToast("⛽ OUT OF FUEL! Find a fuel station!");
        s.set({ banner: "OUT OF FUEL ⛽" });
      }
    }

    const steerAuthority = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1) * (this.speed >= 0 ? 1 : -1);
    if (canDrive && this.speed !== 0) {
      const steer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
      this.heading += steer * 2.1 * steerAuthority * dt * (this.boostOn ? 0.8 : 1);
    }
    if (this.onFoot) {
      this.stepOnFoot(dt);
    } else {
      const nx = this.px + Math.sin(this.heading) * this.speed * dt;
      const nz = this.pz + Math.cos(this.heading) * this.speed * dt;
      if (this.osmActive) {
        this.px = THREE.MathUtils.clamp(nx, -2500, 3800);
        this.pz = THREE.MathUtils.clamp(nz, -3200, 1600);
      } else {
        this.px = THREE.MathUtils.clamp(nx, -98, 98);
        this.pz = THREE.MathUtils.clamp(nz, -98, 98);
      }

      if (this.osmActive && riding && this.crashCool <= 0) {
        const hit = this.osmWorld.collidesBuilding(this.px, this.pz, 0.9);
        if (hit) {
          this.px -= Math.sin(this.heading) * this.speed * dt * 1.5;
          this.pz -= Math.cos(this.heading) * this.speed * dt * 1.5;
          this.crash(`💥 Collided with ${hit}! Easy oo.`);
        }
      }
    }

    // ramps & potholes
    this.crashCool = Math.max(0, this.crashCool - dt);
    this.potCool = Math.max(0, this.potCool - dt);
    this.nearCool = Math.max(0, this.nearCool - dt);
    if (this.py > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.py += this.vy * dt;
      if (this.py <= 0) { this.py = 0; this.vy = 0; this.bump = 0.5; this.shake = Math.max(this.shake, 0.4); }
    }
    const osm = this.osmPlay;
    const traffic = osm ? osm.trafficBodies() : this.world.traffic;
    const walkers = osm ? osm.walkerBodies() : this.world.peds;
    const ramps = osm ? osm.ramps() : this.world.ramps;
    const potholes = osm ? osm.potholes() : this.world.potholes;
    const coins = osm ? osm.coins() : this.world.coins;
    const fuels = osm ? osm.fuelBodies() : this.world.fuelStations;
    let activeTraffic = traffic;
    if (!osm) {
      const cap = 8 + Math.round(orderDiff * 6);
      this.world.traffic.forEach((car, index) => { car.mesh.visible = index < cap; });
      activeTraffic = this.world.traffic.filter((_, index) => index < cap);
    }

    for (const r of ramps) {
      const d = Math.hypot(this.px - r.x, this.pz - r.z);
      if (d < r.r && Math.abs(this.speed) > 13 && this.py === 0) {
        this.vy = 6; this.speed *= 0.88; this.shake = Math.max(this.shake, 0.5);
        s.pushToast("⛰️ Speed ramp!");
      }
    }
    for (const p of potholes) {
      const d = Math.hypot(this.px - p.x, this.pz - p.z);
      if (d < p.r && this.py === 0 && this.potCool <= 0 && Math.abs(this.speed) > 6) {
        this.potCool = 1.2; this.vy = 3.4; this.speed *= 0.7;
        this.shake = Math.max(this.shake, 0.7);
        this.audio.noise(0.15, 0.3);
        s.pushToast("🕳️ Pothole!");
      }
    }

    // Solid world building collisions (stops phasing through walls!)
    if (riding && !this.onFoot && this.crashCool <= 0 && this.world.colliders) {
      for (const col of this.world.colliders) {
        if (this.px >= col.minX && this.px <= col.maxX && this.pz >= col.minZ && this.pz <= col.maxZ) {
          this.crash(`💥 Collided with ${col.name}! Easy oo.`);
          const cx = (col.minX + col.maxX) / 2;
          const cz = (col.minZ + col.maxZ) / 2;
          const angle = Math.atan2(this.px - cx, this.pz - cz);
          this.px += Math.sin(angle) * 1.6;
          this.pz += Math.cos(angle) * 1.6;
          break;
        }
      }
    }

    if (riding && !this.onFoot) {
      for (const c of activeTraffic) {
        if (!c.mesh.visible) continue;
        const d = Math.hypot(this.px - c.mesh.position.x, this.pz - c.mesh.position.z);
        const reach = trafficReach(c.kind);
        const crashLine = trafficCrashLine(c.kind);
        if (d < reach && Math.abs(this.speed) > 4) { this.crash(crashLine); break; }
        else if (d < reach && this.crashCool <= 0) { this.speed *= 0.4; }
        if (d > reach && d < reach + 1.8 && Math.abs(this.speed) > 16 && this.nearCool <= 0) {
          this.nearCool = 2;
          s.set({ score: s.score + 100, xp: s.xp + 25 });
          s.pushToast("😱 NEAR MISS +100");
          this.audio.coin();
        }
      }
      // peds & goats — physical crash response with ragdoll tumble
      for (const p of walkers) {
        const pdx = this.px - p.mesh.position.x;
        const pdz = this.pz - p.mesh.position.z;
        const d = Math.sqrt(pdx * pdx + pdz * pdz);
        if (d < 1.9 && Math.abs(this.speed) > 2.5 && this.crashCool <= 0) {
          // Physical crash impact: launch pedestrian in bike heading direction
          const hitPower = Math.min(22, Math.max(8, Math.abs(this.speed) * 1.2));
          p.vx = Math.sin(this.heading) * hitPower;
          p.vz = Math.cos(this.heading) * hitPower;
          p.tumble = 2.4; // tumble on ground
          p.mesh.position.y = 0.1;
          
          this.spawnPuff(p.mesh.position.x, 0.4, p.mesh.position.z, 0xdddddd, 10, 2);
          this.sparks(p.mesh.position.x, p.mesh.position.z);
          
          // Rider preserves forward momentum (no freezing)
          this.speed = Math.max(3.5, this.speed * 0.6);
          this.shake = 1.0;
          this.orderCollisions++;
          s.set({ score: Math.max(0, s.score - 50) });
          s.pushToast(p.goat ? "🐐 Oof! Goat knocked down!" : "💥 BAM! Pedestrian wiped out! Easy oo!");
          this.audio.crash();
          this.crashCool = 0.8;
          break;
        }
      }
      // coins
      for (const c of coins) {
        if (c.taken) continue;
        if (Math.hypot(this.px - c.x, this.pz - c.z) < 2.2) {
          c.taken = true; c.mesh.visible = false;
          s.set({ xp: s.xp + 50, score: s.score + 50, boost: Math.min(100, s.boost + 15) });
          s.pushToast("🪙 Night Market coin +50 XP");
          this.audio.coin();
        }
      }
      // Fuel stations
      if (fuels) {
        for (const fs of fuels) {
          const d = Math.hypot(this.px - fs.x, this.pz - fs.z);
          if (d < 6.0 && Math.abs(this.speed) < 6.0) {
            if (s.fuel < 98) {
              const refuelRate = 35 * dt; // refuels in ~3 seconds
              const newFuel = Math.min(100, s.fuel + refuelRate);
              s.set({ fuel: newFuel });
              if (s.fuel < 30 && newFuel >= 30) {
                s.pushToast(`⛽ Refueling at ${osm ? fuelBrand(fs) : "GOIL"}...`);
                s.set({ banner: null });
                this._fuelWarned = false;
              }
              if (newFuel >= 99) {
                s.pushToast("⛽ Tank full! 100% — Let's ride!");
                s.set({ banner: null });
                this._fuelWarned = false;
              }
            }
          }
        }
      }
    }

    // --- order flow ---
    const o = s.order;
    if (o) {
      if (phase === "toPickup") {
        const tl = s.timeLeft - dt;
        s.set({ timeLeft: tl });
        const d = Math.hypot(this.px - o.pickupX, this.pz - o.pickupZ);
        // smooth deceleration near vendor (no harsh sudden jerk)
        if (d < 14) {
          const maxAllowed = 8 + (d / 14) * 14;
          if (this.speed > maxAllowed) this.speed = Math.max(maxAllowed, this.speed - 22 * dt);
        }
        if (tl <= 0) {
          this.failOrder("⏰ Vendor wait time expired! Order cancelled.");
          return;
        }
        if (d < 4.2) {
          s.set({ phase: "pickup" });
          this.pickupT = 1.8;
          this.audio.pickup();
          s.pushToast("PICKING UP ORDER… 📦");
        }
      } else if (phase === "pickup") {
        this.pickupT -= dt;
        this.speed = Math.max(0, this.speed - 20 * dt);
        if (this.vendorNPC) {
          this.vendorNPC.position.x += ((this.px + 2.5) - this.vendorNPC.position.x) * dt * 2;
          this.vendorNPC.position.z += ((this.pz + 1) - this.vendorNPC.position.z) * dt * 2;
        }
        // box lid pops
        this.rig.boxLid.position.y = 0.58 + Math.sin((1.8 - this.pickupT) * 6) * 0.08 + 0.15;
        if (this.pickupT <= 0) {
          this.rig.boxLid.position.y = 0.58;
          this.orderCollisions = 0;
          // Allocate delivery time with prompt pickup bonus!
          const dropTime = Math.round(o.timeTotal * 0.65 + Math.max(5, s.timeLeft * 0.35));
          s.set({ phase: "toDropoff", timeLeft: dropTime });
          this.world.setMarkers(null, { x: o.dropX, z: o.dropZ }, "toDropoff");
          this.spawnCustomer(o);
          this.setTargetLabel(`${o.customer} · ${o.dropoff}`, o.dropX, o.dropZ);
          s.pushToast(`ORDER PICKED UP ✅ — Deliver to ${o.customer}`);
          this.audio.blip(990, 0.2, "triangle", 0.3);
        }
      } else if (phase === "toDropoff") {
        const tl = s.timeLeft - dt;
        s.set({ timeLeft: tl });
        const d = Math.hypot(this.px - o.dropX, this.pz - o.dropZ);
        // smooth deceleration near customer
        if (d < 14) {
          const maxAllowed = 8 + (d / 14) * 14;
          if (this.speed > maxAllowed) this.speed = Math.max(maxAllowed, this.speed - 22 * dt);
        }
        if (tl <= 0) { this.failOrder("⏰ Order late — customer cancelled. Fail."); }
        else if (d < 4.2) {
          s.set({ phase: "deliver" });
          this.deliverT = 2.0;
          this.audio.pickup();
          s.pushToast("HANDING OVER… 🍱");
        }
      } else if (phase === "deliver") {
        this.deliverT -= dt;
        this.speed = Math.max(0, this.speed - 20 * dt);
        if (this.customerNPC) {
          this.customerNPC.position.x += ((this.px + 2.2) - this.customerNPC.position.x) * dt * 2.4;
          this.customerNPC.position.z += ((this.pz + 1) - this.customerNPC.position.z) * dt * 2.4;
        }
        this.rig.boxLid.position.y = 0.58 + 0.18;
        if (this.deliverT <= 0) { this.rig.boxLid.position.y = 0.58; this.completeDelivery(); }
      } else if (phase === "delivered") {
        this.deliveredT -= dt;
        this.speed = Math.max(0, this.speed - 10 * dt);
        if (this.deliveredT <= 0) {
          s.set({ orderIndex: s.orderIndex + 1 });
          // reset coins occasionally
          if (s.orderIndex % 3 === 0) {
            if (this.osmPlay) this.osmPlay.resetCoins();
            else for (const c of this.world.coins) { c.taken = false; c.mesh.visible = true; }
          }
          this.offerNext();
        }
      }
    }

    // trotro banner — track timeout for cleanup
    for (const c of activeTraffic) {
      if (c.kind === "trotro" && c.stopped > 2.4 && c.stopped < 2.6) {
        if (Math.hypot(this.px - c.mesh.position.x, this.pz - c.mesh.position.z) < 30) {
          s.set({ banner: "TROTRO STOPPING!" });
          if (this._bannerTimer) clearTimeout(this._bannerTimer);
          this._bannerTimer = setTimeout(() => { if (useGame.getState().banner === "TROTRO STOPPING!") useGame.getState().set({ banner: null }); this._bannerTimer = null; }, 1800);
        }
      }
    }

    // particles: dust + exhaust
    this.dustTimer -= dt;
    if (!this.onFoot && (Math.abs(this.speed) > 14 || !this.onRoad(this.px, this.pz)) && this.dustTimer <= 0 && this.py === 0) {
      this.dustTimer = 0.06;
      this.spawnPuff(this.px - Math.sin(this.heading) * 1.2, 0.3, this.pz - Math.cos(this.heading) * 1.2, this.onRoad(this.px, this.pz) ? 0xcccccc : 0xc2a06b, 1, 1);
    }
    if (Math.abs(this.speed) > 4 && Math.random() < dt * 12) {
      this.rig.exhaust.getWorldPosition(_exhaustPos);
      this.spawnPuff(_exhaustPos.x, _exhaustPos.y, _exhaustPos.z, 0x888888, 1, 0.5);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - p.life / p.max);
      if (p.life >= p.max) {
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }

    const t = performance.now() / 1000;
    this.tickOsm(dt, t);
    this.world.update(dt, t, this.nightF, this.px, this.pz);
    this.animateNPCs(t, phase, dt);
    this.syncRig(dt, t, dt);
    this.updateNav(o, phase);
    this.updateCamera(dt, false);
    this.applySky(this.nightF);
    this.audio.setEngine(this.onFoot ? 0 : Math.min(1, Math.abs(this.speed) / 37), this.onFoot ? false : this.boostOn);
    if (s.banner && phase === "gameover") s.set({ banner: null });

    // throttled HUD sync
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      if (s.fuel < 20 && s.fuel > 0 && !this._fuelWarned) {
        s.pushToast("⛽ Fuel low! Find a station!");
      }
      const targetX = o && (phase === "toDropoff" || phase === "deliver" || phase === "delivered") ? o.dropX : o?.pickupX ?? 0;
      const targetZ = o && (phase === "toDropoff" || phase === "deliver" || phase === "delivered") ? o.dropZ : o?.pickupZ ?? 0;
      let distUnits = o ? Math.hypot(this.px - targetX, this.pz - targetZ) : 0;
      let turnHint = "";
      if (o && (phase === "toPickup" || phase === "toDropoff") && this.osmActive && this._osmRoute.length > 1) {
        const cue = cueFromRoute(this._osmRoute, this.px, this.pz, this.heading);
        turnHint = cue.text;
        distUnits = cue.remaining;
      } else if (o && (phase === "toPickup" || phase === "toDropoff") && !this.osmActive) {
        const want = Math.atan2(targetX - this.px, targetZ - this.pz);
        let diff = want - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (distUnits > 25 && Math.abs(diff) > 0.5) {
          turnHint = `${diff > 0 ? "← TURN LEFT" : "→ TURN RIGHT"} — ${formatWorldDistance(distUnits, "procedural")}`;
        }
        distUnits = worldUnitsToMetres(distUnits, "procedural");
      } else if (!this.osmActive) {
        distUnits = worldUnitsToMetres(distUnits, "procedural");
      }
      const nearBike = this.onFoot && canRemount(this.px, this.pz, this.bikeX, this.bikeZ);
      const speedKmh = this.onFoot
        ? Math.round((this.walkMoving ? WALK_SPEED : 0) * 3.6)
        : Math.round(Math.abs(this.speed) * (this.osmActive ? 3.6 : 3.2));
      s.set({ speedKmh, distM: distUnits, turnHint, nearBike });
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  syncRig(dt: number, t: number, step: number) {
    const parked = this.onFoot;
    const bikeX = parked ? this.bikeX : this.px;
    const bikeZ = parked ? this.bikeZ : this.pz;
    const bikeHeading = parked ? this.bikeHeading : this.heading;
    const bikeSpeed = parked ? 0 : this.speed;
    this.rig.group.position.set(bikeX, parked ? 0 : this.py, bikeZ);
    this.rig.group.rotation.y = bikeHeading;
    const steer = parked ? 0 : (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const stopped = Math.abs(bikeSpeed) < 1.5;
    // bike tilts slightly left when the rider plants a foot at a stop
    const leanTarget = -steer * Math.min(0.45, Math.abs(bikeSpeed) / 60) + Math.sin(t * 1.3) * 0.015 + (stopped ? 0.12 : 0);
    this.rig.lean.rotation.z += (leanTarget - this.rig.lean.rotation.z) * Math.min(1, 8 * (step || 0.016));
    this.rig.lean.rotation.x = !parked && this.py > 0 ? -0.12 : THREE.MathUtils.clamp(-bikeSpeed * 0.002, -0.06, 0) + (this.bump > 0 ? Math.sin(t * 40) * 0.02 : 0);
    this.bump = Math.max(0, this.bump - (step || 0.016));
    // wheels
    this.rig.frontWheel.rotation.x += bikeSpeed * (step || 0.016) * 2;
    this.rig.rearWheel.rotation.x += bikeSpeed * (step || 0.016) * 2;
    // Drop the hips when stopped so the left foot can reach the road. Tuck on boost.
    const sit = !parked && this.boostOn ? -0.08 : stopped ? -0.07 : 0;
    const sitK = Math.min(1, (step || 0.016) * 6);
    this.rig.body.position.y += (sit - this.rig.body.position.y) * sitK;
    this.rig.body.rotation.x += (((!parked && this.boostOn) ? 0.07 : 0) - this.rig.body.rotation.x) * sitK;
    (this.rig.brakeLight.material as THREE.MeshBasicMaterial).color.setHex(this.input.down ? 0xff2222 : 0x550000);
    this.rig.headlight.intensity = this.nightF > 0.35 ? 28 : 0;
    const r = this.rig.rider;
    if (r) {
      const phase = useGame.getState().phase;
      const interact = phase === "pickup" ? "pickup" : phase === "deliver" ? "deliver" : "none";
      r.group.visible = !parked;
      poseRider(r, {
        t, dt: step || 0.016, steer, speed: bikeSpeed, stopped,
        braking: !parked && this.input.down, boost: !parked && this.boostOn, interact: parked ? "none" : interact,
      }, {
        gripL: this.rig.gripL,
        gripR: this.rig.gripR,
        pegL: this.rig.pegL,
        pegR: this.rig.pegR,
        footDown: this.rig.footDown,
        frame: this.rig.lean,
        reach: !parked && interact === "pickup" ? this.vendorNPC : !parked && interact === "deliver" ? this.customerNPC : null,
      });
    }
    this.walker.group.visible = parked;
    if (parked) {
      this.walker.group.position.x = this.px;
      this.walker.group.position.z = this.pz;
      this.walker.group.rotation.y = this.heading;
      if (this.walkMoving) animateWalk(this.walker, t, 5.4);
      else animateIdle(this.walker, t, 0.4);
    }
  }

  updateNav(o: ReturnType<typeof makeOrder> | null, phase: string) {
    const show = !!o && (phase === "toPickup" || phase === "toDropoff" || phase === "offer");
    for (const c of this.chevrons) c.visible = show;
    if (!show || !o) return;
    const tx = phase === "toDropoff" ? o.dropX : o.pickupX;
    const tz = phase === "toDropoff" ? o.dropZ : o.pickupZ;

    if (this.osmActive) {
      const now = performance.now();
      const targetKey = `${phase}:${tx.toFixed(1)}:${tz.toFixed(1)}`;
      const moved = Math.hypot(this.px - this._osmRouteFromX, this.pz - this._osmRouteFromZ);
      const due = targetKey !== this._osmRouteTarget || now - this._osmRouteAt > 2500 || (moved > 16 && now - this._osmRouteAt > 650);
      if (due) {
        this._osmRoute = this.osmWorld.route({ x: this.px, z: this.pz }, { x: tx, z: tz });
        this._osmRouteTarget = targetKey;
        this._osmRouteAt = now;
        this._osmRouteFromX = this.px;
        this._osmRouteFromZ = this.pz;
      }
      const route = this._osmRoute;
      const pointAt = (wanted: number) => {
        let walked = 0;
        for (let j = 0; j < route.length - 1; j++) {
          const a = route[j], b = route[j + 1];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          if (walked + len >= wanted) {
            const u = len > 0 ? (wanted - walked) / len : 0;
            return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, ang: Math.atan2(b.x - a.x, b.z - a.z) };
          }
          walked += len;
        }
        return null;
      };
      for (let i = 0; i < this.chevrons.length; i++) {
        const p = pointAt(7 + i * 7);
        if (!p) { this.chevrons[i].visible = false; continue; }
        this.chevrons[i].visible = true;
        this.chevrons[i].position.set(p.x, 0.7 + Math.sin(now / 300 + i) * 0.15, p.z);
        this.chevrons[i].rotation.z = -p.ang;
      }
    } else {
      const dx = tx - this.px, dz = tz - this.pz;
      const dist = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz);
      const n = this.chevrons.length;
      for (let i = 0; i < n; i++) {
        const d = 6 + i * 5;
        if (d > dist - 3) { this.chevrons[i].visible = false; continue; }
        this.chevrons[i].visible = true;
        this.chevrons[i].position.set(this.px + Math.sin(ang) * d, 0.7 + Math.sin(performance.now() / 300 + i) * 0.15, this.pz + Math.cos(ang) * d);
        this.chevrons[i].rotation.z = -ang;
      }
    }
    if (this.targetLabel) this.targetLabel.position.y = 4.6 + Math.sin(performance.now() / 400) * 0.25;
  }

  applySky(night: number) {
    const n = THREE.MathUtils.clamp(night, 0, 1);
    if (n < 0.5) _skyResult.lerpColors(_skyDay, _skySunset, n * 2);
    else _skyResult.lerpColors(_skySunset, _skyNight, (n - 0.5) * 2);
    _fogResult.copy(_skyResult).lerp(_fogNight, n);
    this.scene.background = _skyResult;
    if (this.scene.fog) this.scene.fog.color.copy(_fogResult);

    if (this.skyDome) {
      this.skyDome.position.set(this.px, 0, this.pz);
      this.skyDome.visible = true;
      (this.skyDome.material as THREE.MeshBasicMaterial).color.copy(_white);
    }

    const sunX = 70 + n * 20;
    const sunY = Math.max(28, 95 - n * 74);
    const sunZ = 40 - n * 30;
    this.world.sun.position.set((this.osmActive ? this.px : 0) + sunX, sunY, (this.osmActive ? this.pz : 0) + sunZ);
    this.world.sun.intensity = 0.1 + (1 - n) * 2.2;
    this.world.sun.color.copy(_sunDay).lerp(_sunNight, n);
    this.world.hemi.intensity = 0.34 + (1 - n) * 0.55;
    this.world.hemi.color.copy(_hemiDay).lerp(_hemiNight, n);
    this.world.hemi.groundColor.copy(_groundDay).lerp(_groundNight, n);
    this.world.ambient.intensity = 0.2 + (1 - n) * 0.24;
    this.world.ambient.color.copy(_ambientDay).lerp(_ambientNight, n);
    this.streetGlow.intensity = 14 + n * 10;
    this.streetGlow.distance = 24;
    this.streetGlow.position.set(this.px, 4.2, this.pz);
  }

  updateCamera(dt: number, menu: boolean) {
    const t = performance.now() / 1000;
    if (menu) {
      const a = t * 0.25;
      _menuTarget.set(this.px + Math.sin(a) * 9, 3.4, this.pz + Math.cos(a) * 9);
      this.camPos.lerp(_menuTarget, Math.min(1, dt * 2));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.px, 1.8, this.pz);
      const prevFov = this.camera.fov;
      this.camera.fov += (58 - this.camera.fov) * dt * 2;
      if (Math.abs(this.camera.fov - prevFov) > 0.001) this.camera.updateProjectionMatrix();
      return;
    }
    const back = this.onFoot ? 4.7 : 8.6 + Math.abs(this.speed) * 0.05;
    const h = this.onFoot ? 2.35 : 4.1 + Math.abs(this.speed) * 0.02;
    const dx = this.px - Math.sin(this.heading) * back;
    const dz = this.pz - Math.cos(this.heading) * back;
    const lag = Math.min(1, dt * (4.2 - Math.min(1.5, Math.abs(this.speed) / 30)));
    this.camPos.x += (dx - this.camPos.x) * lag;
    this.camPos.y += (h - this.camPos.y) * Math.min(1, dt * 4);
    this.camPos.z += (dz - this.camPos.z) * lag;
    const sh = this.shake + (Math.abs(this.speed) > 24 ? 0.12 : 0) + (this.py > 0 ? 0.15 : 0);
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh * 0.5,
      this.camPos.y + (Math.random() - 0.5) * sh * 0.35 + this.py * 0.15,
      this.camPos.z + (Math.random() - 0.5) * sh * 0.5
    );

    // Look-ahead camera tracking with steering bias
    const steer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const lookAhead = this.onFoot ? 2.2 : 6.5;
    const lookX = this.px + Math.sin(this.heading) * lookAhead + steer * (this.onFoot ? 0 : 1.3);
    const lookZ = this.pz + Math.cos(this.heading) * lookAhead;
    this.camera.lookAt(lookX, (this.onFoot ? 1.25 : 1.6) + this.py * 0.2, lookZ);

    const wantFov = this.onFoot ? 58 : this.boostOn ? 75 : 62 + Math.min(6, Math.abs(this.speed) * 0.15);
    const prevFov = this.camera.fov;
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 5);
    if (Math.abs(this.camera.fov - prevFov) > 0.001) this.camera.updateProjectionMatrix();
  }

  loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    try { this.update(dt); } catch (e) { console.error("Game update error:", e); }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    if (this._bannerTimer) { clearTimeout(this._bannerTimer); this._bannerTimer = null; }
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("visibilitychange", this._onVis);
    this.audio.dispose();
    this.osmPlay?.dispose();
    this.osmPlay = null;
    this.osmWorld.dispose();
    this.scene.remove(this.streetGlow);
    // dispose sky dome
    if (this.skyDome) {
      this.skyDome.geometry.dispose();
      (this.skyDome.material as THREE.Material).dispose();
      this.scene.remove(this.skyDome);
      this.skyDome = null;
    }
    disposeTextureCache();
    // dispose all particles
    for (const p of this.particles) {
      (p.mesh.material as THREE.MeshBasicMaterial).dispose();
      this.scene.remove(p.mesh);
    }
    this.particles.length = 0;
    this.clearNPCs();
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
      this.scene.remove(this.targetLabel);
      this.targetLabel = null;
    }
    // dispose chevron geometry
    for (const c of this.chevrons) {
      (c.material as THREE.MeshBasicMaterial).dispose();
      this.scene.remove(c);
    }
    this.renderer.dispose();
  }
}
