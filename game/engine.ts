import { customerDetails, customerApproachStep } from "./delivery/customer";
import * as THREE from "three";
import { buildWorld, World } from "./world";
import { buildRider, RiderRig } from "./bike";
import { makeOrder, priceOrder, saveBoard, separateOrderFromRider, useGame, persistProgress, restoreProgress, type GameState } from "./store";
import { GameAudio } from "./audio";
import { textTexture, disposeTextureCache } from "./textures";
import { Sky } from "./sky";
import { GlowField, ParticleField, SpeedStreaks, type PuffOptions } from "./fx";
import { addSilhouette, InkPass } from "./post";
import { setRoadWetness } from "./world/road-renderer";
import { orderDetails, prepSeconds } from "./delivery/order-details";
import { settleDelivery } from "./delivery/settlement";
import { applyOrderKind, ORDER_KINDS } from "./delivery/order-kind";
import { ALL_GOALS_BONUS, applyGoalEvent, GOAL_DEFS, goalLabel, pickGoals, type GoalEvent } from "./shift-goals";
import { Corridor, nextEventDelay, RoadEvents, type CorridorPoint, type RoadEventOutcome } from "./world/road-events";
import { DestinationBeacon, RouteRibbon } from "./world/route-ribbon";
import { buildHumanoid, buildHandBag, animateIdle, animateWalk, animateWave, animateHandoff, animateReceive, buildHelmet, poseRider, SKIN_TONES, HumanoidRig, HairStyle } from "./characters";
import { AccraWorldRuntime } from "./world/accra-runtime";
import { formatWorldDistance, polylineLength, worldUnitsToMetres } from "./world/distance";
import { BOOST_FUEL_PER_SECOND, CRUISE_FUEL_PER_SECOND, fuelBrand } from "./world/fuel-stations";
import { buildMinimapFrame, type MinimapFrame } from "./world/minimap-data";
import { cueFromRoute } from "./world/navigation";
import { OsmGameplay } from "./world/osm-gameplay";
import { movementTarget } from "./rider-controls";
import { buildCompoundGate, buildDeliveryPlace, disposeDeliveryPlace } from "./world/delivery-place";
import { reduceDelivery, initialDelivery, deliveryPhase, type DeliveryEvent, type DeliveryContext } from "./delivery/machine";
import { chooseRoadside } from "./world/roadside-placement";
import { CRASH, DELIVERY, RIDER_HINTS, STREET, pick } from "./voice";
import { CallDirector, type CallContext, type Incoming, type Trigger } from "./calls";
import { CityPower } from "./world/city-power";
import { RainSchedule, RainStreaks } from "./weather";
import { Horizon } from "./horizon";
import { DRIFT, SLIP, bikeFor, inSlipstream, initialFeel, stepDrift, stepSlip, type BikeId } from "./bikes";

import { CHECKPOINT, initialCheckpoint, reduceCheckpoint, type CheckpointEvent } from "./checkpoint";
import { STATIONS, radioCaption } from "./radio";
import { perksFor } from "./archetypes";
import { addressFor, gateFor, pickSites } from "./world/delivery-sites";

export interface Input { up: boolean; down: boolean; left: boolean; right: boolean; boost: boolean; drift?: boolean; }


const rand = (a: number, b: number) => a + Math.random() * (b - a);


// Pre-allocated Color objects for applySky
const _sunDir = new THREE.Vector3();
export type Graphics = "high" | "low";
const GRAPHICS_KEY = "nm_graphics";
function readGraphics(mobile: boolean): Graphics {
  try {
    const saved = localStorage.getItem(GRAPHICS_KEY);
    if (saved === "high" || saved === "low") return saved;
  } catch { /* storage may be unavailable */ }
  return mobile ? "low" : "high";
}
const _glowPos = new THREE.Vector3();
/** Half width / half length of each vehicle body in metres. */
const VEHICLE_FOOTPRINT: Record<string, [number, number]> = {
  car: [0.95, 2.15], taxi: [0.95, 2.15], trotro: [1.2, 2.95], bus: [1.25, 3.9], okada: [0.4, 0.95],
};
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
/** World north is -Z; heading 0 faces +Z. */
function compassPoint(heading: number) {
  const bearing = Math.atan2(Math.sin(heading), -Math.cos(heading));
  return COMPASS[((Math.round(bearing / (Math.PI / 4)) % 8) + 8) % 8];
}
const CARRY_STAGES = ['returnBike', 'rideCustomer', 'contact', 'calling', 'findCustomer', 'handoff'];
const _skyResult = new THREE.Color();
const _white = new THREE.Color(0xffffff);
const _rainGrey = new THREE.Color(0x6d7680);
const _steamPos = new THREE.Vector3();

