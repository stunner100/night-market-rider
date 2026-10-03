import * as THREE from "three";
import { buildWorld, World } from "./world";
import { buildRider, RiderRig } from "./bike";
import { makeOrder, saveBoard, useGame } from "./store";
import { GameAudio } from "./audio";
import { textTexture, skyDomeTexture, disposeTextureCache } from "./textures";
import { buildHumanoid, buildHandBag, animateIdle, animateWalk, animateWave, animateHandoff, animateReceive, poseRider, SKIN_TONES, HumanoidRig, HairStyle } from "./characters";
import { movePointOutsideOrientedBox, segmentOrientedBoxEntryT } from "./collision.mjs";

export interface Input { up: boolean; down: boolean; left: boolean; right: boolean; boost: boolean; }

interface Particle { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// Shared particle geometry — one sphere reused for all particles
const particleGeo = new THREE.SphereGeometry(0.15, 6, 5);

// Pre-allocated Color objects for applySky
const _skyDay = new THREE.Color(0x87ceeb);
const _skySunset = new THREE.Color(0xff9e5e);
const _skyNight = new THREE.Color(0x0b1026);
const _skyResult = new THREE.Color();
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
  nightF = 0; // 0 day → 1 night
  hudTimer = 0;
  running = true;
  clock = new THREE.Clock();
  isMobile = false;
  quality: "high" | "low";
  camPos = new THREE.Vector3(0, 5, -28);
  private _bannerTimer: ReturnType<typeof setTimeout> | null = null;
  private _fuelWarned = false;
  private _boardSubmitted = false;

