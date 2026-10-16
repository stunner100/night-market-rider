import * as THREE from "three";
import { animateWalk, buildHumanoid, SKIN_TONES, type HumanoidRig } from "../characters";
import { createAmbulanceMesh } from "../models";

/**
 * Road events with Accra etiquette:
 * - Funeral procession: pallbearers dance a coffin down the road with a band.
 *   Pass slowly (or follow behind) for respect; speeding past or honking costs.
 * - Ambulance: comes up behind with a siren. Pull to the side or slow down to
 *   give way; blocking it costs.
 * Rules are pure functions (tested); RoadEvents owns the meshes.
 */

export type RoadEventKind = "funeral" | "siren";

export type RoadEventOutcome =
  | { type: "warn"; kind: RoadEventKind }
  | { type: "respect"; why: string }
  | { type: "disrespect"; why: string }
  | { type: "yield" }
  | { type: "blocked" }
  | { type: "hit" }
  | { type: "end"; kind: RoadEventKind };

// ---------------------------------------------------------------- corridor

export interface CorridorPoint { x: number; z: number }

/** A road polyline with arc length, for placing and projecting along the road. */
export class Corridor {
  readonly s: number[] = [0];
  constructor(readonly pts: CorridorPoint[]) {
    for (let i = 1; i < pts.length; i++) this.s.push(this.s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  }
  get length() { return this.s[this.s.length - 1]; }

  /** Point at arc length `d` with `lateral` metres to the right of travel. */
  at(d: number, lateral = 0): { x: number; z: number; yaw: number } {
    const dd = Math.max(0, Math.min(this.length, d));
    let i = 1;
    while (i < this.s.length - 1 && this.s[i] < dd) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const seg = this.s[i] - this.s[i - 1] || 1;
    const u = (dd - this.s[i - 1]) / seg;
    const tx = (b.x - a.x) / seg, tz = (b.z - a.z) / seg;
    // Right of travel is (-tz, tx).
    return { x: a.x + (b.x - a.x) * u - tz * lateral, z: a.z + (b.z - a.z) * u + tx * lateral, yaw: Math.atan2(tx, tz) };
  }

  /** Arc length of the nearest point and signed lateral offset (+ = right of travel). */
  project(x: number, z: number): { s: number; lateral: number; distance: number } {
    let best = { s: 0, lateral: 0, distance: Infinity };
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz || 1;
      const u = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
      const px = a.x + abx * u, pz = a.z + abz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.distance) {
        const len = Math.sqrt(len2);
        const lateral = ((x - px) * -abz + (z - pz) * abx) / len;
        best = { s: this.s[i - 1] + u * len, lateral, distance: d };
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------- rules

export interface FuneralJudge {
  warned: boolean;
  honked: boolean;
  /** Fastest speed (m/s) while alongside the procession. */
  passMax: number;
  alongside: boolean;
  /** Seconds spent following patiently behind. */
  followed: number;
  done: boolean;
}

export const newFuneralJudge = (): FuneralJudge => ({ warned: false, honked: false, passMax: 0, alongside: false, followed: 0, done: false });

export const FUNERAL = { warnGap: 70, alongside: 9, slow: 5.5, fast: 8.3, followFor: 14, honkRange: 40 } as const;

/**
 * `gap` = rider arc length minus procession centre (negative = behind it).
 * `halfLength` = half the procession's length along the road.
 */
export function judgeFuneral(j: FuneralJudge, i: { gap: number; distance: number; speed: number; honked: boolean; halfLength: number; dt: number }): { judge: FuneralJudge; out: RoadEventOutcome[] } {
  if (j.done) return { judge: j, out: [] };
  const out: RoadEventOutcome[] = [];
  const next = { ...j };
  const near = i.distance < 14;
  if (!next.warned && i.gap > -FUNERAL.warnGap && i.gap < 0 && near) { next.warned = true; out.push({ type: "warn", kind: "funeral" }); }
  if (i.honked && Math.abs(i.gap) < FUNERAL.honkRange && !next.honked) {
    next.honked = true;
    out.push({ type: "disrespect", why: "Ei! You dey honk for funeral?!" });
  }
  const alongside = near && Math.abs(i.gap) < i.halfLength + FUNERAL.alongside;
  if (alongside) { next.alongside = true; next.passMax = Math.max(next.passMax, Math.abs(i.speed)); }
  // Patiently following behind counts as respect too.
  if (!alongside && near && i.gap < -i.halfLength && i.gap > -40 && Math.abs(i.speed) < FUNERAL.slow) next.followed += i.dt;
  if (next.followed >= FUNERAL.followFor && !next.honked) {
    next.done = true;
    out.push({ type: "respect", why: "You followed the procession patiently. The family thanks you 🙏" });
    return { judge: next, out };
  }
  // Fully past the front of the procession: judge the pass.
  if (next.alongside && i.gap > i.halfLength + FUNERAL.alongside) {
    next.done = true;
    if (next.passMax > FUNERAL.fast) out.push({ type: "disrespect", why: "Chale, you speed past the funeral! Show respect." });
    else if (next.passMax <= FUNERAL.slow && !next.honked) out.push({ type: "respect", why: "Slow and respectful past the funeral. Ayekoo 🙏" });
  }
  return { judge: next, out };
}

export interface SirenJudge { warned: boolean; blockedFor: number; penalised: boolean; done: boolean }

export const newSirenJudge = (): SirenJudge => ({ warned: false, blockedFor: 0, penalised: false, done: false });

export const SIREN = { warnGap: 60, blockAhead: 20, blockLateral: 1.7, blockLimit: 1.6, tailgate: 7 } as const;

/**
 * `gap` = rider arc length minus ambulance arc length (positive = rider ahead of it).
 * `lateralDiff` = rider lateral minus ambulance lateral.
 * Returns `blocking` so the van can slow behind the rider instead of ploughing through.
 */
export function judgeSiren(j: SirenJudge, i: { gap: number; lateralDiff: number; dt: number }): { judge: SirenJudge; out: RoadEventOutcome[]; blocking: boolean } {
  if (j.done) return { judge: j, out: [], blocking: false };
  const out: RoadEventOutcome[] = [];
  const next = { ...j };
  if (!next.warned && i.gap > 0 && i.gap < SIREN.warnGap) { next.warned = true; out.push({ type: "warn", kind: "siren" }); }
  const blocking = i.gap > 0 && i.gap < SIREN.blockAhead && Math.abs(i.lateralDiff) < SIREN.blockLateral;
  next.blockedFor = blocking ? next.blockedFor + i.dt : Math.max(0, next.blockedFor - i.dt * 0.5);
  if (!next.penalised && next.blockedFor > SIREN.blockLimit) { next.penalised = true; out.push({ type: "blocked" }); }
  // The ambulance has gone past the rider.
  if (i.gap < -6) {
    next.done = true;
    if (!next.penalised) out.push({ type: "yield" });
  }
  return { judge: next, out, blocking };
}

// ---------------------------------------------------------------- scheduling

/** Next event time: first one after a minute of riding, then every 1.5–3 minutes. */
export function nextEventDelay(random: () => number, first: boolean) {
  return first ? 55 + random() * 35 : 90 + random() * 90;
}

// ---------------------------------------------------------------- world objects

interface Mourner { rig: HumanoidRig; along: number; lateral: number; role: "bearer" | "band" | "mourner"; seed: number; index: number }

const BLACK = 0x15161a, RED = 0xb3121f;

function buildProcession(mobile: boolean) {
  const group = new THREE.Group();
  group.name = "funeral-procession";
  const people: Mourner[] = [];
  const add = (role: Mourner["role"], along: number, lateral: number, i: number) => {
    const rig = buildHumanoid({
      skin: SKIN_TONES[(i * 3) % SKIN_TONES.length],
      shirt: i % 2 ? RED : BLACK, pants: BLACK, hair: role === "bearer" ? "short" : i % 3 ? "wrap" : "short",
      capColor: RED, detail: "simple", scale: 0.97 + (i % 3) * 0.02, feminine: role === "mourner" && i % 2 === 0,
    });
    rig.group.traverse(o => { o.castShadow = false; });
    group.add(rig.group);
    people.push({ rig, along, lateral, role, seed: i * 1.37, index: i });
  };
  // Four pallbearers under the coffin, a band in front, mourners behind.
  [[-0.9, -0.55], [-0.9, 0.55], [0.9, -0.55], [0.9, 0.55]].forEach(([a, l], i) => add("bearer", a, l, i));
  add("band", 3.6, -0.6, 4); add("band", 3.6, 0.6, 5);
  if (!mobile) { add("mourner", -3.6, -0.7, 6); add("mourner", -3.8, 0.7, 7); add("mourner", -5.3, 0, 8); }
  else add("mourner", -3.6, 0, 6);

  const coffin = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a1e, roughness: 0.4, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a017, roughness: 0.3, metalness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: RED, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 2.2), wood);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.79, 0.07, 2.24), gold);
  trim.position.y = 0.1;
  const drape = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.4), cloth);
  drape.position.y = 0.27;
  coffin.add(body, trim, drape);
  coffin.position.y = 2.05;
  group.add(coffin);

  // Band instruments: a trumpet and a drum.
  const brass = new THREE.MeshStandardMaterial({ color: 0xe0b33c, roughness: 0.25, metalness: 0.9 });
  const trumpet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, 0.55, 10), brass);
  trumpet.rotation.x = Math.PI / 2;
  trumpet.position.set(0, -0.05, 0.3);
  people[4].rig.armR.hand.add(trumpet);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.32, 14), new THREE.MeshStandardMaterial({ color: 0xf1e4c3, roughness: 0.7 }));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0, 1.0, 0.3);
  people[5].rig.group.add(drum);
  return { group, people, coffin };
}