/** Brief full-screen flash (CSS) for hits and payouts. */
function flashScreen(kind: "hit" | "gold" | "paid") {
  const root = document.documentElement;
  root.dataset.flash = "";
  void root.offsetWidth; // restart the animation
  root.dataset.flash = kind;
}
/** The Night Market shift starts at golden hour; night falls about two minutes in. */
const SHIFT_START_HOUR = 17.5;
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
  private vendorBag: THREE.Object3D | null = null;
  private customerBag: THREE.Object3D | null = null;
  targetLabel: THREE.Sprite | null = null;
  sky: Sky | null = null;
  /** Soft dust/exhaust/steam, additive sparks, lamp halos and speed streaks — one draw call each. */
  private puffs!: ParticleField;
  private sparkField!: ParticleField;
  private glows = new GlowField(180);
  private roadWet = 0;
  /** Riding distance and slipstream time are batched and flushed with the HUD. */
  private goalRide = 0;
  private roadEvents!: RoadEvents;
  private roadEventAt = 60;
  private honkedFrame = false;
  private honkCool = 0;
  private agooToastAt = 0;
  private eventAudioAt = 0;
  private bandStep = 0;
  private goalSlip = 0;
  private streaks = new SpeedStreaks();
  chevrons: THREE.Mesh[] = [];
  private routeRibbon = new RouteRibbon();
  /** Fixed pool (vendor, customer, base): a constant light count keeps shaders stable. */
  private shopLights = [0, 1, 2].map(() => new THREE.PointLight(0xffd7a0, 0, 16, 2));
  private beacon = new DestinationBeacon();
  dustTimer = 0;
  nightF = 0; // 0 day → 1 night
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
  private parked = { x: 0, z: 0, heading: 0 };
  private shiftSeconds = 0;
  private freeDestination: {x:number;z:number;name:string} | null = null;
  private basePlace: THREE.Group | null = null;
  private base = {x:0,z:-18};
  private paidOrderId: number | null = null;
  private cameraRay = new THREE.Raycaster();
  private cameraAnchor = new THREE.Vector3();
  private cameraDirection = new THREE.Vector3();
  private cameraCheckAt = 0;
  private cameraClearance = 20;
  /** Steering input eased over time so lean, turning and camera feel analogue. */
  private steerSmooth = 0;
  private camHeading = 0;
  private spillToastAt = 0;
  private calls = new CallDirector();
  private shout: THREE.Sprite | null = null;
  private shoutTarget: THREE.Object3D | null = null;
  private shoutLeft = -99;
  /** Drop-off gate: 0 closed → 1 open; the customer walks out from inside. */
  private gateOpen = 0;
  private customerInside = false;
  private waitingRiders: THREE.Group[] = [];
  private prepLabel: THREE.Sprite | null = null;
  private prepText = "";
  private steamAt = 0;
  private edgeToastAt = -99;
  private horizon: Horizon | null = null;
  private gradeAt = 0;
  /** Drift slide and slipstream state for the current ride. */
  private feel = initialFeel();
  private paintedBike: BikeId | null = null;
  private skidAt = 0;
  private power = new CityPower();
  private rain = new RainSchedule();
  private rainStreaks: RainStreaks | null = null;
  private lightTimer = 0;
  private checkpointFor = 0;
  private checkpointGroup: THREE.Group | null = null;
  private checkpointOfficer: HumanoidRig | null = null;
  private radioTimer = 4;
  private crashCount = 0;
  private lateOrderId = -1;
  private ringAt = 0;
  private messageId = 1;

  /** True while the order is in the delivery box (after vendor collection). */
  private carryingFood() {
    return CARRY_STAGES.includes(useGame.getState().delivery.stage);
  }

  /** Rough riding spills the food: lowers the tip and the customer's rating. */
  private spill(amount: number, why?: string) {
    if (!this.carryingFood()) return;
    const s = useGame.getState();
    const before = s.foodCondition;
    const kindSpill = ORDER_KINDS[s.order?.kind ?? 'standard'].spillMult;
    const after = Math.max(0, before - amount * kindSpill * perksFor(s.archetype).spill * bikeFor(s.bike).care);
    if (after === before) return;
    s.set({ foodCondition: after });
    const now = performance.now();
    if (why && now - this.spillToastAt > 2500) {
      this.spillToastAt = now;
      s.pushToast(`🍲 ${why} · food ${Math.round(after)}%`);
    }
  }

  navigateTo(kind: 'base' | 'fuel') {
    const s=useGame.getState();
    if(s.order){s.pushToast(RIDER_HINTS.finishFirst);return;}
    const fuel=(this.osmPlay?.fuelBodies()??this.world.fuelStations).slice().sort((a,b)=>Math.hypot(a.x-this.px,a.z-this.pz)-Math.hypot(b.x-this.px,b.z-this.pz))[0];
    this.freeDestination=kind==='base'?{...this.base,name:'Night Market rider base'}:fuel?{x:fuel.x,z:fuel.z,name:'Fuel station'}:null;
    s.set({navigationTarget:this.freeDestination?.name??'',phoneOpen:false});this._osmRouteTarget='';
    if(this.freeDestination)this.setTargetLabel(this.freeDestination.name,this.freeDestination.x,this.freeDestination.z);
  }
  serviceBike() {
    const s=useGame.getState();
    if(s.paused || Math.hypot(this.px-this.base.x,this.pz-this.base.z)>14 || Math.abs(this.speed)>1)return;
    this._fuelWarned=false;s.set({fuel:100,strikes:0,boost:100});s.pushToast(RIDER_HINTS.serviced);this.audio.pickup();
  }
  roadsideAssist() {
    const s=useGame.getState();
    if(s.paused || s.fuel>0 || Math.abs(this.speed)>1)return;
    this.dispatchDelivery({type:'offline'});
    this.px=this.base.x;this.pz=this.base.z;this.speed=0;s.set({mounted:true,fuel:35,phoneOpen:false});
    s.pushToast(RIDER_HINTS.rescued);
  }
  private vendorPlace: THREE.Group | null = null;
  private customerPlace: THREE.Group | null = null;
  private footRider = buildHumanoid({ skin: 0x623b20, shirt: 0xf2e35c, pants: 0x20252b, hair: 'short' });
  private carriedBag = buildHandBag(0xf2e35c);

  deliveryContext(): DeliveryContext {
    const s = useGame.getState();
    const distance = (g: THREE.Group | null) => g ? Math.hypot(this.px - g.position.x, this.pz - g.position.z) : Infinity;
    return { mounted: s.mounted, speed: this.speed, vendorDistance: distance(this.vendorNPC), customerDistance: distance(this.customerNPC),
      destinationDistance: s.order ? Math.hypot(this.px - s.order.dropX, this.pz - s.order.dropZ) : Infinity,
      bikeDistance: Math.hypot(this.px - this.parked.x, this.pz - this.parked.z), delay: prepSeconds(s.orderIndex) * perksFor(s.archetype).prep, customer: s.order?.customer ?? 'Customer',
      customerNote: customerDetails(s.order?.id ?? 1, s.order?.meeting).note, customerReply: customerDetails(s.order?.id ?? 1, s.order?.meeting).reply,
      missesFirstCall: customerDetails(s.order?.id ?? 1, s.order?.meeting).missesFirstCall,
      ...this.orderContext() };
  }

  private orderContext() {
    const o = useGame.getState().order;
    if (!o) return {};
    const d = orderDetails(o);
    return { bagMissing: d.missingIndex >= 0, vendorPerson: d.vendorPerson, cashOrder: d.payment === 'cash', correctChange: d.change };
  }

  dispatchDelivery(event: DeliveryEvent) {
    const s = useGame.getState();
    if (s.paused) return;
    const before = s.delivery;
    const next = reduceDelivery(before, event, this.deliveryContext());
    s.set({ delivery: next, phase: deliveryPhase(next.stage) });
    if (next.stage === before.stage) {
      if(next.message !== before.message) s.pushToast(next.message);
      return;
    }
    if (next.stage === 'offline' || next.stage === 'waiting') {
      if (s.order) s.set({ order: null, orderIndex: s.orderIndex + 1, timeLeft: 0 });
      this.clearNPCs(); this.clearCheckpoint(); this.world.setMarkers(null, null, 'offline');
      if (this.targetLabel) this.targetLabel.visible = false;
      this._osmRoute = [];
      persistProgress();
    }
    if (next.stage === 'returnBike' && s.order) {
      this.spawnCustomer(s.order);
      this.world.setMarkers(null, { x: s.order.dropX, z: s.order.dropZ }, 'toDropoff');
      this.setTargetLabel(`${s.order.customer} · ${s.order.dropoff}`, s.order.dropX, s.order.dropZ);
      this.audio.pickup();
    }
    if (next.stage === 'calling') { s.set({ phoneOpen: true }); this.audio.blip(440, .6, 'sine', .1); }
    // The call screen has done its job once the customer answers.
    if (before.stage === 'calling' && next.stage !== 'calling') s.set({ phoneOpen: false });
    if (next.stage === 'findCustomer' && this.customerNPC) {
      this.setTargetLabel(`${s.order?.customer} · CUSTOMER`, this.customerNPC.position.x, this.customerNPC.position.z);
      this.world.dropMarker.position.set(this.customerNPC.position.x,.1,this.customerNPC.position.z);
    }
    if (next.stage === 'completed') this.completeDelivery();
    if (before.stage === 'offline' && next.stage === 'waiting') this.raise('online');
    if (next.message && next.message !== before.message) s.pushToast(next.message);
  }

  private mateShout(vehicle: THREE.Object3D, call: string) {
    if (this.shoutLeft > -10) return;
    if (!this.shout) {
      this.shout = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      this.shout.scale.set(4.4, 0.95, 1);
      this.shout.renderOrder = 10;
      this.scene.add(this.shout);
    }
    (this.shout.material as THREE.SpriteMaterial).map = textTexture(`🗣️ ${call}`, { bg: "#fffdf2", fg: "#1a1a1a", w: 640, h: 136, font: 46, border: "#f4c542" });
    (this.shout.material as THREE.SpriteMaterial).needsUpdate = true;
    this.shoutTarget = vehicle;
    this.shoutLeft = 2.6;
    useGame.getState().pushToast(`🚐 Mate: “${call}”`);
  }

  /** Radio: Akwaaba FM → Okponglo Hiplife → Legon Talk → off. */
  cycleRadio() {
    const s = useGame.getState();
    const next = s.radio + 1 >= STATIONS.length ? -1 : s.radio + 1;
    this.audio.ensure();
    this.radioTimer = 6;
    const st = STATIONS[next];
    s.set({ radio: next, radioCaption: st ? `📻 ${st.name} ${st.freq}` : "" });
  }

  private clearCheckpoint() {
    this.checkpointFor = 0;
    if (this.checkpointGroup) {
      this._disposeGroup(this.checkpointGroup);
      this.checkpointGroup.removeFromParent();
      this.checkpointGroup = null;
      this.checkpointOfficer = null;
    }
    if (useGame.getState().checkpoint) useGame.getState().set({ checkpoint: null });
  }

  /** Put barrels and an officer at the roadside ~150–230 m along the current route. */
  private placeCheckpoint() {
    const route = this._osmRoute;
    if (!this.osmActive || route.length < 2) return;
    const want = 150 + Math.random() * 80;
    let travelled = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (travelled + len < want) { travelled += len; continue; }
      const k = (want - travelled) / len;
      const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
      const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = Math.atan2(ux, uz);
      const orange = new THREE.MeshStandardMaterial({ color: 0xf76707, roughness: 0.6 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf8f9fa, roughness: 0.6 });
      for (const [bx, bz] of [[2.2, -1.5], [3.4, 0], [2.2, 1.5]]) {
        for (let n = 0; n < 3; n++) {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 12), n % 2 ? white : orange);
          ring.position.set(bx, 0.15 + n * 0.3, bz);
          g.add(ring);
        }
      }
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshBasicMaterial({ map: textTexture("POLICE · STOP", { bg: "#1c2a4a", fg: "#fff", font: 52 }), side: THREE.DoubleSide }));
      sign.position.set(3.4, 1.35, 0);
      sign.rotation.y = Math.PI; // face riders coming up the route
      g.add(sign);
      const officer = buildHumanoid({ skin: this._pick(SKIN_TONES), shirt: 0x1c2a4a, pants: 0x1c2a4a, hair: "cap", capColor: 0x111827, scale: 1.02 });
      officer.group.position.set(1.6, 0, 0.6);
      officer.group.rotation.y = -Math.PI / 2;
      g.add(officer.group);
      this.checkpointOfficer = officer;
      this.scene.add(g);
      this.checkpointGroup = g;
      useGame.getState().set({ checkpoint: initialCheckpoint() });
      return;
    }
  }

  checkpointAction(e: CheckpointEvent) {
    const s = useGame.getState();
    if (!s.checkpoint) return;
    const next = reduceCheckpoint(s.checkpoint, e);
    if (next === s.checkpoint) return;
    s.set({ checkpoint: next });
    if (next.line !== s.checkpoint.line) s.pushToast(next.line);
    if (next.stage === s.checkpoint.stage) return;
    if (e.type === 'settle') s.set({ earnings: Math.max(0, Math.round((s.earnings - CHECKPOINT.settle) * 100) / 100) });
    if (next.stage === 'fined') {
      this.audio.blip(2600, 0.25, "square", 0.18); this.audio.blip(2600, 0.4, "square", 0.18, 0.32);
      s.set({ earnings: Math.max(0, Math.round((s.earnings - CHECKPOINT.fine) * 100) / 100), rating: Math.max(2.5, Math.round((s.rating - 0.2) * 10) / 10) });
      this.raise('fined');
    }
    if (next.stage === 'stopped') this.audio.blip(2600, 0.2, "square", 0.14);
  }

  /** Rain, dumsor, the checkpoint and the radio — the city's own systems. */
  private updateCity(dt: number, t: number) {
    const s = useGame.getState();
    // Soft edge of the baked map: ease the rider back instead of letting them ride into nothing.
    const b = this.osmActive ? this.osmWorld.bounds : null;
    if (b) {
      const m = 35;
      const cx = Math.min(b.maxX - m, Math.max(b.minX + m, this.px)), cz = Math.min(b.maxZ - m, Math.max(b.minZ + m, this.pz));
      if (cx !== this.px || cz !== this.pz) {
        this.px = cx; this.pz = cz;
        this.speed *= 0.4;
        if (t - this.edgeToastAt > 5) { this.edgeToastAt = t; s.pushToast("🚧 Night Market no dey deliver pass here — turn back!"); }
      }
    }
    // Rain
    if (!this.rainStreaks) this.rainStreaks = new RainStreaks(this.scene, this.isMobile);
    const rainEvent = this.rain.update(this.shiftSeconds, dt);
    const wet = this.rain.intensity;
    this.rainStreaks.update(dt, wet, this.camera.position);
    this.audio.setRain(wet);
    // Roads stay wet a while after the shower passes.
    this.roadWet += ((wet > 0.05 ? Math.min(1, wet * 1.4) : 0) - this.roadWet) * Math.min(1, dt * (wet > this.roadWet ? 0.5 : 0.04));
    setRoadWetness(this.roadWet);
    if (rainEvent === 'start') { s.set({ raining: true }); s.pushToast("🌧️ Rain dey come! Ride small small."); this.raise('rain'); }
    if (rainEvent === 'stop') { s.set({ raining: false }); s.pushToast("🌤️ Rain don stop."); }
    if (wet > 0) {
      _skyResult.lerp(_rainGrey, wet * 0.55);
      if (this.scene.fog instanceof THREE.FogExp2) { this.scene.fog.density += wet * 0.009; this.scene.fog.color.copy(_skyResult); }
      this.world.sun.intensity *= 1 - wet * 0.6;
      this.horizon?.update(this.camera, _skyResult, this.nightF);
    }
    // Colour grade: warm golden hour, cool night, grey rain, a heavier vignette in dumsor.
    this.gradeAt -= dt;
    if (this.gradeAt <= 0) {
      this.gradeAt = 0.25;
      const h = s.hour;
      const golden = h >= 16 && h < 19 ? Math.min(1, (h - 16) / 1.2) * Math.min(1, (19 - h) / 0.7) : 0;
      const tint = wet > 0.05 ? "120, 135, 150" : golden > 0.05 ? "255, 150, 60" : this.nightF > 0.5 ? "70, 70, 160" : "255, 220, 170";
      const strength = Math.max(golden * 0.26, this.nightF > 0.5 ? 0.2 : 0.06, wet * 0.22);
      const style = document.documentElement.style;
      style.setProperty("--grade-rgb", tint);
      style.setProperty("--grade-a", strength.toFixed(3));
      style.setProperty("--vignette-a", (0.32 + this.nightF * 0.18 + (s.dumsor ? 0.22 : 0)).toFixed(3));
    }
    // Dumsor
    const powerEvent = this.power.update(this.shiftSeconds, this.nightF, { x: this.px, z: this.pz });
    if (powerEvent === 'off') { s.pushToast(`⚡ Dumsor! ECG don take light${s.roadName ? ` for ${s.roadName} side` : ""}.`); this.raise('dumsor'); }
    if (powerEvent === 'on') { s.pushToast("💡 Light don come back!"); }
    const dark = !this.power.powered(this.px, this.pz);
    if (dark !== s.dumsor) s.set({ dumsor: dark });
    if (dark) { this.world.hemi.intensity *= 0.62; this.world.ambient.intensity *= 0.62; }
    this.audio.setGenerator(dark ? 1 : 0);
    this.lightTimer -= dt;
    if (this.lightTimer <= 0 && this.osmActive) {
      this.lightTimer = 0.25;
      this.osmWorld.applyNightLights(this.nightF, (x, z) => this.power.powered(x, z), t);
    }
    // Checkpoint
    if (this.checkpointFor && !this.checkpointGroup && s.order?.id === this.checkpointFor) this.placeCheckpoint();
    if (this.checkpointGroup && s.checkpoint) {
      const g = this.checkpointGroup;
      const distance = Math.hypot(this.px - g.position.x, this.pz - g.position.z);
      this.checkpointAction({ type: 'tick', dt, distance, speed: s.mounted ? this.speed : 0 });
      const after = useGame.getState().checkpoint;
      if (this.checkpointOfficer) {
        if (after?.stage === 'ahead' && distance < 40) animateWave(this.checkpointOfficer, t);
        else animateIdle(this.checkpointOfficer, t);
      }
      if ((after?.stage === 'cleared' || after?.stage === 'fined') && distance > 60) this.clearCheckpoint();
    }
    // Radio captions
    if (s.radio >= 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) {
        this.radioTimer = 16;
        const caption = radioCaption(s.radio);
        if (caption) s.set({ radioCaption: caption });
      }
    }
  }

  /** Replace the whole bike (frame, wheels, controls, rider seating) with another model, keeping its place and attachments. */
  swapBike(id: BikeId) {
    const old = this.rig;
    const fresh = buildRider(id);
    this.riderGhost?.dispose();
    fresh.group.position.copy(old.group.position);
    fresh.group.rotation.copy(old.group.rotation);
    fresh.group.visible = old.group.visible;
    fresh.body.visible = old.body.visible;
    // Keep things other systems hung on the rig (sun target, contact shadow).
    for (const child of [...old.group.children]) if (child !== old.lean) fresh.group.add(child);
    fresh.group.traverse(o => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) o.material.envMapIntensity = o.name === "wheel" || o.name === "wheel-rim" ? 0.38 : 0.62;
    });
    this.scene.remove(old.group);
    this._disposeGroup(old.group);
    this.scene.add(fresh.group);
    this.rig = fresh;
    this.riderGhost = addSilhouette(fresh.lean, 0xf2e35c);
    this.world.headlight = fresh.headlight;
  }

  private clockLabel() {
    const h = useGame.getState().hour;
    return `${Math.floor(h).toString().padStart(2, "0")}:${Math.floor((h % 1) * 60).toString().padStart(2, "0")}`;
  }

  /** Raise a story trigger; texts land at once, calls queue until the rider is free. */
  raise(trigger: Trigger, extra: Partial<CallContext> = {}) {
    const s = useGame.getState();
    const texts = this.calls.notify(trigger, { nickname: s.nickname, deliveries: s.deliveries, earnings: s.earnings, archetype: s.archetype ?? undefined, ...extra });
    for (const t of texts) for (const line of t.lines) this.receiveText(t, line);
  }

  private receiveText(from: Incoming, text: string) {
    const s = useGame.getState();
    const msg = { id: this.messageId++, from: from.script.from, name: from.name, text, time: this.clockLabel() };
    s.set({ inbox: [msg, ...s.inbox].slice(0, 40), unread: s.unread + 1 });
    s.pushToast(`💬 ${from.name}: ${text.length > 64 ? `${text.slice(0, 62)}…` : text}`);
    this.audio.textAlert();
  }

  private updateCalls() {
    const s = useGame.getState();
    const call = s.incomingCall;
    if (call && !call.answered) {
      if (this.shiftSeconds - this.ringAt > 2.2) { this.ringAt = this.shiftSeconds; this.audio.ring(); }
      if (this.shiftSeconds - call.ringStarted > 14) this.declineCall();
      return;
    }
    if (call) return;
    const next = this.calls.next(this.shiftSeconds, s.delivery.stage, false);
    if (!next) return;
    s.set({ incomingCall: { from: next.script.from, name: next.name, lines: next.lines, step: 0, answered: false, missed: next.missed, ringStarted: this.shiftSeconds } });
    this.ringAt = this.shiftSeconds;
    this.audio.ring();
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200]);
  }

  answerCall() {
    const s = useGame.getState();
    if (!s.incomingCall || s.incomingCall.answered) return;
    s.set({ incomingCall: { ...s.incomingCall, answered: true }, callLog: [{ id: this.messageId++, from: s.incomingCall.from, name: s.incomingCall.name, missed: false, time: this.clockLabel() }, ...s.callLog].slice(0, 30) });
  }

  /** Advance an answered call; hangs up after the last line. */
  nextCallLine() {
    const s = useGame.getState();
    const call = s.incomingCall;
    if (!call?.answered) return;
    if (call.step + 1 < call.lines.length) s.set({ incomingCall: { ...call, step: call.step + 1 } });
    else s.set({ incomingCall: null });
  }

  declineCall() {
    const s = useGame.getState();
    const call = s.incomingCall;
    if (!call) return;
    if (call.answered) { s.set({ incomingCall: null }); return; }
    s.set({ incomingCall: null, callLog: [{ id: this.messageId++, from: call.from, name: call.name, missed: true, time: this.clockLabel() }, ...s.callLog].slice(0, 30) });
    if (call.missed) this.receiveText({ script: { from: call.from } as Incoming["script"], name: call.name, lines: [] }, call.missed);
  }

  toggleOnline() {
    this.audio.ensure();
    this.dispatchDelivery({ type: useGame.getState().delivery.stage === 'offline' ? 'online' : 'offline' });
  }
  declineOrder() { this.dispatchDelivery({ type: 'decline' }); }
  approveBag() { this.dispatchDelivery({ type: 'approveBag' }); }
  reportMissing() { this.dispatchDelivery({ type: 'reportMissing' }); }
  giveChange(amount: number) { this.dispatchDelivery({ type: 'giveChange', amount }); }
  /** Number-key shortcuts for the bag check and the change options. */
  choose(n: number) {
    const s = useGame.getState();
    if (s.checkpoint?.stage === 'stopped') { this.checkpointAction(n === 1 ? { type: 'showLicence' } : { type: 'settle' }); return; }
    if (s.delivery.stage === 'checkBag') { if (n === 1) this.approveBag(); else if (n === 2) this.reportMissing(); }
    else if (s.delivery.stage === 'payment' && s.order) {
      const amount = orderDetails(s.order).changeOptions[n - 1];
      if (amount !== undefined) this.giveChange(amount);
    }
  }
  messageCustomer() { this.dispatchDelivery({ type: 'message' }); }
  callCustomer() { this.dispatchDelivery({ type: 'call' }); }
  interact() {
    const stage = useGame.getState().delivery.stage;
    if (stage === 'vendor') this.dispatchDelivery({ type: 'confirm' });
    else if (stage === 'collect') this.dispatchDelivery({ type: 'collect' });
    else if (stage === 'contact') this.callCustomer();
    else if (stage === 'findCustomer') this.dispatchDelivery({ type: 'handoff' });
  }
  toggleMount() {
    const s = useGame.getState();
    if (s.paused || ['menu', 'loading'].includes(s.phase) || ['handoff', 'calling'].includes(s.delivery.stage)) return;
    if (s.mounted) {
      if (Math.abs(this.speed) > 1) { s.pushToast(RIDER_HINTS.stopFirst); return; }
      this.parked = { x: this.px, z: this.pz, heading: this.heading };
      const x = this.px + Math.cos(this.heading) * 1.5, z = this.pz - Math.sin(this.heading) * 1.5;
      if (this.osmActive && this.osmWorld.collidesBuilding(x, z, .35)) { s.pushToast(RIDER_HINTS.clearSpace); return; }
      this.px = x; this.pz = z;
      s.set({ mounted: false });
    } else {
      if (this.deliveryContext().bikeDistance > 3) { s.pushToast(RIDER_HINTS.walkToBike); return; }
      this.px = this.parked.x; this.pz = this.parked.z; this.heading = this.parked.heading;
      s.set({ mounted: true });
      if (s.delivery.stage === 'returnBike') { s.pushToast(DELIVERY.bagSecured); this.audio.pickup(); }
    }
    this.speed = 0;
    this.rig.body.visible = !s.mounted;
    this.footRider.group.visible = s.mounted;
  }

  constructor(public canvas: HTMLCanvasElement) {
    this.isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || "ontouchstart" in window;
    this.quality = this.isMobile ? "low" : "high";
    // Stencil is needed for the see-through rider (off by default since three r163).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, stencil: true });
    this.graphics = readGraphics(this.isMobile);
    // Full retina (2x) quadruples shaded pixels for little visible gain at speed.
    this.pixelRatio = this.basePixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // refreshed every other frame in loop()
    // HDR tone mapping for photorealistic lighting
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);
    this.scene.background = new THREE.Color(0x87ceeb);

    // Procedural tropical sky driven by the shift clock.
    this.sky = new Sky();
    this.horizon = new Horizon(this.scene, this.isMobile);
    this.scene.add(this.sky.mesh);

    this.world = buildWorld(this.scene, this.isMobile);
    this.osmWorld = new AccraWorldRuntime(this.scene, this.isMobile);
    this.world.pickupMarker.scale.setScalar(.48);this.world.dropMarker.scale.setScalar(.48);
    this.rig = buildRider();
    this.scene.add(this.rig.group);
    this.riderGhost = addSilhouette(this.rig.lean, 0xf2e35c);
    this.footRider.group.visible = false;
    this.footRider.head.add(buildHelmet(0xf2e35c));
    this.footRider.armR.hand.add(this.carriedBag);
    this.scene.add(this.footRider.group);
    this.footGhost = addSilhouette(this.footRider.group, 0xf2e35c);
    restoreProgress();
    // attach world headlight to rig
    this.world.headlight = this.rig.headlight;
    this.roadEvents = new RoadEvents(this.scene, this.isMobile);
    this.puffs = new ParticleField(this.isMobile ? 120 : 260);
    this.sparkField = new ParticleField(90, true, 1.1);
    this.scene.add(this.routeRibbon.mesh, this.beacon.group, ...this.shopLights,
      this.puffs.points, this.sparkField.points, this.glows.points, this.streaks.lines);
    // nav chevrons
    const geo = new THREE.ConeGeometry(0.55, 1.1, 4);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf2e35c, transparent: true, opacity: 0.9 }));
      m.rotation.x = Math.PI / 2;
      this.scene.add(m);
      this.chevrons.push(m);
    }
    this.ink = this.graphics === "high" ? new InkPass(this.isMobile ? 0 : 4) : null;
    if (this.graphics === "low") { this.world.sun.shadow.mapSize.set(1024, 1024); }
    useGame.getState().set({ graphics: this.graphics });
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
    this.osmPlay.onHonk = (distance) => this.audio.trafficHorn(distance);
    this.base={x:this.px,z:this.pz};
    const baseSpot=this.placeActor(this.px,this.pz);
    this.basePlace=buildDeliveryPlace('NIGHT MARKET · RIDER BASE');
    this.basePlace.position.set(baseSpot.x,0,baseSpot.z);this.basePlace.rotation.y=baseSpot.yaw;
    this.scene.add(this.basePlace);
    useGame.getState().pushToast(DELIVERY.mapLoaded);
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
    const navigating = !!this.freeDestination || phase === "offer" || phase === "toPickup" || phase === "toDropoff";
    return buildMinimapFrame({
      px: this.px,
      pz: this.pz,
      roads: this.osmWorld.visibleRoads(this.px, this.pz, 1),
      route: navigating ? this._osmRoute : [],
      pickup: order && (phase === "offer" || phase === "toPickup" || phase === "pickup") ? { x: order.pickupX, z: order.pickupZ } : this.freeDestination,
      drop: order && (phase === "toDropoff" || phase === "deliver") ? { x: order.dropX, z: order.dropZ } : null,
      fuel: (this.osmPlay?.fuelBodies() ?? []).map(station => ({ x: station.x, z: station.z })),
      landmarks: [{...this.base,name:"RIDER BASE"},...this.osmWorld.locations.map(location => ({ x: location.x, z: location.z, name: location.name }))],
      radius: 130,
    });
  }

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const px = h * this.renderer.getPixelRatio();
    this.puffs?.setViewport(px); this.sparkField?.setViewport(px); this.glows.setViewport(px);
    this.ink?.setSize(w * this.renderer.getPixelRatio(), px);
  };

  /** High: ink outlines, 1.5x render scale. Low: plain render at 1x — for older or hot machines. */
  setGraphics(quality: Graphics) {
    this.graphics = quality;
    try { localStorage.setItem(GRAPHICS_KEY, quality); } catch { /* storage may be unavailable */ }
    this.ink?.dispose();
    this.ink = quality === "high" ? new InkPass(this.isMobile ? 0 : 4) : null;
    this.pixelRatio = this.basePixelRatio();
    this.renderer.setPixelRatio(this.pixelRatio);
    const shadow = quality === "high" && !this.isMobile ? 2048 : 1024;
    const sun = this.world.sun;
    if (sun.shadow.mapSize.x !== shadow) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    this.resize();
    useGame.getState().set({ graphics: quality });
  }

  private basePixelRatio() {
    return Math.min(window.devicePixelRatio, this.graphics === "high" ? (this.isMobile ? 1.25 : 1.5) : 1);
  }

  private _onKeyDown = (e: KeyboardEvent) => {
    // Typing a name in a form must not ride the bike.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
    if (e.code === "KeyH" && !e.repeat) this.honk();
    if (e.repeat) return;
    if (e.code === 'KeyE') this.toggleMount();
    if (e.code === 'KeyF') this.interact();
    if (/^Digit[1-3]$/.test(e.code)) this.choose(Number(e.code.slice(5)));
    if (e.code === 'KeyN') { const s = useGame.getState(); s.set({ phoneOpen: !s.phoneOpen }); }
    if (e.code === 'KeyR') this.cycleRadio();
    if (e.code === "Enter") {
      const call = useGame.getState().incomingCall;
      if (call) { if (call.answered) this.nextCallLine(); else this.answerCall(); }
      else this.confirm();
    }
    if (e.code === "Backspace" && useGame.getState().incomingCall) this.declineCall();
  };
  private _onKeyUp = (e: KeyboardEvent) => this._applyKey(e.code, false);

  private _applyKey(code: string, v: boolean) {
    if (code === "KeyW" || code === "ArrowUp") this.input.up = v;
    if (code === "KeyS" || code === "ArrowDown") this.input.down = v;
    if (code === "KeyA" || code === "ArrowLeft") this.input.left = v;
    if (code === "KeyD" || code === "ArrowRight") this.input.right = v;
    if (code === "Space") this.input.boost = v;
    if (code === "ShiftLeft" || code === "ShiftRight") this.input.drift = v;
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
    if (!["offline", "waiting", "offer", "countdown", "toPickup", "pickup", "toDropoff", "deliver", "delivered"].includes(s.phase)) return;
    s.set({ paused: true });
    this.input = { up: false, down: false, left: false, right: false, boost: false };
    this.audio.setPaused(true);
  }

  resumeGame() {
    const s = useGame.getState();
    if (!s.paused) return;
    s.set({ paused: false });
    this.audio.setPaused(false);
  }

  quitToMenu() {
    this.roadEvents.clear();
    const s = useGame.getState();
    persistProgress();
    if(s.score>0)saveBoard(s.nickname,s.score);
    this.freeDestination=null;
    s.set({ navigationTarget:"", delivery: initialDelivery(), mounted: true, phoneOpen: false, paused: false, phase: "menu", order: null, banner: null, timeLeft: 0, turnHint: "" });
    this.audio.setPaused(false);
    this.audio.setEngine(0, false);
    this.clearNPCs();
    this.world.setMarkers(null, null, "menu");
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
      mat.dispose();
      this.scene.remove(this.targetLabel);
      this.targetLabel = null;
    }
    this.speed = 0; this.rig.body.visible = true; this.footRider.group.visible = false;
  }

  startRun() {
    const s = useGame.getState();
    s.set({ delivery: initialDelivery(), mounted: true, phoneOpen: false,
      phase: 'offline', order: null, orderIndex: Math.max(s.orderIndex,s.deliveries,this.paidOrderId??0),
      streak: 0, strikes: 0, timeLeft: 0, lastDelivery: null, banner: null, fuel: 100, paused: false });
    this.freeDestination=null;s.set({navigationTarget:""});
    this.rig.body.visible = true; this.footRider.group.visible = false;
    this.world.setMarkers(null, null, 'offline');
    this.audio.setPaused(false);
    this._fuelWarned = false;
    this.crashCount = 0;
    this.lateOrderId = -1;
    this.power.reset();
    this.rain.reset(this.shiftSeconds);
    this.clearCheckpoint();
    s.set({ raining: false, dumsor: false });
    s.set({ incomingCall: null });
    this.raise(s.tutorialDone ? 'shiftReturn' : 'shiftStart');
    s.set({ shiftGoals: pickGoals((Math.random() * 2 ** 31) | 0) });
    this.roadEvents.clear();
    this.roadEventAt = this.shiftSeconds + nextEventDelay(Math.random, true);
    this.goalRide = 0; this.goalSlip = 0;
    this.px = 0; this.pz = -18; this.heading = Math.PI; this.speed = 0; this.camHeading = this.heading; this.steerSmooth = 0;
    if (this.osmActive) {
      const snapped = this.osmWorld.nearestRoadPoint(this.px, this.pz, 120);
      if (snapped) { this.px = snapped.x; this.pz = snapped.z; }
    }
    this.nightF = 0; this.orderCollisions = 0;
    this.clearNPCs();
    this.countdownT = 3.2;
    this.audio.ensure();
    this.audio.blip(523, 0.3, "sawtooth", 0.25); // engine rev
  }

  offerNext() {
    this.freeDestination=null;
    const s = useGame.getState();
    s.set({navigationTarget:""});
    let order = this.osmActive
      ? separateOrderFromRider(makeOrder(s.orderIndex), this.px, this.pz, s.orderIndex)
      : makeOrder(s.orderIndex);
    // Real Accra places: a food spot near the rider and a home or hostel a short ride away.
    const sites = this.osmActive ? pickSites(this.osmWorld.sites, { x: this.px, z: this.pz }, s.orderIndex * 7919 + Math.floor(Math.random() * 1000)) : null;
    if (sites) {
      const { vendor, drop } = sites;
      const gate = gateFor(order.id, drop);
      order = {
        ...order,
        ...priceOrder(s.orderIndex, vendor, drop),
        pickupX: vendor.x, pickupZ: vendor.z, dropX: drop.x, dropZ: drop.z,
        dropoff: drop.road ?? drop.near ?? order.dropoff,
        vendorSite: vendor, dropSite: drop,
        address: addressFor(drop, order.id),
        meeting: drop.kind === "hostel" && drop.name ? `the ${drop.name} porter's lodge` : `the ${gate.name} gate, H/No. ${gate.number}`,
      };
    }
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
    if(!this.osmActive){
      const pads=[{x:60,z:8},{x:8,z:60},{x:-60,z:-8},{x:-8,z:-60}];
      const pickup=pads[s.orderIndex%pads.length],drop=pads[(s.orderIndex+2)%pads.length];
      order.pickupX=pickup.x;order.pickupZ=pickup.z;order.dropX=drop.x;order.dropZ=drop.z;
    }
    this._osmRouteTarget = "";
    this._osmRoute.length = 0;
    order = applyOrderKind(order);
    s.set({ order, timeLeft: order.timeTotal, banner: null });
    this.dispatchDelivery({ type: 'offer' });
    navigator.vibrate?.([100, 60, 100]);
    this.world.setMarkers({ x: order.pickupX, z: order.pickupZ }, null, "offer");
    this.spawnVendor(order);
    this.setTargetLabel(`${order.vendor}`, order.pickupX, order.pickupZ);
    this.audio.blip(880, 0.2, "sine", 0.3);
    this.audio.blip(1174, 0.25, "sine", 0.3, 0.15);
  }

  acceptOrder() {
    const s = useGame.getState();
    if (s.phase !== "offer" || !s.order) return;
    this.orderCollisions=0;
    this.spillToastAt = 0;
    s.set({ foodCondition: 100 });
    this.dispatchDelivery({ type: 'accept' });
    this.world.setMarkers({ x: s.order.pickupX, z: s.order.pickupZ }, null, "toPickup");
    s.pushToast(DELIVERY.accept(s.order.vendor));
    // From the second order, some routes pass a police checkpoint.
    if (s.order.id >= 2 && Math.random() < perksFor(s.archetype).checkpointChance) this.checkpointFor = s.order.id;
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
    this.vendorBag = bag;
    const spot = this.placeActor(order.pickupX, order.pickupZ);
    rig.group.position.set(spot.x, 0, spot.z);
    rig.group.rotation.y = spot.yaw;
    this.scene.add(rig.group);
    this.vendorPlace = buildDeliveryPlace(useGame.getState().order?.vendor ?? 'NIGHT MARKET');
    this.vendorPlace.position.set(spot.x,0,spot.z);this.vendorPlace.rotation.y=spot.yaw;
    this.scene.add(this.vendorPlace);
    // Other Night Market riders already waiting at the counter.
    const queue = 1 + (useGame.getState().orderIndex % 2);
    for (let i = 0; i < queue; i++) {
      const other = buildHumanoid({ skin: this._pick(SKIN_TONES), shirt: 0xf2e35c, pants: 0x2b2b2b, hair: "short", scale: 0.97 + Math.random() * 0.06, detail: "simple" });
      const helmet = buildHelmet(this._pick([0xf2e35c, 0x111214, 0xe9ecef]));
      other.head.add(helmet);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.32), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6 }));
      box.position.set(0, -0.15, 0.18);
      other.armR.hand.add(box);
      const lx = -2 + i * 0.9, lz = 0.9 + i * 0.3;
      other.group.position.set(spot.x + Math.cos(spot.yaw) * lx + Math.sin(spot.yaw) * lz, 0, spot.z - Math.sin(spot.yaw) * lx + Math.cos(spot.yaw) * lz);
      other.group.rotation.y = spot.yaw + Math.PI + (i ? 0.4 : -0.2);
      other.group.userData.rig = other;
      this.scene.add(other.group);
      this.waitingRiders.push(other.group);
    }
    this.vendorNPC = rig.group;
    this.vendorRig = rig;
  }
  spawnCustomer(order: { dropX: number; dropZ: number }) {
    if (this.vendorNPC) { this._disposeGroup(this.vendorNPC); this.scene.remove(this.vendorNPC); this.vendorNPC = null; this.vendorRig = null; }
    const rig = buildHumanoid({
      skin: this._pick(SKIN_TONES),
      shirt: customerDetails(useGame.getState().order?.id ?? 1, useGame.getState().order?.meeting).shirt,
      pants: this._pick([0x1971c2, 0x343a40, 0x2b2b2b]),
      hair: this._pick(["afro", "short", "wrap", "bald", "cap"] as HairStyle[]),
      capColor: this._pick([0xd6336c, 0x1971c2, 0x2f9e44]),
      scale: 0.93 + Math.random() * 0.12,
      bulk: 0.9 + Math.random() * 0.2,
      feminine: Math.random() < 0.4,
      longSleeves: Math.random() < 0.3,
      shorts: Math.random() < 0.3,
    });
    const site = useGame.getState().order?.dropSite;
    this.gateOpen = 0;
    this.customerInside = false;
    if (site && this.osmActive) {
      // A real house: the gate stands at the property line and the customer waits inside until called.
      const o = useGame.getState().order!;
      const gate = gateFor(o.id, site);
      this.customerPlace = buildCompoundGate({ color: gate.color, number: gate.number, seed: gate.number, hostel: site.kind === 'hostel' ? site.name : null });
      this.customerPlace.position.set(site.gx, 0, site.gz);
      this.customerPlace.rotation.y = site.yaw;
      this.scene.add(this.customerPlace);
      const back = site.kind === 'hostel' ? -1.6 : -2.4;
      rig.group.position.set(site.gx + Math.sin(site.yaw) * back, 0, site.gz + Math.cos(site.yaw) * back);
      rig.group.rotation.y = site.yaw;
      this.customerInside = site.kind !== 'hostel';
      this.scene.add(rig.group);
    } else {
      const spot = this.placeActor(order.dropX, order.dropZ);
      rig.group.position.set(spot.x, 0, spot.z);
      rig.group.rotation.y = spot.yaw;
      this.scene.add(rig.group);
      this.customerPlace = buildDeliveryPlace('LEGON COMMUNITY',true);
      this.customerPlace.position.set(spot.x,0,spot.z);this.customerPlace.rotation.y=spot.yaw;
      this.scene.add(this.customerPlace);
    }
    this.customerNPC = rig.group;
    this.customerRig = rig;
    // The customer only holds the bag once the rider hands it over.
    const handed = buildHandBag(0xf2e35c);
    handed.position.set(0, -0.02, 0.05);
    handed.visible = false;
    rig.armR.hand.add(handed);
    this.customerBag = handed;
  }
  clearNPCs() {
    if(this.vendorPlace)disposeDeliveryPlace(this.vendorPlace);
    if(this.customerPlace)disposeDeliveryPlace(this.customerPlace);
    this.vendorPlace=this.customerPlace=null;
    if (this.vendorNPC) { this._disposeGroup(this.vendorNPC); this.scene.remove(this.vendorNPC); }
    if (this.customerNPC) { this._disposeGroup(this.customerNPC); this.scene.remove(this.customerNPC); }
    this.vendorNPC = this.customerNPC = null;
    this.vendorRig = this.customerRig = null;
    this.vendorBag = this.customerBag = null;
    for (const g of this.waitingRiders) { this._disposeGroup(g); this.scene.remove(g); }
    this.waitingRiders = [];
    if (this.prepLabel) this.prepLabel.visible = false;
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

  /** Vendor stall life: steam off the pot, a prep countdown over the counter, waiting riders fidgeting. */
  private animatePickupScene(t: number, dt: number) {
    const place = this.vendorPlace, stage = useGame.getState().delivery.stage;
    if (place && place.visible) {
      const pot = place.getObjectByName('steam-pot');
      this.steamAt -= dt;
      if (pot && this.steamAt <= 0 && place.position.distanceTo(this.rig.group.position) < 60) {
        this.steamAt = 0.35;
        pot.getWorldPosition(_steamPos);
        this.spawnPuff(_steamPos.x, _steamPos.y + 0.35, _steamPos.z, 0xf1f3f5, 1, 0.12, { size: 0.3, grow: 3, life: 1.8, rise: 0.7, alpha: 0.35 });
      }
    }
    for (const g of this.waitingRiders) {
      const rig = g.userData.rig as HumanoidRig | undefined;
      if (rig) animateIdle(rig, t + g.position.x, 3.1);
    }
    const label = ['preparing', 'fixingBag'].includes(stage) ? `⏱ ${Math.ceil(useGame.getState().delivery.remaining)} s` : stage === 'collect' ? 'READY ✓ · TAKE AM' : '';
    if (!label || !this.vendorNPC) { if (this.prepLabel) this.prepLabel.visible = false; return; }
    if (!this.prepLabel) {
      this.prepLabel = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
      this.prepLabel.scale.set(2.2, 0.55, 1);
      this.prepLabel.renderOrder = 9;
      this.scene.add(this.prepLabel);
    }
    if (label !== this.prepText) {
      this.prepText = label;
      (this.prepLabel.material as THREE.SpriteMaterial).map = textTexture(label, { bg: stage === 'collect' ? '#2f9e44' : '#101f17', fg: '#ffffff', w: 512, h: 128, font: 58 });
      (this.prepLabel.material as THREE.SpriteMaterial).needsUpdate = true;
    }
    this.prepLabel.visible = true;
    this.prepLabel.position.set(this.vendorNPC.position.x, 2.75, this.vendorNPC.position.z);
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
    const place=group===this.vendorNPC?this.vendorPlace:this.customerPlace;
    if(place){place.position.set(spot.x,0,spot.z);place.rotation.y=spot.yaw;}
  }

  private animateNPCs(t: number, phase: string, dt: number) {
    const order = useGame.getState().order;
    [this.vendorPlace,this.customerPlace,this.basePlace].forEach((place,i)=>{
      const lamp=this.shopLights[i];
      if(!place){lamp.intensity=0;return;}
      place.visible=place.position.distanceTo(this.rig.group.position)<200;
      const anchor=place.getObjectByName('shop-light');
      if(anchor&&place.visible){anchor.getWorldPosition(lamp.position);lamp.intensity=this.nightF*28;}
      else lamp.intensity=0;
    });
    if (order && (phase === "offer" || phase === "toPickup")) this.settleRoadside(this.vendorNPC, order.pickupX, order.pickupZ);
    if (order && phase === "toDropoff" && !order.dropSite) this.settleRoadside(this.customerNPC, order.dropX, order.dropZ);
    this.animatePickupScene(t, dt);
    if (this.vendorRig && this.vendorNPC) {
      const v = this.vendorNPC;
      this._faceRider(v, dt);
      const d = Math.hypot(this.px - v.position.x, this.pz - v.position.z);
      const stage = useGame.getState().delivery.stage;
      if (this.vendorBag) this.vendorBag.visible = ['preparing', 'collect', 'fixingBag'].includes(stage) || phase === 'offer' || phase === 'toPickup';
      if (stage === "preparing" || stage === "fixingBag") {
        // Busy at the counter, back to the rider, glancing over now and then.
        const place = this.vendorPlace;
        if (place && Math.sin(t * 0.7) < 0.6) v.rotation.y = place.rotation.y + Math.PI;
        animateIdle(this.vendorRig, t * 2.2, 1.7);
      } else if (stage === "collect") {
        if (d < 3.2) animateHandoff(this.vendorRig, t);
        else if ((t % 3) < 1.4) animateWave(this.vendorRig, t);
        else animateIdle(this.vendorRig, t, 2.3);
      } else if (phase === "pickup") {
        animateIdle(this.vendorRig, t, 2.3);
      } else if (phase === "offer" || phase === "toPickup") {
        if ((t % 7) < 1.6) animateWave(this.vendorRig, t);
        else animateIdle(this.vendorRig, t, 2.3);
      }
    }
    if (this.customerRig && this.customerNPC) {
      const c = this.customerNPC;
      const state = useGame.getState();
      let approaching = false;
      // Once the call connects, the gate swings open and the customer comes out to the road side.
      const gateKit = this.customerPlace?.name === 'compound-gate' ? this.customerPlace : null;
      if (gateKit && ['findCustomer', 'payment', 'handoff', 'completed'].includes(state.delivery.stage)) {
        this.gateOpen = Math.min(1, this.gateOpen + dt * 1.2);
        const l = gateKit.getObjectByName('gate-left'), r = gateKit.getObjectByName('gate-right');
        if (l) l.rotation.y = -this.gateOpen * 1.45;
        if (r) r.rotation.y = this.gateOpen * 1.45;
        if (this.customerInside && this.gateOpen > 0.5) {
          const yaw = gateKit.rotation.y;
          const tx = gateKit.position.x + Math.sin(yaw) * 0.9, tz = gateKit.position.z + Math.cos(yaw) * 0.9;
          const dx = tx - c.position.x, dz = tz - c.position.z, d = Math.hypot(dx, dz);
          if (d < 0.05) this.customerInside = false;
          else {
            const step = Math.min(d, dt * 1.3);
            c.position.x += dx / d * step; c.position.z += dz / d * step;
            c.rotation.y = Math.atan2(dx, dz);
            animateWalk(this.customerRig, t, 1.1);
            approaching = true;
          }
        }
      }
      if (order && this.customerPlace && state.delivery.stage === 'findCustomer' &&
          customerDetails(order.id, order.meeting).approaches && !state.mounted && Math.abs(this.speed) < 1) {
        const next = this.customerInside ? null : customerApproachStep(c.position, { x: this.px, z: this.pz }, this.customerPlace.position, dt,
          (x, z) => this.onRoad(x, z) || (this.osmActive && !!this.osmWorld.collidesBuilding(x, z, .45)));
        if (next) { c.position.x=next.x; c.position.z=next.z; approaching=true; }
      }
      if (state.delivery.stage === 'findCustomer') {
        this.world.dropMarker.position.set(c.position.x,.1,c.position.z);
        if(this.targetLabel)this.targetLabel.position.set(c.position.x,4.6,c.position.z);
      }
      if (!this.customerInside) this._faceRider(c, dt);
      const d = Math.hypot(this.px - c.position.x, this.pz - c.position.z);
      if (approaching) {
        animateWalk(this.customerRig, t, 1.1);
      } else if (phase === "deliver") {
        if (state.delivery.stage === "payment") animateHandoff(this.customerRig, t);
        else animateReceive(this.customerRig, t);
      } else if (phase === "delivered") {
        animateIdle(this.customerRig, t, 4.1);
      }
      if (this.customerBag) this.customerBag.visible = ['handoff', 'completed'].includes(state.delivery.stage);
      if (phase === "toDropoff" && !this.customerInside) {
        if ((t % 8) < 1.6) animateWave(this.customerRig, t);
        else animateIdle(this.customerRig, t, 4.1);
      }
    }
  }
  setTargetLabel(text: string, x: number, z: number) {
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
      mat.dispose();
      this.scene.remove(this.targetLabel);
      this.targetLabel = null;
    }
    const tex = textTexture(text, { bg: "#0b0b0c", fg: "#f2e35c", border: "#f2e35c", w: 512, h: 128 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true }));
    sp.scale.set(4.8, 1.2, 1);
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
    this.goalEvent({ type: 'crash' });
    flashScreen("hit");
    this.raise('crash', { crashes: ++this.crashCount });
    this.speed = -Math.min(3, Math.abs(this.speed) * 0.15); // slight bounce-back
    this.shake = 1.2;
    this.orderCollisions++;
    this.spill(18);
    this.audio.crash();
    this.sparks(this.px, this.pz);
    const strikes = s.strikes + 1;
    const streak = 0;
    const rating = Math.max(2.5, s.rating - 0.3);
    s.set({ strikes, streak, rating });
    s.pushToast(why);
    s.pushToast(STREET.calm);
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
    const o = s.order;
    if (!o || this.paidOrderId===o.id) return;
    this.paidOrderId=o.id;
    const timeBonus = Math.max(0, Math.round(s.timeLeft * 5));
    const noCrash = this.orderCollisions === 0;
    const newStreak = s.streak + 1;
    const mult = newStreak >= 10 ? 2 : newStreak >= 5 ? 1.5 : newStreak >= 3 ? 1.25 : 1;
    const condition = Math.round(s.foodCondition);
    const details = orderDetails(o);
    const d = s.delivery;
    const settled = settleDelivery({
      fare: o.reward, streakMultiplier: mult, condition, onTime: s.timeLeft > 0, timeLeft: s.timeLeft,
      collisions: this.orderCollisions, missingAccepted: d.missingAccepted, itemFixed: d.itemFixed,
      missingItem: details.missingIndex >= 0 ? details.items[details.missingIndex].name : undefined,
      changeError: d.changeError, tipMultiplier: perksFor(s.archetype).tips,
    });
    const { tip, payout: reward } = settled;
    const xpGain = Math.round((o.xp + timeBonus + (noCrash ? 200 : 0)) * mult) + settled.xpBonus;
    const ratingNew = settled.rating;
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
      lastDelivery: { reward, xp: xpGain, rating: ratingNew, streak: newStreak, tip, condition, comment: settled.comment, customer: o.customer, lines: settled.lines },
      banner: null, tutorialDone: true, onTime: s.onTime + (s.timeLeft > 0 ? 1 : 0),
    });
    persistProgress();
    this.raise('delivered', { payout: reward, earnings: useGame.getState().earnings, deliveries });
    if (noCrash && condition >= 95) this.raise('perfect');
    this.goalEvent({ type: 'delivered', timeShare: o.timeTotal > 0 ? s.timeLeft / o.timeTotal : 0, condition, streak: newStreak,
      kind: o.kind ?? 'standard', cash: details.payment === 'cash', changeError: d.changeError });
    if (newStreak === 3) this.raise('streak3');
    flashScreen(noCrash && condition >= 95 ? "gold" : "paid");
    if (noCrash && condition >= 95) s.pushToast(DELIVERY.perfect);
    else if (noCrash) s.pushToast(DELIVERY.clean);
    this.world.setMarkers(null, null, "delivered");
    if (this.targetLabel) { this.targetLabel.material.dispose(); this.scene.remove(this.targetLabel); this.targetLabel = null; }
    // Time progression is independent of deliveries.
  }

  gameOver() {
    const s = useGame.getState();
    s.set({ phase: "gameover" });
    this.audio.fail();
    this.world.setMarkers(null, null, "gameover");
    saveBoard(s.nickname || "Rider", s.score);
  }

  /** Horn: "Agoo!" — traffic ahead pulls over; honking at a funeral is rude. */
  honk() {
    if (this.honkCool > 0) return;
    this.honkCool = 0.6;
    this.audio.horn();
    this.honkedFrame = true;
    const s = useGame.getState();
    const yielded = useGame.getState().mounted && this.osmPlay ? this.osmPlay.honk(this.px, this.pz, this.heading) : 0;
    const now = performance.now();
    if (yielded > 0 && now - this.agooToastAt > 4000) { this.agooToastAt = now; s.pushToast("📯 Agoo! Traffic dey give way"); }
    else if (!yielded) s.pushToast(pick(STREET.horn));
  }

  /** Road built forward from the rider (following the route when navigating) and back behind. */
  private roadCorridor(): Corridor | null {
    if (!this.osmActive) return null;
    const start = this.osmWorld.nearestRoadFrame(this.px, this.pz, 15);
    if (!start) return null;
    const march = (x: number, z: number, dx: number, dz: number, length: number) => {
      const pts: CorridorPoint[] = [];
      let px = x, pz = z, fx = dx, fz = dz;
      for (let d = 0; d < length; d += 5) {
        const f = this.osmWorld.nearestRoadFrame(px + fx * 5, pz + fz * 5, 12);
        if (!f) break;
        let tx = f.tangentX, tz = f.tangentZ;
        if (tx * fx + tz * fz < 0) { tx = -tx; tz = -tz; }
        if (Math.hypot(f.x - px, f.z - pz) < 1) { px += fx * 5; pz += fz * 5; continue; }
        px = f.x; pz = f.z; fx = tx; fz = tz;
        pts.push({ x: px, z: pz });
      }
      return pts;
    };
    let hx = Math.sin(this.heading), hz = Math.cos(this.heading);
    if (start.tangentX * hx + start.tangentZ * hz < 0) { hx = -start.tangentX; hz = -start.tangentZ; } else { hx = start.tangentX; hz = start.tangentZ; }
    const back = march(start.x, start.z, -hx, -hz, 110).reverse();
    let ahead: CorridorPoint[];
    const route = this._osmRoute;
    if (route.length > 2 && this.routeRibbon.mesh.visible) {
      // Put the event on the way to the vendor/customer.
      let best = 0, bestD = Infinity;
      route.forEach((p, i) => { const d = Math.hypot(p.x - this.px, p.z - this.pz); if (d < bestD) { bestD = d; best = i; } });
      ahead = route.slice(best + 1);
    } else ahead = march(start.x, start.z, hx, hz, 230);
    const pts = [...back, { x: start.x, z: start.z }, ...ahead].filter((p, i, all) => i === 0 || Math.hypot(p.x - all[i - 1].x, p.z - all[i - 1].z) > 0.5);
    const corridor = new Corridor(pts);
    return corridor.length > 150 ? corridor : null;
  }

  /** Dev/QA: start an event now. */
  triggerRoadEvent(kind: 'funeral' | 'siren') {
    const corridor = this.roadCorridor();
    if (!corridor) return false;
    const r = corridor.project(this.px, this.pz);
    if (kind === 'funeral') this.roadEvents.startFuneral(corridor, r.s);
    else this.roadEvents.startSiren(corridor, r.s, Math.abs(this.speed));
    return true;
  }

  private updateRoadEvents(dt: number, riding: boolean) {
    this.honkCool = Math.max(0, this.honkCool - dt);
    const s = useGame.getState();
    if (this.osmActive && riding) {
      if (!this.roadEvents.active && this.shiftSeconds >= this.roadEventAt) {
        // Only while actually riding, and never on top of a police stop.
        if (s.mounted && Math.abs(this.speed) > 5 && !s.checkpoint) this.triggerRoadEvent(Math.random() < 0.5 ? 'funeral' : 'siren');
        this.roadEventAt = this.shiftSeconds + nextEventDelay(Math.random, false);
      }
      const t = performance.now() / 1000;
      for (const o of this.roadEvents.update({ x: this.px, z: this.pz, speed: this.speed, mounted: s.mounted, dt, honked: this.honkedFrame }, t)) this.onRoadEvent(o);
      this.roadEventSound(dt);
    }
    this.honkedFrame = false;
  }

  private onRoadEvent(o: RoadEventOutcome) {
    const s = useGame.getState();
    switch (o.type) {
      case 'warn':
        s.pushToast(o.kind === 'funeral' ? "⚰️ Funeral procession ahead! Slow down and show respect." : "🚑 Ambulance behind! Move to the side — give way!");
        break;
      case 'respect':
        s.pushToast(o.why);
        s.set({ xp: s.xp + 120, score: s.score + 120, rating: Math.min(5, Math.round((s.rating + 0.05) * 100) / 100) });
        this.audio.coin();
        break;
      case 'disrespect':
        s.pushToast(o.why);
        s.set({ rating: Math.max(1, Math.round((s.rating - 0.15) * 100) / 100) });
        this.audio.fail();
        break;
      case 'yield':
        s.pushToast("🚑 You gave way. Good citizen! +XP");
        s.set({ xp: s.xp + 100, score: s.score + 100 });
        this.audio.coin();
        break;
      case 'blocked':
        s.pushToast("🚑 Ah! Siren means GIVE WAY! Move aside.");
        s.set({ rating: Math.max(1, Math.round((s.rating - 0.2) * 100) / 100) });
        this.audio.fail();
        break;
      case 'hit':
        this.crash(this.roadEvents.kind === 'siren' ? "🚑 You hit the ambulance! Chale!" : "⚰️ You crash into the funeral! Ei!");
        break;
      case 'end':
        break;
    }
  }

  /** Two-tone siren and a slow brass line for the band, louder as they get closer. */
  private roadEventSound(dt: number) {
    this.eventAudioAt -= dt;
    if (!this.roadEvents.active || this.eventAudioAt > 0) return;
    const d = this.roadEvents.distanceTo(this.px, this.pz);
    const level = Math.max(0, 1 - d / 150);
    if (level <= 0) { this.eventAudioAt = 0.4; return; }
    if (this.roadEvents.kind === 'siren') {
      this.eventAudioAt = 0.45;
      this.bandStep++;
      this.audio.blip(this.bandStep % 2 ? 960 : 720, 0.44, "square", 0.1 * level);
    } else {
      // A slow minor brass phrase, the way the funeral bands play in the street.
      const tune = [220, 262, 294, 262, 220, 196, 220, 0];
      this.eventAudioAt = 0.42;
      const f = tune[this.bandStep++ % tune.length];
      if (f) { this.audio.blip(f, 0.38, "sawtooth", 0.06 * level); this.audio.blip(f * 1.5, 0.38, "triangle", 0.03 * level); }
    }
  }

  /** Feed a shift-goal event; pays the bonus for any goal it completes. */
  goalEvent(e: GoalEvent) {
    const s = useGame.getState();
    if (!s.shiftGoals.length || s.shiftGoals.every(g => g.done)) return;
    const { goals, completed } = applyGoalEvent(s.shiftGoals, e);
    const changed = goals.some((g, i) => g.progress !== s.shiftGoals[i].progress || g.current !== s.shiftGoals[i].current);
    if (!changed) return;
    let bonus = 0;
    for (const g of completed) {
      bonus += GOAL_DEFS[g.id].reward;
      s.pushToast(`🎯 Goal done: ${goalLabel(g)} · +GH₵${GOAL_DEFS[g.id].reward}`);
    }
    const allDone = completed.length > 0 && goals.every(g => g.done);
    if (allDone) {
      bonus += ALL_GOALS_BONUS;
      s.pushToast(`🏆 All shift goals done! Bonus +GH₵${ALL_GOALS_BONUS}`);
    }
    s.set({ shiftGoals: goals, ...(bonus ? { earnings: Math.round((s.earnings + bonus) * 100) / 100 } : {}) });
    if (bonus) {
      this.audio.deliver();
      persistProgress();
    }
  }

  /** Lamp halos after dark or in rain, and air streaks at speed. */
  private updateFx(dt: number) {
    const s = useGame.getState();
    const dark = Math.max(this.nightF, this.rain.intensity * 0.7);
    this.glows.begin();
    if (dark > 0.25 && this.osmPlay) {
      for (const v of this.osmPlay.trafficBodies()) {
        if (!v.mesh.visible || v.mesh.position.distanceTo(this.camera.position) > 140) continue;
        let anchors = v.mesh.userData.glows as THREE.Object3D[] | undefined;
        if (!anchors) {
          const found: THREE.Object3D[] = [];
          v.mesh.traverse(o => { if (o.name === 'glow-head' || o.name === 'glow-tail') found.push(o); });
          v.mesh.userData.glows = anchors = found;
        }
        for (const a of anchors) {
          a.getWorldPosition(_glowPos);
          const head = a.name === 'glow-head';
          this.glows.add(_glowPos, head ? 0xfff0c8 : 0xff2a1a, head ? 1.2 : 0.75, (head ? 0.5 : 0.42) * dark);
        }
      }
    }
    if (s.mounted) {
      // The rider's own tail flares when braking, day or night.
      const braking = this.input.down && Math.abs(this.speed) > 1;
      if (dark > 0.25 || braking) {
        this.rig.brakeLight.getWorldPosition(_glowPos);
        this.glows.add(_glowPos, 0xff2a1a, braking ? 0.9 : 0.6, braking ? 0.85 : 0.35 * dark);
      }
    }
    for (const g of this.roadEvents.sirenGlows()) this.glows.add(g.pos, g.color, 1.6, 0.9);
    this.glows.end();
    const kmh = Math.abs(this.speed) * 3.6;
    const rush = s.mounted ? Math.min(1, Math.max(0, (kmh - 65) / 45) * 0.8 + (this.boostOn ? 0.5 : 0)) : 0;
    this.streaks.update(dt, rush, Math.abs(this.speed), this.camera);
  }

  spawnPuff(x: number, y: number, z: number, color: number, n = 6, spread = 2, opts?: PuffOptions) {
    this.puffs.spawn(x, y, z, color, n, spread, opts);
  }
  sparks(x: number, z: number) {
    this.sparkField.spawn(x, 0.9, z, 0xffc94a, 16, 5, { size: 0.14, grow: 0.5, life: 0.45, rise: 3.2, alpha: 1 });
  }

  update(dt: number) {
    const s = useGame.getState();
    const phase = s.phase;
    const look = s.garagePreview ?? s.bike;
    if (look !== this.paintedBike) {
      const b = bikeFor(look);
      if (look !== this.rig.model) this.swapBike(b.id);
      this.paintedBike = look;
    }

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
        if (c > 0) this.audio.countBeep(false); else { this.audio.countBeep(true); s.pushToast(pick(STREET.start)); }
      }
      if (this.countdownT <= 0) this.offerNext();
    }

    const riding = !['menu', 'loading', 'gameover', 'countdown'].includes(phase);
    const canDrive = riding && !['handoff', 'completed', 'calling', 'checkBag', 'fixingBag', 'payment'].includes(s.delivery.stage) && !s.phoneOpen;
    const onFoot = !s.mounted;

    // --- physics ---
    const orderDiff = Math.min(1, s.orderIndex / 10);
    const bike = bikeFor(s.bike);
    // A party order's heavy box slows the bike while it's loaded.
    const loadSpeed = this.carryingFood() ? ORDER_KINDS[s.order?.kind ?? 'standard'].speedMult : 1;
    const maxSp = onFoot ? 3.4 : (26 + orderDiff * 2) * (1 - 0.18 * this.rain.intensity) * perksFor(s.archetype).speed * bike.speed * loadSpeed * (1 + SLIP.topSpeed * this.feel.slip);
    const boostMax = onFoot ? 5.5 : 37 * bike.speed;
    const wantBoost = this.input.boost && s.boost > 1 && this.input.up;
    this.boostOn = wantBoost && canDrive;
    const target = !canDrive ? 0 : movementTarget(this.input.up, this.input.down, this.speed, this.boostOn ? boostMax : maxSp, onFoot ? 2 : 5.5);
    const accel = this.input.down ? 34 : 20 * (onFoot ? 1 : bike.accel);
    // Can't accelerate without fuel
    const effectiveTarget = s.fuel <= 0 && !onFoot ? 0 : target;
    if (this.speed < effectiveTarget) this.speed = Math.min(effectiveTarget, this.speed + accel * dt);
    else if (this.speed > effectiveTarget) this.speed = Math.max(effectiveTarget, this.speed - (this.input.up ? 4 : 26) * dt);
    if (!this.onRoad(this.px, this.pz) && this.speed > 8) this.speed = Math.max(8, this.speed - 14 * dt);
    if (!onFoot && this.speed > 18 && this.input.down) this.spill(5 * dt, 'Harsh braking');
    if (!onFoot && this.speed > 27 && Math.abs(this.steerSmooth) > 0.85) this.spill(2.5 * dt, 'Sharp turn at speed');
    if (this.boostOn) s.boost = Math.max(0, s.boost - 22 * dt);
    else s.boost = Math.min(100, s.boost + (this.speed > 12 ? 6 : 3.5) * dt);

    // Fuel consumption
    if (canDrive && !onFoot && Math.abs(this.speed) > 0.5) {
      const fuelRate = (this.boostOn ? BOOST_FUEL_PER_SECOND : CRUISE_FUEL_PER_SECOND) * bike.economy * (1 - SLIP.fuelSaving * this.feel.slip);
      s.fuel = Math.max(0, s.fuel - fuelRate * dt);
    }
    // Out of fuel — can't accelerate
    if (s.fuel <= 0 && !onFoot) {
      this.speed = Math.max(0, this.speed - 12 * dt); // coast to stop
      if (this.speed < 0.5 && this._fuelWarned !== true) {
        this._fuelWarned = true;
        s.pushToast(pick(STREET.fuelOut));
        s.set({ banner: "OUT OF FUEL ⛽" });
      }
    }

    const steerAuthority = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1) * (this.speed >= 0 ? 1 : -1);
    const steerInput = canDrive ? (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0) : 0;
    const steerRate = onFoot ? 14 : steerInput === 0 ? 7 : 4.5;
    this.steerSmooth += (steerInput - this.steerSmooth) * Math.min(1, steerRate * dt);
    // Drift: hold Shift (or DRIFT) while steering hard at speed — tighter turn, tail out, speed bleeds; a kick on release.
    const driftBefore = this.feel.drift;
    const drifted = stepDrift(this.feel, { drift: !!this.input.drift && !onFoot && canDrive, steer: this.steerSmooth, speed: this.speed }, dt);
    this.feel = drifted.feel;
    if (driftBefore > 0.3 && this.feel.drift === 0) this.goalEvent({ type: 'drift', seconds: driftBefore });
    const drifting = this.feel.drift > 0;
    if (drifting) {
      this.speed = Math.max(DRIFT.minSpeed * 0.8, this.speed - DRIFT.decel * dt);
      this.spill(2 * dt, 'Drifting with food');
      this.skidAt -= dt;
      if (this.skidAt <= 0) {
        this.skidAt = 0.07;
        this.spawnPuff(this.px - Math.sin(this.heading) * 1.1, 0.25, this.pz - Math.cos(this.heading) * 1.1, 0xd9cdbd, 1, 0.6);
        this.audio.noise(0.07, 0.05);
      }
    }
    if (drifted.bonus > 0) {
      this.speed += drifted.bonus;
      s.boost = Math.min(100, s.boost + 12);
      s.pushToast(`🔥 Drift! +${Math.round(drifted.bonus * 3.6)} km/h`);
    }
    if (canDrive && (onFoot || this.speed !== 0)) {
      // Slightly less twitchy at top speed, tighter at low speed for alleys.
      const speedDamp = onFoot ? 1 : 1 - 0.3 * THREE.MathUtils.clamp(Math.abs(this.speed) / 37, 0, 1);
      const turn = onFoot ? 1 : bike.handling * (drifting ? DRIFT.turnBoost : 1);
      this.heading += this.steerSmooth * 2.2 * speedDamp * turn * (onFoot ? 1 : steerAuthority) * dt * (this.boostOn ? 0.8 : 1);
    }
    const previousX = this.px, previousZ = this.pz;
    const nx = this.px + Math.sin(this.heading) * this.speed * dt;
    const nz = this.pz + Math.cos(this.heading) * this.speed * dt;
    if (this.osmActive) {
      // The baked map's soft edge (updateCity) keeps the rider in bounds.
      this.px = nx;
      this.pz = nz;
    } else {
      this.px = THREE.MathUtils.clamp(nx, -98, 98);
      this.pz = THREE.MathUtils.clamp(nz, -98, 98);
    }

    if (this.osmActive && riding && this.crashCool <= 0) {
      const hit = this.osmWorld.collidesBuilding(this.px, this.pz, 0.9);
      if (hit) {
        this.px -= Math.sin(this.heading) * this.speed * dt * 1.5;
        this.pz -= Math.cos(this.heading) * this.speed * dt * 1.5;
        this.px = previousX; this.pz = previousZ;
        if (!onFoot) this.crash(`Collided with ${hit}. Brake and reposition.`);
        else this.speed = 0;
      }
    }

    // ramps & potholes
    this.crashCool = Math.max(0, this.crashCool - dt);
    this.potCool = Math.max(0, this.potCool - dt);
    this.nearCool = Math.max(0, this.nearCool - dt);
    if (this.py > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.py += this.vy * dt;
      if (this.py <= 0) {
        if (this.vy < -5) this.spill(Math.min(10, -this.vy), 'Hard landing');
        this.py = 0; this.vy = 0; this.bump = 0.5; this.shake = Math.max(this.shake, 0.4);
      }
    }
    const osm = this.osmPlay;
    const traffic = osm ? osm.trafficBodies() : this.world.traffic;
    // Slipstream: tuck in behind a trotro, bus or car going your way for extra top speed and less fuel.
    const tucked = !onFoot && traffic.some(c => c.mesh.visible && c.kind !== "okada" && inSlipstream(
      { x: this.px, z: this.pz, heading: this.heading, speed: this.speed },
      { x: c.mesh.position.x, z: c.mesh.position.z, yaw: c.mesh.rotation.y }));
    const slipBefore = this.feel.slip;
    this.feel = stepSlip(this.feel, tucked, dt);
    if (slipBefore < 0.95 && this.feel.slip >= 0.95) this.audio.noise(0.35, 0.08);
    if (Math.abs(this.feel.slip - s.slipstream) > 0.1 || (this.feel.slip === 0) !== (s.slipstream === 0) || drifting !== s.drifting)
      s.set({ slipstream: Math.round(this.feel.slip * 10) / 10, drifting });
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
        s.pushToast(pick(STREET.ramp));
      }
    }
    for (const p of potholes) {
      const d = Math.hypot(this.px - p.x, this.pz - p.z);
      if (d < p.r && this.py === 0 && this.potCool <= 0 && Math.abs(this.speed) > 6) {
        this.potCool = 1.2; this.vy = 3.4; this.speed *= 0.7;
        this.shake = Math.max(this.shake, 0.7);
        this.audio.noise(0.15, 0.3);
        if (this.carryingFood()) this.spill(4 + Math.abs(this.speed) * 0.35, 'Pothole');
        else s.pushToast(pick(STREET.pothole));
      }
    }

    // Solid world building collisions (stops phasing through walls!)
    if (riding && !onFoot && this.crashCool <= 0 && this.world.colliders) {
      for (const col of this.world.colliders) {
        if (this.px >= col.minX && this.px <= col.maxX && this.pz >= col.minZ && this.pz <= col.maxZ) {
          this.crash(pick(CRASH.wall).replace("{name}", col.name));
          const cx = (col.minX + col.maxX) / 2;
          const cz = (col.minZ + col.maxZ) / 2;
          const angle = Math.atan2(this.px - cx, this.pz - cz);
          this.px += Math.sin(angle) * 1.6;
          this.pz += Math.cos(angle) * 1.6;
          break;
        }
      }
    }

    if (riding && !onFoot) {
      for (const c of activeTraffic) {
        if (!c.mesh.visible) continue;
        // Oriented footprint test: a vehicle passing in its own lane is not a crash.
        const [halfW, halfL] = VEHICLE_FOOTPRINT[c.kind] ?? VEHICLE_FOOTPRINT.car;
        const yaw = c.mesh.rotation.y;
        const dx = this.px - c.mesh.position.x, dz = this.pz - c.mesh.position.z;
        const along = Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw));
        const sideSigned = dx * Math.cos(yaw) - dz * Math.sin(yaw);
        const side = Math.abs(sideSigned);
        const hit = along < halfL + 0.45 && side < halfW + 0.32;
        if (hit && Math.abs(this.speed) > 4) { this.crash(pick(CRASH[c.kind as keyof typeof CRASH] ?? CRASH.car)); break; }
        else if (hit) {
          // Slow contact: ease the rider out to the vehicle's side rather than pinning them.
          const push = (halfW + 0.34 - side) * (sideSigned >= 0 ? 1 : -1);
          this.px += Math.cos(yaw) * push;
          this.pz -= Math.sin(yaw) * push;
        }
        const close = along < halfL + 1.6 && side < halfW + 1.5;
        if (!hit && close && Math.abs(this.speed) > 16 && this.nearCool <= 0) {
          this.nearCool = 2;
          s.set({ score: s.score + 100, xp: s.xp + 25 });
          s.pushToast(pick(STREET.nearMiss));
          this.goalEvent({ type: 'nearMiss' });
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
          this.goalEvent({ type: 'crash' });
          this.spill(12);
          s.set({ score: Math.max(0, s.score - 50) });
          s.pushToast(pick(p.goat ? STREET.goat : STREET.pedestrian));
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
          s.pushToast(pick(STREET.coin));
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
                s.pushToast(`⛽ Dey fill tank for ${osm ? fuelBrand(fs) : "GOIL"}...`);
                s.set({ banner: null });
                this._fuelWarned = false;
              }
              if (newFuel >= 99) {
                s.pushToast(pick(STREET.refuelDone));
                s.set({ banner: null });
                this._fuelWarned = false;
              }
            }
          }
        }
      }
    }

    // Mission transitions are centralized and independently testable.
    if (s.delivery.stage === 'waiting' && s.delivery.remaining <= 0) this.offerNext();
    else this.dispatchDelivery({ type: 'tick', dt });
    const current = useGame.getState();
    const o = current.order;
    if (o && !['offer', 'completed'].includes(current.delivery.stage)) current.set({ timeLeft: Math.max(0, o.timeTotal - current.delivery.elapsed) });
    if (s.mounted) {
      const step = Math.hypot(this.px - previousX, this.pz - previousZ);
      s.set({ distanceRidden: s.distanceRidden + step });
      if (step < 5) this.goalRide += step; // ignore teleports (respawn, remount)
      if (this.feel.slip >= 0.95) this.goalSlip += dt;
    }
    this.shiftSeconds += dt;
    const hour = (SHIFT_START_HOUR + this.shiftSeconds / 60) % 24;
    // Dusk starts at 16:00 so the 17:30 shift start sits in the golden-orange part of the sky.
    this.nightF = hour >= 19 || hour < 5 ? .95 : hour >= 16 ? Math.max(.06, (hour - 16) / 3 * .95) : hour < 7 ? (7 - hour) / 2 * .95 : .06;

    // Trotro mates lean out and shout the destination when they stop near you.
    for (const c of activeTraffic) {
      if (c.kind === "trotro" && c.stopped > 2.4 && c.stopped < 2.6 && Math.hypot(this.px - c.mesh.position.x, this.pz - c.mesh.position.z) < 35) {
        const route = c.mesh.userData.route as { call: string } | undefined;
        if (route) this.mateShout(c.mesh, route.call);
      }
    }
    if (this.shout) {
      this.shoutLeft -= dt;
      const target = this.shoutTarget;
      if (target) this.shout.position.set(target.position.x, 3.9 + Math.sin(this.shoutLeft * 8) * 0.04, target.position.z);
      this.shout.visible = this.shoutLeft > 0 && !!target?.visible;
    }

    // particles: dust + exhaust
    this.dustTimer -= dt;
    const offRoad = !this.onRoad(this.px, this.pz);
    if (s.mounted && Math.abs(this.speed) > 3 && (offRoad || this.boostOn) && this.dustTimer <= 0 && this.py === 0) {
      this.dustTimer = offRoad ? 0.06 : 0.12;
      this.spawnPuff(this.px - Math.sin(this.heading) * 1.2, 0.3, this.pz - Math.cos(this.heading) * 1.2, offRoad ? 0xc2a06b : 0xbdb8b0, 1, 1,
        { size: 0.55, grow: 3.2, life: 1.1, rise: 0.6, alpha: offRoad ? 0.42 : 0.25 });
    }
    if (s.mounted && Math.abs(this.speed) > 4 && Math.random() < dt * 12) {
      this.rig.exhaust.getWorldPosition(_exhaustPos);
      this.spawnPuff(_exhaustPos.x, _exhaustPos.y, _exhaustPos.z, 0x9a9a9a, 1, 0.35, { size: 0.18, grow: 4, life: 0.9, rise: 0.5, alpha: 0.3 });
    }
    this.puffs.update(dt);
    this.sparkField.update(dt);

    const t = performance.now() / 1000;
    this.tickOsm(dt, t);
    this.world.update(dt, t, this.nightF, this.px, this.pz);
    this.animateNPCs(t, phase, dt);
    this.syncRig(dt, t, dt);
    if(!o && this.freeDestination) {
      const dest=this.freeDestination;
      this.updateNav({...makeOrder(0),pickupX:dest.x,pickupZ:dest.z},'toPickup');
    } else this.updateNav(o, phase);
    this.updateCamera(dt, false);
    this.updateRoadEvents(dt, riding);
    this.updateFx(dt);
    this.applySky(this.nightF);
    this.updateCity(dt, t);
    this.audio.setEngine(s.mounted ? Math.min(1, Math.abs(this.speed) / 37) : -1, this.boostOn);
    if (s.banner && phase === "gameover") s.set({ banner: null });

    // throttled HUD sync
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      if (this.goalRide > 0) { this.goalEvent({ type: 'ride', metres: this.goalRide }); this.goalRide = 0; }
      if (this.goalSlip > 0) { this.goalEvent({ type: 'slip', seconds: this.goalSlip }); this.goalSlip = 0; }
      this.updateCalls();
      if (s.hour >= 19) this.raise('night');
      if (o && s.timeLeft <= 0 && this.lateOrderId !== o.id && ['rideCustomer', 'contact'].includes(s.delivery.stage)) {
        this.lateOrderId = o.id;
        this.raise('late', { customer: o.customer });
      }
      if (s.fuel < 20 && s.fuel > 0 && !this._fuelWarned) {
        s.pushToast(pick(STREET.fuelLow));this._fuelWarned=true;this.raise('fuelLow');
      }
      const targetX = o && (phase === "toDropoff" || phase === "deliver" || phase === "delivered") ? o.dropX : o?.pickupX ?? 0;
      const targetZ = o && (phase === "toDropoff" || phase === "deliver" || phase === "delivered") ? o.dropZ : o?.pickupZ ?? 0;
      let distUnits = o ? Math.hypot(this.px - targetX, this.pz - targetZ) : this.freeDestination ? Math.hypot(this.px-this.freeDestination.x,this.pz-this.freeDestination.z) : 0;
      let turnHint = "";
      let navManeuver: GameState["navManeuver"] = null;
      let navTurnIn = 0;
      let roadName = "";
      if (this.osmActive) {
        const roadFrame=this.osmWorld.nearestRoadFrame(this.px,this.pz,25);
        roadName=(roadFrame?this.osmWorld.visibleRoads(this.px,this.pz,0).find(r=>r.id===roadFrame.roadId)?.name:null) ?? "";
      }
      const navigating = this.routeRibbon.mesh.visible || this.beacon.group.visible;
      if ((o || this.freeDestination) && this.osmActive && this._osmRoute.length > 1) {
        const cue = cueFromRoute(this._osmRoute, this.px, this.pz, this.heading);
        turnHint = roadName ? `${cue.text} · ${roadName}` : cue.text;
        distUnits = cue.remaining;
        if (navigating) { navManeuver = cue.maneuver; navTurnIn = cue.turnIn; }
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
      const context = this.deliveryContext();
      const interactionDistance = ['ridePickup', 'vendor', 'preparing', 'collect'].includes(s.delivery.stage) ? context.vendorDistance : context.customerDistance;
      s.set({ atBase: Math.hypot(this.px-this.base.x,this.pz-this.base.z)<14, interactionDistance, bikeDistance: context.bikeDistance, hour,
        speedKmh: Math.round(Math.abs(this.speed) * (this.osmActive ? 3.6 : 3.2)), distM: distUnits, turnHint,
        navManeuver, navTurnIn, roadName, compass: compassPoint(this.heading) });
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  syncRig(dt: number, t: number, step: number) {
    const mounted = useGame.getState().mounted;
    this.rig.group.position.set(mounted ? this.px : this.parked.x, this.py, mounted ? this.pz : this.parked.z);
    this.rig.group.rotation.y = mounted ? this.heading + this.feel.slide : this.parked.heading;
    this.rig.body.visible = mounted;
    this.footRider.group.visible = !mounted;
    if (!mounted) {
      this.footRider.group.position.set(this.px, 0, this.pz);
      this.footRider.group.rotation.y = this.heading;
      const stage = useGame.getState().delivery.stage;
      this.carriedBag.visible = ['checkBag', 'returnBike', 'rideCustomer', 'contact', 'calling', 'findCustomer', 'payment'].includes(stage);
      if (stage === 'handoff') animateHandoff(this.footRider, t);
      else if (Math.abs(this.speed) > .1) animateWalk(this.footRider, t, Math.abs(this.speed));
      else animateIdle(this.footRider, t, 0);
      this.rig.lean.rotation.z = .14;
      return;
    }
    const steer = this.steerSmooth;
    const stopped = Math.abs(this.speed) < 1.5;
    // bike tilts slightly left when the rider plants a foot at a stop
    const leanTarget = -steer * Math.min(0.45, Math.abs(this.speed) / 60) + Math.sin(t * 1.3) * 0.015 + (stopped ? 0.12 : 0);
    this.rig.lean.rotation.z += (leanTarget - this.rig.lean.rotation.z) * Math.min(1, 8 * (step || 0.016));
    this.rig.lean.rotation.x = this.py > 0 ? -0.12 : THREE.MathUtils.clamp(-this.speed * 0.002, -0.06, 0) + (this.bump > 0 ? Math.sin(t * 40) * 0.02 : 0);
    this.bump = Math.max(0, this.bump - (step || 0.016));
    // wheels
    // Wheels roll at speed / radius (scooters spin their small wheels faster).
    this.rig.frontWheel.rotation.x += this.speed * (step || 0.016) / this.rig.frontWheel.position.y;
    this.rig.rearWheel.rotation.x += this.speed * (step || 0.016) / this.rig.rearWheel.position.y;
    // Drop the hips when stopped so the left foot can reach the road. Tuck on boost.
    const sit = this.boostOn ? -0.08 : stopped ? -0.07 : 0;
    const sitK = Math.min(1, (step || 0.016) * 6);
    this.rig.body.position.y += (sit - this.rig.body.position.y) * sitK;
    this.rig.body.rotation.x += ((this.boostOn ? 0.07 : 0) - this.rig.body.rotation.x) * sitK;
    (this.rig.brakeLight.material as THREE.MeshBasicMaterial).color.setHex(this.input.down ? 0xff2222 : 0x550000);
    this.rig.headlight.intensity = this.nightF > 0.35 ? 90 : 0;
    const r = this.rig.rider;
    if (r) {
      const phase = useGame.getState().phase;
      const interact = phase === "pickup" ? "pickup" : phase === "deliver" ? "deliver" : "none";
      poseRider(r, {
        t, dt: step || 0.016, steer, speed: this.speed, stopped,
        braking: this.input.down, boost: this.boostOn, interact, crouch: this.rig.crouch,
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
    const show = !!o && (phase === "toPickup" || phase === "pickup" || phase === "toDropoff" || phase === "offer");
    for (const c of this.chevrons) c.visible = show;
    if (!show || !o) { this.routeRibbon.hide(); this.beacon.hide(); return; }
    const stage=useGame.getState().delivery.stage;
    const returnBike=stage==='returnBike';
    const closeActor=stage==='findCustomer'?this.customerNPC:['vendor','collect','preparing'].includes(stage)?this.vendorNPC:null;
    const tx = returnBike ? this.parked.x : closeActor ? closeActor.position.x : phase === "toDropoff" ? o.dropX : o.pickupX;
    const tz = returnBike ? this.parked.z : closeActor ? closeActor.position.z : phase === "toDropoff" ? o.dropZ : o.pickupZ;

    if (this.osmActive) {
      const now = performance.now();
      const targetKey = `${phase}:${tx.toFixed(1)}:${tz.toFixed(1)}`;
      const moved = Math.hypot(this.px - this._osmRouteFromX, this.pz - this._osmRouteFromZ);
      const due = targetKey !== this._osmRouteTarget || now - this._osmRouteAt > 2500 || (moved > 16 && now - this._osmRouteAt > 650);
      if (due) {
        this._osmRoute = !useGame.getState().mounted ? [{x:this.px,z:this.pz},{x:tx,z:tz}] : this.osmWorld.route({ x: this.px, z: this.pz }, { x: tx, z: tz });
        this._osmRouteTarget = targetKey;
        this._osmRouteAt = now;
        this._osmRouteFromX = this.px;
        this._osmRouteFromZ = this.pz;
      }
      const route = this._osmRoute;
      // The painted ribbon replaces the floating cones on real roads.
      for (const c of this.chevrons) c.visible = false;
      const toCustomer = phase === "toDropoff" && !returnBike;
      const routeColor = returnBike ? 0x74c0fc : toCustomer ? 0x51cf66 : 0xf2e35c;
      this.routeRibbon.setColor(routeColor);
      if (route.length > 1) this.routeRibbon.update(route, this.px, this.pz, now / 1000);
      else this.routeRibbon.hide();
      const targetDistance = Math.hypot(this.px - tx, this.pz - tz);
      // Up close the column only blocks the view of the vendor/customer.
      if (targetDistance > 26) this.beacon.show(tx, tz, routeColor, now / 1000, targetDistance);
      else this.beacon.hide();
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
    if (this.targetLabel) {
      this.targetLabel.position.y = 3.8 + Math.sin(performance.now() / 600) * .1;
      const labelDistance = Math.hypot(this.px-tx,this.pz-tz);
      this.targetLabel.visible = !returnBike && labelDistance > 8 && labelDistance < 95;
    }
  }

  applySky(night: number) {
    // The sun follows the shift clock: rises in the east, sets in the west, low and golden
    // late in the afternoon so buildings, trotros and the rider cast long shadows.
    // After dark a dim moon takes over from high in the south-east.
    const hour = useGame.getState().hour;
    const dayT = (hour - 6) / 12;
    // Held at ~16° until close to sunset: lower, and grazing light flattens the ground and kills shadow contrast.
    const elevation = dayT > 0 && dayT < 1 ? Math.max(hour < 18.4 ? 0.28 : 0.08, Math.sin(Math.PI * dayT) * 1.2) : 0;
    const azimuth = Math.PI * Math.min(1, Math.max(0, dayT));
    const moon = elevation <= 0.075;
    const el = moon ? 0.95 : Math.min(1.2, elevation);
    const az = moon ? 0.6 : azimuth;
    const sunX = Math.cos(az) * Math.cos(el) * 120;
    const sunY = Math.sin(el) * 120;
    const sunZ = 25 + Math.sin(az) * 18;
    this.world.sun.position.set((this.osmActive ? this.px : 0) + sunX, sunY, (this.osmActive ? this.pz : 0) + sunZ);
    if (this.sky) {
      _sunDir.set(moon ? -sunX : sunX, moon ? -10 : sunY, sunZ);
      this.sky.setTime(night, _sunDir, performance.now() / 1000);
      this.sky.mesh.position.copy(this.camera.position);
      _skyResult.copy(this.sky.horizon);
      this.world.sun.color.copy(this.sky.sunColor).lerp(_white, 0.35 - night * 0.2);
    }
    this.scene.background = _skyResult;
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(_skyResult);
    // Golden hour: strong low sun, less sky fill, so shadows read long and dark.
    const golden = hour >= 15.5 && hour < 18.8 ? Math.min(1, (hour - 15.5) / 1.2) * Math.min(1, (18.8 - hour) / 0.5) : 0;
    this.world.sun.intensity = moon ? 0.32 : 2.3 - night * 1.2 + golden * 0.6;
    if (moon) this.world.sun.color.setHex(0x9fb4e8);
    // Real night: the street is lit by lamps, windows and headlights, not the sky.
    this.world.hemi.intensity = (0.75 - night * 0.6) * (1 - golden * 0.5);
    this.world.ambient.intensity = (0.45 - night * 0.37) * (1 - golden * 0.55);
    // Image-based reflections otherwise keep the city lit like noon after dark.
    this.scene.environmentIntensity = (1 - night * 0.86) * (1 - golden * 0.5);
    this.world.hemi.color.copy(_skyResult).lerp(_white, 0.45);
    this.horizon?.update(this.camera, _skyResult, night);
  }

  updateCamera(dt: number, menu: boolean) {
    const t = performance.now() / 1000;
    if (menu) {
      const a = t * 0.25;
      _menuTarget.set(this.px + Math.sin(a) * 5.2, 2.2, this.pz + Math.cos(a) * 5.2);
      this.camPos.lerp(_menuTarget, Math.min(1, dt * 2));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.px, 1.05, this.pz);
      const prevFov = this.camera.fov;
      this.camera.fov += (58 - this.camera.fov) * dt * 2;
      if (Math.abs(this.camera.fov - prevFov) > 0.001) this.camera.updateProjectionMatrix();
      return;
    }
    const mounted = useGame.getState().mounted;
    const speedK = Math.min(1, Math.abs(this.speed) / 37);
    // Framed for a real-size bike (~2 m long): close behind and just above the helmet.
    const back = (mounted ? 4.3 : 3.8) + speedK * 1.3;
    const h = (mounted ? 2.25 : 2.3) + speedK * 0.35;
    // Swing the camera with a smoothed heading but keep it locked to the bike's
    // position, so high speed no longer leaves the rider tiny in the distance.
    let dh = this.heading - this.camHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.camHeading += dh * Math.min(1, dt * (mounted ? 4.5 : 6));
    const dx = this.px - Math.sin(this.camHeading) * back;
    const dz = this.pz - Math.cos(this.camHeading) * back;
    const lag = Math.min(1, dt * 12);
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
    const ahead = mounted ? 5 + speedK * 3.5 : 1.8;
    const lookX = this.px + Math.sin(this.heading) * ahead + Math.cos(this.heading) * this.steerSmooth * 1.3;
    const lookZ = this.pz + Math.cos(this.heading) * ahead - Math.sin(this.heading) * this.steerSmooth * 1.3;
    // Keep the chase camera in front of nearby buildings/traffic instead of inside them.
    this.cameraAnchor.set(this.px, 1.65 + this.py, this.pz);
    this.cameraDirection.copy(this.camera.position).sub(this.cameraAnchor);
    const desiredDistance=this.cameraDirection.length();
    this.cameraDirection.normalize();
    if(t-this.cameraCheckAt>.12){
      this.cameraCheckAt=t;
      this.cameraRay.set(this.cameraAnchor,this.cameraDirection);
      this.cameraRay.camera=this.camera;
      this.cameraRay.near=.3;this.cameraRay.far=desiredDistance;
      // Traffic is transient; pulling the camera into the helmet whenever a
      // trotro brakes behind the rider is worse than briefly clipping it.
      const obstacles:THREE.Object3D[]=[...this.osmWorld.cameraObstacles(this.px,this.pz)];
      for(const place of [this.vendorPlace,this.customerPlace,this.basePlace])if(place?.visible)obstacles.push(place);
      const hit=this.cameraRay.intersectObjects(obstacles,true).find(h=>h.object instanceof THREE.Mesh);
      this.cameraClearance=hit?Math.max(.8,hit.distance-.4):20;
      // See-through rider only while something actually stands in the way.
      const blockers:THREE.Object3D[]=[...obstacles,...this.roadEvents.objects()];
      for(const c of this.osmPlay?.trafficBodies()??[])if(c.mesh.visible&&c.mesh.position.distanceTo(this.camera.position)<desiredDistance+4)blockers.push(c.mesh);
      const hidden=this.cameraRay.intersectObjects(blockers,true).some(h=>h.object instanceof THREE.Mesh&&h.object.name!=="rider-ghost");
      this.riderGhost?.setVisible(hidden);this.footGhost?.setVisible(hidden);
    }
    if(this.cameraClearance<desiredDistance){
      this.camera.position.copy(this.cameraAnchor).addScaledVector(this.cameraDirection,this.cameraClearance);
      // Rise over the rider instead of pushing into the helmet.
      // On foot this would push into stall canopies, so only lift while riding.
      if(mounted)this.camera.position.y+=Math.min(2.2,(desiredDistance-this.cameraClearance)*.35);
    }
    this.camera.lookAt(lookX, 1.3 + this.py * 0.2, lookZ);
    if (mounted) this.camera.rotateZ(-this.steerSmooth * speedK * 0.045);


    const wantFov = this.boostOn ? 75 : 62 + Math.min(6, Math.abs(this.speed) * 0.15);
    const prevFov = this.camera.fov;
    this.camera.fov += (wantFov - this.camera.fov) * Math.min(1, dt * 5);
    if (Math.abs(this.camera.fov - prevFov) > 0.001) this.camera.updateProjectionMatrix();
  }

  private pixelRatio = 1;
  graphics: Graphics = "high";
  private ink: InkPass | null = null;
  private riderGhost: ReturnType<typeof addSilhouette> | null = null;
  private footGhost: ReturnType<typeof addSilhouette> | null = null;
  private lastFrameAt = 0;
  private frameCount = 0;
  private slowFrames = 0;
  private perfWindowAt = 0;
  private perfFrames = 0;

  loop = (now = performance.now()) => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    // Cap at 60 fps (30 in menus): 120 Hz displays otherwise run the GPU flat out.
    const phase = useGame.getState().phase;
    const idle = phase === "menu" || phase === "loading" || useGame.getState().paused;
    const minGap = idle ? 1000 / 30 : 1000 / 60;
    if (now - this.lastFrameAt < minGap - 1.5) return;
    this.lastFrameAt = now;
    const dt = Math.min(0.05, this.clock.getDelta());
    try { this.update(dt); } catch (e) { console.error("Game update error:", e); }
    // Moving sun shadows only need refreshing every other frame.
    this.frameCount++;
    this.renderer.shadowMap.needsUpdate = this.frameCount % 2 === 0;
    if (this.ink) this.ink.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    if (!idle) this.adaptQuality(now, dt);
  };

  /** Drop render resolution in steps while the game can't hold ~50 fps. */
  private adaptQuality(now: number, dt: number) {
    // Background/unfocused windows get throttled by the browser; that isn't a slow machine.
    if (document.hidden || !document.hasFocus()) { this.perfWindowAt = 0; this.perfFrames = 0; this.slowFrames = 0; return; }
    if (!this.perfWindowAt) this.perfWindowAt = now;
    this.perfFrames++;
    if (dt > 1 / 45) this.slowFrames++;
    if (now - this.perfWindowAt < 3000) return;
    const fps = this.perfFrames / ((now - this.perfWindowAt) / 1000);
    const slowShare = this.slowFrames / this.perfFrames;
    this.perfWindowAt = now; this.perfFrames = 0; this.slowFrames = 0;
    if ((fps < 50 || slowShare > 0.25) && this.pixelRatio > 0.85) {
      this.pixelRatio = Math.max(0.85, Math.round((this.pixelRatio - 0.2) * 100) / 100);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  dispose() {
    this.running = false;
    this.rainStreaks?.dispose();
    if (this._bannerTimer) { clearTimeout(this._bannerTimer); this._bannerTimer = null; }
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("visibilitychange", this._onVis);
    this.audio.dispose();
    this.osmPlay?.dispose();
    this.osmPlay = null;
    this.osmWorld.dispose();
    if(this.basePlace)disposeDeliveryPlace(this.basePlace);
    this.scene.remove(this.footRider.group);
    this._disposeGroup(this.footRider.group);
    // dispose sky dome
    if (this.sky) {
      this.sky.dispose();
      this.scene.remove(this.sky.mesh);
      this.sky = null;
    }
    this.scene.remove(this.routeRibbon.mesh, this.beacon.group);
    this.routeRibbon.dispose();
    this.beacon.dispose();
    disposeTextureCache();
    for (const fx of [this.puffs, this.sparkField, this.glows, this.streaks]) fx.dispose();
    this.ink?.dispose();
    this.riderGhost?.dispose();
    this.footGhost?.dispose();
    this.roadEvents.clear();
    this.clearNPCs();
    if (this.targetLabel) {
      const mat = this.targetLabel.material as THREE.SpriteMaterial;
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
