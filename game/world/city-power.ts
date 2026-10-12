/**
 * Dumsor: ECG load-shedding that cuts the grid in one part of the city after
 * dark. Pure scheduling; the runtime dims windows and streetlights in the area.
 */
export interface Outage {
  x: number;
  z: number;
  radius: number;
  /** Shift clock (s) when the light comes back. */
  endsAt: number;
}

export type PowerEvent = "off" | "on" | null;

export class CityPower {
  outage: Outage | null = null;
  private nextAt = -1;

  constructor(private random: () => number = Math.random) {}

  /** Advance the schedule. Outages only start after dark and never stack. */
  update(now: number, night: number, rider: { x: number; z: number }): PowerEvent {
    if (this.outage) {
      if (now < this.outage.endsAt) return null;
      this.outage = null;
      this.nextAt = now + 110 + this.random() * 90;
      return "on";
    }
    if (night < 0.6) { this.nextAt = -1; return null; }
    // First cut comes soon after dark so night shifts feel it.
    if (this.nextAt < 0) this.nextAt = now + 25 + this.random() * 20;
    if (now < this.nextAt) return null;
    const angle = this.random() * Math.PI * 2;
    const offset = this.random() * 90;
    this.outage = {
      x: rider.x + Math.cos(angle) * offset,
      z: rider.z + Math.sin(angle) * offset,
      radius: 300 + this.random() * 120,
      endsAt: now + 70 + this.random() * 40,
    };
    return "off";
  }

  powered(x: number, z: number): boolean {
    const o = this.outage;
    return !o || Math.hypot(x - o.x, z - o.z) > o.radius;
  }

  reset() {
    this.outage = null;
    this.nextAt = -1;
  }
}
