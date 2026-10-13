/**
 * The garage: bikes Accra delivery riders actually ride, each with a trade-off.
 * Stats are multipliers on the base handling model; the first bike is free.
 */
export type BikeId = "ace" | "haojue" | "scooter" | "apsonic";

export interface Bike {
  id: BikeId;
  name: string;
  tagline: string;
  price: number;
  /** Top speed multiplier. */
  speed: number;
  /** Acceleration multiplier. */
  accel: number;
  /** Turn rate multiplier. */
  handling: number;
  /** Food damage multiplier (lower is kinder to the food). */
  care: number;
  /** Fuel use multiplier (lower goes further). */
  economy: number;
  /** Body paint and box colour. */
  color: number;
  trim: number;
}

export const BIKES: Bike[] = [
  {
    id: "ace", name: "Honda Ace 125", tagline: "Every rider's first bike. Cheap to run, never dies.",
    price: 0, speed: 0.94, accel: 0.92, handling: 1, care: 1, economy: 0.8, color: 0xc92a2a, trim: 0x20252b,
  },
  {
    id: "haojue", name: "Haojue Express 150", tagline: "The Night Market standard. Balanced, reliable, quick off the line.",
    price: 150, speed: 1, accel: 1.06, handling: 1.05, care: 0.95, economy: 1, color: 0x1856d8, trim: 0x20252b,
  },
  {
    id: "scooter", name: "Box Scooter 110", tagline: "Slow, but the insulated box keeps waakye hot and jollof in one piece.",
    price: 250, speed: 0.86, accel: 0.9, handling: 1.12, care: 0.6, economy: 0.7, color: 0xf2e35c, trim: 0x2b2b2b,
  },
  {
    id: "apsonic", name: "Apsonic Sport 200", tagline: "Fastest thing on Okponglo road. Thirsty, and the food go shake.",
    price: 400, speed: 1.14, accel: 1.18, handling: 0.94, care: 1.2, economy: 1.35, color: 0x1d1f22, trim: 0xe8590c,
  },
];

export const bikeFor = (id: BikeId | null | undefined): Bike => BIKES.find(b => b.id === id) ?? BIKES[0];

/** 1–5 bars for the garage, relative to the roster. */
export function statBars(b: Bike) {
  const bar = (v: number, lo: number, hi: number) => Math.max(1, Math.min(5, Math.round(1 + ((v - lo) / (hi - lo)) * 4)));
  return {
    Speed: bar(b.speed, 0.86, 1.14),
    Acceleration: bar(b.accel, 0.9, 1.18),
    Handling: bar(b.handling, 0.94, 1.12),
    "Food care": bar(2 - b.care, 0.8, 1.4),
    "Fuel economy": bar(2 - b.economy, 0.65, 1.3),
  };
}

// ---------- drift and slipstream (pure, engine supplies the world) ----------

export interface RideFeel {
  /** Seconds into the current drift (0 when not drifting). */
  drift: number;
  /** Extra visual yaw of the bike while it slides. */
  slide: number;
  /** 0..1 slipstream build-up behind a vehicle. */
  slip: number;
}

export const initialFeel = (): RideFeel => ({ drift: 0, slide: 0, slip: 0 });

export const DRIFT = { minSpeed: 12, turnBoost: 1.75, decel: 3.5, minForBonus: 0.7, maxBonus: 6 } as const;

/**
 * Drift: hold the drift key while steering hard at speed. The bike turns tighter,
 * slides its tail out and bleeds speed; letting go after a decent slide gives a kick.
 * Returns the new state and any speed bonus earned on release.
 */
export function stepDrift(f: RideFeel, input: { drift: boolean; steer: number; speed: number }, dt: number): { feel: RideFeel; bonus: number } {
  const active = input.drift && Math.abs(input.steer) > 0.6 && input.speed > DRIFT.minSpeed;
  if (active) {
    const slide = f.slide + ((input.steer > 0 ? 0.45 : -0.45) - f.slide) * Math.min(1, dt * 6);
    return { feel: { ...f, drift: f.drift + dt, slide }, bonus: 0 };
  }
  const bonus = f.drift >= DRIFT.minForBonus ? Math.min(DRIFT.maxBonus, f.drift * 3) : 0;
  return { feel: { ...f, drift: 0, slide: f.slide * Math.max(0, 1 - dt * 8) }, bonus };
}

export interface Vehicle { x: number; z: number; yaw: number }

/** Is the rider tucked in behind a vehicle going the same way? */
export function inSlipstream(rider: { x: number; z: number; heading: number; speed: number }, v: Vehicle): boolean {
  if (rider.speed < 8) return false;
  const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
  const rx = rider.x - v.x, rz = rider.z - v.z;
  const behind = -(rx * fx + rz * fz);
  const lateral = Math.abs(rx * fz - rz * fx);
  let dYaw = Math.abs(rider.heading - v.yaw) % (Math.PI * 2);
  if (dYaw > Math.PI) dYaw = Math.PI * 2 - dYaw;
  return behind > 3 && behind < 16 && lateral < 1.8 && dYaw < 0.45;
}

/** Slipstream builds over ~0.7 s behind a vehicle and fades over ~0.5 s. */
export function stepSlip(f: RideFeel, tucked: boolean, dt: number): RideFeel {
  return { ...f, slip: Math.max(0, Math.min(1, f.slip + (tucked ? dt * 1.4 : -dt * 2))) };
}

export const SLIP = { topSpeed: 0.14, fuelSaving: 0.4 } as const;