function disposeTree(root: THREE.Object3D) {
  root.traverse(o => {
    if (o.userData.shared) return;
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const m = o.material;
      (Array.isArray(m) ? m : [m]).forEach(x => x.dispose());
    }
  });
}

export interface RoadEventContext {
  x: number; z: number; speed: number; mounted: boolean;
  /** Seconds this frame. */
  dt: number;
  /** True for the single frame the rider honked. */
  honked: boolean;
}

export class RoadEvents {
  kind: RoadEventKind | null = null;
  private corridor: Corridor | null = null;
  private s = 0;
  private procession: ReturnType<typeof buildProcession> | null = null;
  private ambulance: THREE.Group | null = null;
  private funeral = newFuneralJudge();
  private siren = newSirenJudge();
  private age = 0;
  private sirenPhase = 0;
  private ambSpeed = 0;
  private ambLat = 0.6;

  constructor(private scene: THREE.Scene, private mobile: boolean) {}

  get active() { return this.kind !== null; }

  startFuneral(corridor: Corridor, riderS: number) {
    this.clear();
    this.kind = "funeral";
    this.corridor = corridor;
    this.s = Math.min(corridor.length - 30, riderS + 75);
    this.procession = buildProcession(this.mobile);
    this.scene.add(this.procession.group);
    this.funeral = newFuneralJudge();
    this.age = 0;
  }