  constructor(public canvas: HTMLCanvasElement) {
    this.isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || "ontouchstart" in window;
    this.quality = this.isMobile ? "low" : "high";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // HDR tone mapping for photorealistic lighting
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
    this.scene.background = new THREE.Color(0x87ceeb);

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
    this.rig = buildRider();
    this.scene.add(this.rig.group);
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
  }

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.isMobile ? 1.5 : 2));
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
    s.set({ paused: false, phase: "menu", order: null, banner: null, timeLeft: 0, turnHint: "" });
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
      lastDelivery: null, banner: null, fuel: 100, boost: 100, paused: false,
      speedKmh: 0, distM: 0, turnHint: "",
    });
    this.audio.setPaused(false);
    this._fuelWarned = false;
    this._boardSubmitted = false;
    this.px = 0; this.pz = -18; this.heading = Math.PI; this.speed = 0;
    this.nightF = 0; this.orderCollisions = 0; this.boostOn = false;
    this.crashCool = 0; this.potCool = 0; this.nearCool = 0; this.coinCool = 0;
    this.py = 0; this.vy = 0; this.bump = 0; this.shake = 0;
    this.input = { up: false, down: false, left: false, right: false, boost: false };
    this.clearNPCs();
    this.world.setMarkers(null, null, "countdown");
    this.updateNav(null, "countdown");
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
      this.scene.remove(this.targetLabel);
      this.targetLabel = null;
    }
    for (const coin of this.world.coins) { coin.taken = false; coin.mesh.visible = true; }
    this.countdownT = 3.2;
    this.audio.ensure();
    this.audio.blip(523, 0.3, "sawtooth", 0.25); // engine rev
  }

  offerNext() {
    const s = useGame.getState();
    this.orderCollisions = 0;
    const order = makeOrder(s.orderIndex);
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
    rig.group.position.set(order.pickupX + 3.5, 0, order.pickupZ + 1);
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
    rig.group.position.set(order.dropX + 3.5, 0, order.dropZ + 1);
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
  private animateNPCs(t: number, phase: string, dt: number) {
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
    sp.scale.set(10, 2.5, 1);
    sp.position.set(x, 9, z);
    this.scene.add(sp);
    this.targetLabel = sp;
  }

  onRoad(x: number, z: number) {
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
    // day → night progression
    this.nightF = Math.min(1, deliveries / 12);
  }

  gameOver() {
    const s = useGame.getState();
    if (s.phase === "gameover") return;
    s.set({ phase: "gameover" });
    this.audio.fail();
    this.world.setMarkers(null, null, "gameover");
    if (!this._boardSubmitted) {
      this._boardSubmitted = true;
      saveBoard(s.nickname || "Rider", s.score);
    }
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
      this.world.update(dt, t, 0.15, this.px, this.pz);
      this.syncRig(dt, t, 0);
      this.updateCamera(dt, true);
      this.applySky(0.1);
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
    const canDrive = ["offer", "toPickup", "toDropoff"].includes(phase);

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
      const fuelRate = this.boostOn ? 1.8 : 0.7; // boost burns more fuel
      s.fuel = Math.max(0, s.fuel - fuelRate * dt);
    }
    // Out of fuel — can't accelerate
    if (s.fuel <= 0) {
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
    const previousX = this.px, previousZ = this.pz;
    const nx = this.px + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pz + Math.cos(this.heading) * this.speed * dt;
    const nextX = THREE.MathUtils.clamp(nx, -98, 98);
    const nextZ = THREE.MathUtils.clamp(nz, -98, 98);
    this.px = nextX;
    this.pz = nextZ;

    // Sweep the full movement segment so fast updates cannot tunnel through
    // thin or rotated obstacles. Stop just before the first surface hit.
    if (riding) {
      let hit: { collider: World["colliders"][number]; t: number } | null = null;
      for (const collider of this.world.colliders) {
        const t = segmentOrientedBoxEntryT(previousX, previousZ, nextX, nextZ, collider);
        if (t !== null && (!hit || t < hit.t)) hit = { collider, t };
      }
      if (hit) {
        const dx = nextX - previousX, dz = nextZ - previousZ;
        const distance = Math.hypot(dx, dz);
        if (hit.t === 0) {
          const outside = movePointOutsideOrientedBox(previousX, previousZ, hit.collider);
          this.px = outside.x; this.pz = outside.z;
        } else {
          const safeT = Math.max(0, hit.t - (distance > 0 ? 0.15 / distance : 0));
          this.px = previousX + dx * safeT;
          this.pz = previousZ + dz * safeT;
        }
        if (this.crashCool <= 0) this.crash(`💥 Collided with ${hit.collider.name}! Easy oo.`);
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
    for (const r of this.world.ramps) {
      const d = Math.hypot(this.px - r.x, this.pz - r.z);
      if (d < r.r && Math.abs(this.speed) > 13 && this.py === 0) {
        this.vy = 6; this.speed *= 0.88; this.shake = Math.max(this.shake, 0.5);
        s.pushToast("⛰️ Speed ramp!");
      }
    }
    for (const p of this.world.potholes) {
      const d = Math.hypot(this.px - p.x, this.pz - p.z);
      if (d < p.r && this.py === 0 && this.potCool <= 0 && Math.abs(this.speed) > 6) {
        this.potCool = 1.2; this.vy = 3.4; this.speed *= 0.7;
        this.shake = Math.max(this.shake, 0.7);
        this.audio.noise(0.15, 0.3);
        s.pushToast("🕳️ Pothole!");
      }
    }

    // traffic collisions + near miss
    const activeTraffic = this.world.traffic.filter((_, i) => i < 8 + Math.round(orderDiff * 6));
    for (const c of this.world.traffic) c.mesh.visible = activeTraffic.includes(c);
    if (riding) {
      for (const c of activeTraffic) {
        const d = Math.hypot(this.px - c.mesh.position.x, this.pz - c.mesh.position.z);
        if (d < 2.6 && Math.abs(this.speed) > 4) { this.crash(c.kind === "trotro" ? "🚐 Trotro bump! Slow am." : "🚗 Crash! Chale, easy oo."); break; }
        else if (d < 2.6 && this.crashCool <= 0) { this.speed *= 0.4; }
        if (d > 2.6 && d < 4.4 && Math.abs(this.speed) > 16 && this.nearCool <= 0) {
          this.nearCool = 2;
          s.set({ score: s.score + 100, xp: s.xp + 25 });
          s.pushToast("😱 NEAR MISS +100");
          this.audio.coin();
        }
      }
      // peds & goats — physical crash response with ragdoll tumble
      for (const p of this.world.peds) {
        if ((p.tumble ?? 0) > 0) continue;
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
      for (const c of this.world.coins) {
        if (c.taken) continue;
        if (Math.hypot(this.px - c.x, this.pz - c.z) < 2.2) {
          c.taken = true; c.mesh.visible = false;
          s.set({ xp: s.xp + 50, score: s.score + 50, boost: Math.min(100, s.boost + 15) });
          s.pushToast("🪙 Night Market coin +50 XP");
          this.audio.coin();
        }
      }
      // Fuel stations
      if (this.world.fuelStations) {
        for (const fs of this.world.fuelStations) {
          const d = Math.hypot(this.px - fs.x, this.pz - fs.z);
          if (d < 6.0 && Math.abs(this.speed) < 6.0) {
            if (s.fuel < 98) {
              const refuelRate = 35 * dt; // refuels in ~3 seconds
              const newFuel = Math.min(100, s.fuel + refuelRate);
              s.set({ fuel: newFuel });
              if (s.fuel < 30 && newFuel >= 30) {
                s.pushToast("⛽ Refueling at GOIL...");
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
          if (s.orderIndex % 3 === 0) for (const c of this.world.coins) { c.taken = false; c.mesh.visible = true; }
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
    if ((Math.abs(this.speed) > 14 || !this.onRoad(this.px, this.pz)) && this.dustTimer <= 0 && this.py === 0) {
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
    this.world.update(dt, t, this.nightF, this.px, this.pz);
    this.animateNPCs(t, phase, dt);
    this.syncRig(dt, t, dt);
    this.updateNav(o, phase);
    this.updateCamera(dt, false);
    this.applySky(this.nightF);
    this.audio.setEngine(Math.min(1, Math.abs(this.speed) / 37), this.boostOn);
    if (s.banner && phase === "gameover") s.set({ banner: null });

    // throttled HUD sync
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      if (s.fuel < 20 && s.fuel > 0 && !this._fuelWarned) {
        s.pushToast("⛽ Fuel low! Find a station!");
      }
      const dist = o ? Math.hypot(this.px - (phase === "toDropoff" || phase === "deliver" || phase === "delivered" ? o.dropX : o.pickupX), this.pz - (phase === "toDropoff" || phase === "deliver" || phase === "delivered" ? o.dropZ : o.pickupZ)) : 0;
      let turnHint = "";
      if (o && (phase === "toPickup" || phase === "toDropoff")) {
        const tx = phase === "toPickup" ? o.pickupX : o.dropX;
        const tz = phase === "toPickup" ? o.pickupZ : o.dropZ;
        const want = Math.atan2(tx - this.px, tz - this.pz);
        let diff = want - this.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (dist > 25 && Math.abs(diff) > 0.5) turnHint = `${diff > 0 ? "→ TURN RIGHT" : "← TURN LEFT"} — ${Math.round(dist * 8)}m`;
      }
      s.set({ speedKmh: Math.round(Math.abs(this.speed) * 3.2), distM: dist, turnHint });
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  syncRig(dt: number, t: number, step: number) {
    this.rig.group.position.set(this.px, this.py, this.pz);
    this.rig.group.rotation.y = this.heading;
    const steer = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0);
    const stopped = Math.abs(this.speed) < 1.5;
    // bike tilts slightly left when the rider plants a foot at a stop
    const leanTarget = -steer * Math.min(0.45, Math.abs(this.speed) / 60) + Math.sin(t * 1.3) * 0.015 + (stopped ? 0.12 : 0);
    this.rig.lean.rotation.z += (leanTarget - this.rig.lean.rotation.z) * Math.min(1, 8 * (step || 0.016));
    this.rig.lean.rotation.x = this.py > 0 ? -0.12 : THREE.MathUtils.clamp(-this.speed * 0.002, -0.06, 0) + (this.bump > 0 ? Math.sin(t * 40) * 0.02 : 0);
    this.bump = Math.max(0, this.bump - (step || 0.016));
    // wheels
    this.rig.frontWheel.rotation.x += this.speed * (step || 0.016) * 2;
    this.rig.rearWheel.rotation.x += this.speed * (step || 0.016) * 2;
    // Drop the hips when stopped so the left foot can reach the road. Tuck on boost.
    const sit = this.boostOn ? -0.08 : stopped ? -0.07 : 0;
    const sitK = Math.min(1, (step || 0.016) * 6);
    this.rig.body.position.y += (sit - this.rig.body.position.y) * sitK;
    this.rig.body.rotation.x += ((this.boostOn ? 0.07 : 0) - this.rig.body.rotation.x) * sitK;
    (this.rig.brakeLight.material as THREE.MeshBasicMaterial).color.setHex(this.input.down ? 0xff2222 : 0x550000);
    this.rig.headlight.intensity = this.nightF > 0.35 ? 60 : 0;
    const r = this.rig.rider;
    if (r) {
      const phase = useGame.getState().phase;
      const interact = phase === "pickup" ? "pickup" : phase === "deliver" ? "deliver" : "none";
      poseRider(r, {
        t, dt: step || 0.016, steer, speed: this.speed, stopped,
        braking: this.input.down, boost: this.boostOn, interact,
      }, {
        gripL: this.rig.gripL,
        gripR: this.rig.gripR,
        pegL: this.rig.pegL,
        pegR: this.rig.pegR,
        footDown: this.rig.footDown,
        frame: this.rig.lean,
        reach: interact === "pickup" ? this.vendorNPC : interact === "deliver" ? this.customerNPC : null,
      });
    }
  }

  updateNav(o: ReturnType<typeof makeOrder> | null, phase: string) {
    const show = !!o && (phase === "toPickup" || phase === "toDropoff" || phase === "offer");
    for (const c of this.chevrons) c.visible = show;
    if (!show || !o) return;
    const tx = phase === "toDropoff" ? o.dropX : o.pickupX;
    const tz = phase === "toDropoff" ? o.dropZ : o.pickupZ;
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
    if (this.targetLabel) this.targetLabel.position.y = 9 + Math.sin(performance.now() / 400) * 0.5;
  }

  applySky(night: number) {
    // Late afternoon → golden hour → sunset → night
    if (night < 0.5) _skyResult.lerpColors(_skyDay, _skySunset, night * 2);
    else _skyResult.lerpColors(_skySunset, _skyNight, (night - 0.5) * 2);
    this.scene.background = _skyResult;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(_skyResult);

    if (this.skyDome) {
      this.skyDome.rotation.y = performance.now() * 0.00003;
      (this.skyDome.material as THREE.MeshBasicMaterial).color.copy(_skyResult);
    }

    // Traverse sun across tropical sky (golden afternoon -> lower sunset -> night)
    const sunX = 70 + night * 20;
    const sunY = Math.max(22, 95 - night * 70);
    const sunZ = 40 - night * 30;
    this.world.sun.position.set(sunX, sunY, sunZ);
    this.world.sun.intensity = 2.4 - night * 1.9;
    this.world.sun.color.setHSL(0.1 - night * 0.05, 0.7, 0.75 - night * 0.25);
    this.world.hemi.intensity = 0.95 - night * 0.6;
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
    const back = 8.6 + Math.abs(this.speed) * 0.05;
    const h = 4.1 + Math.abs(this.speed) * 0.02;
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
    const lookX = this.px + Math.sin(this.heading) * 6.5 + steer * 1.3;
    const lookZ = this.pz + Math.cos(this.heading) * 6.5;
    this.camera.lookAt(lookX, 1.6 + this.py * 0.2, lookZ);

    const wantFov = this.boostOn ? 75 : 62 + Math.min(6, Math.abs(this.speed) * 0.15);
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