  startSiren(corridor: Corridor, riderS: number, riderSpeed: number) {
    this.clear();
    this.kind = "siren";
    this.corridor = corridor;
    this.s = Math.max(0, riderS - 85);
    this.ambulance = createAmbulanceMesh();
    this.scene.add(this.ambulance);
    this.siren = newSirenJudge();
    this.ambSpeed = Math.max(16, riderSpeed + 9);
    this.ambLat = 0.6;
    this.age = 0;
  }

  update(ctx: RoadEventContext, time: number): RoadEventOutcome[] {
    const c = this.corridor;
    if (!this.kind || !c) return [];
    this.age += ctx.dt;
    const rider = c.project(ctx.x, ctx.z);
    const out: RoadEventOutcome[] = [];
    if (this.kind === "funeral" && this.procession) {
      const p = this.procession;
      this.s += 1.05 * ctx.dt;
      const halfLength = 4;
      const res = judgeFuneral(this.funeral, { gap: rider.s - this.s, distance: rider.distance, speed: ctx.speed, honked: ctx.honked, halfLength, dt: ctx.dt });
      this.funeral = res.judge;
      out.push(...res.out);
      // Lay the procession out along the road, in the right-hand lane.
      const centre = c.at(this.s, 1.4);
      // ~40 draw calls a person: skip drawing it while it's a speck in the distance.
      p.group.visible = Math.hypot(centre.x - ctx.x, centre.z - ctx.z) < 70;
      p.coffin.position.set(centre.x, 2.05 + Math.sin(time * 4.2) * 0.12, centre.z);
      p.coffin.rotation.set(0, centre.yaw + Math.sin(time * 2.1) * 0.18, Math.sin(time * 4.2) * 0.12);
      for (const m of p.people) {
        const at = c.at(this.s + m.along, 1.4 + m.lateral);
        m.rig.group.position.set(at.x, 0, at.z);
        m.rig.group.rotation.y = at.yaw + (m.role === "bearer" ? Math.sin(time * 2.1 + m.seed) * 0.25 : 0);
        animateWalk(m.rig, time + m.seed, m.role === "bearer" ? 5.5 : 3.2);
        if (m.role === "bearer") {
          // Arms up to the coffin, swaying to the band.
          const side = m.lateral < 0 ? -1 : 1;
          m.rig.armL.shoulder.rotation.set(-0.2, 0, -2.75 - (side < 0 ? 0.1 : 0));
          m.rig.armR.shoulder.rotation.set(-0.2, 0, 2.75 + (side > 0 ? 0.1 : 0));
          m.rig.armL.elbow.rotation.x = m.rig.armR.elbow.rotation.x = -0.35;
          m.rig.group.position.y += Math.abs(Math.sin(time * 4.2 + m.seed)) * 0.06;
        } else if (m.role === "band") {
          if (m.index === 4) {
            // Trumpet up to the lips.
            m.rig.armR.shoulder.rotation.set(-1.25, 0, 0.2);
            m.rig.armR.elbow.rotation.x = -1.1;
          } else {
            // Drummer beats with both hands.
            const beat = Math.sin(time * 9) * 0.25;
            m.rig.armL.shoulder.rotation.set(-0.7 + beat, 0, -0.2);
            m.rig.armR.shoulder.rotation.set(-0.7 - beat, 0, 0.2);
          }
        }
        if (ctx.mounted && Math.abs(ctx.speed) > 2 && Math.hypot(at.x - ctx.x, at.z - ctx.z) < 0.9) out.push({ type: "hit" });
      }
      const behindTooFar = rider.s - this.s > 120 || this.s - rider.s > 220;
      if ((this.funeral.done && Math.abs(rider.s - this.s) > 60) || behindTooFar || this.age > 100 || this.s >= c.length - 5) {
        out.push({ type: "end", kind: "funeral" });
        this.clear();
      }
    } else if (this.kind === "siren" && this.ambulance) {
      const amb = this.ambulance;
      // Pulling toward the kerb and easing off is how you give way here; the van then swings out around you.
      const yielding = rider.lateral > 1.4 || (rider.lateral > 0.6 && Math.abs(ctx.speed) < 3);
      const laneTarget = yielding ? Math.max(-2.6, rider.lateral - 2.6) : 0.6;
      this.ambLat += (laneTarget - this.ambLat) * Math.min(1, ctx.dt * 2.2);
      const lateral = this.ambLat;
      const res = judgeSiren(this.siren, { gap: rider.s - this.s, lateralDiff: rider.lateral - lateral, dt: ctx.dt });
      this.siren = res.judge;
      out.push(...res.out);
      // Held up: close to a tailgating gap behind the rider and sit there, siren blaring.
      const gap = rider.s - this.s;
      const target = res.blocking
        ? Math.max(0, Math.abs(ctx.speed) + (gap - SIREN.tailgate) * 0.8)
        : Math.max(16, Math.abs(ctx.speed) + 9);
      this.ambSpeed += (target - this.ambSpeed) * Math.min(1, ctx.dt * (res.blocking ? 4 : 1.2));
      this.s += this.ambSpeed * ctx.dt;
      const at = c.at(this.s, lateral);
      amb.position.set(at.x, 0, at.z);
      amb.rotation.y = at.yaw;
      this.sirenPhase += ctx.dt;
      const redOn = Math.floor(this.sirenPhase * 6) % 2 === 0;
      ((amb.getObjectByName("siren-red") as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(redOn ? 0xff2020 : 0x4a0808);
      ((amb.getObjectByName("siren-blue") as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(redOn ? 0x0a1640 : 0x2a6bff);
      if (ctx.mounted && Math.hypot(at.x - ctx.x, at.z - ctx.z) < 1.6 && !res.blocking) out.push({ type: "hit" });
      if ((this.siren.done && this.s - rider.s > 120) || this.s >= c.length - 5 || this.age > 60) {
        out.push({ type: "end", kind: "siren" });
        this.clear();
      }
    }
    return out;
  }

  /** Flashing light-bar glows for the GlowField. */
  sirenGlows(): { pos: THREE.Vector3; color: number }[] {
    if (!this.ambulance) return [];
    const redOn = Math.floor(this.sirenPhase * 6) % 2 === 0;
    const name = redOn ? "glow-siren-red" : "glow-siren-blue";
    const a = this.ambulance.getObjectByName(name);
    return a ? [{ pos: a.getWorldPosition(new THREE.Vector3()), color: redOn ? 0xff2020 : 0x2a6bff }] : [];
  }

  /** Distance from a point to the event, for audio levels. */
  distanceTo(x: number, z: number) {
    const p = this.procession ? this.procession.coffin.position : this.ambulance?.position;
    return p ? Math.hypot(p.x - x, p.z - z) : Infinity;
  }

  clear() {
    if (this.procession) { this.scene.remove(this.procession.group); disposeTree(this.procession.group); this.procession = null; }
    if (this.ambulance) { this.scene.remove(this.ambulance); disposeTree(this.ambulance); this.ambulance = null; }
    this.kind = null;
    this.corridor = null;
  }
}
