import * as THREE from "three";

/**
 * Tropical downpours: short, heavy showers that roll in, slow the traffic and
 * grey out the sky, then clear. Schedule is pure; streaks follow the camera.
 */
export type WeatherEvent = "start" | "stop" | null;

export class RainSchedule {
  /** 0..1, eased toward the target so showers build and fade. */
  intensity = 0;
  raining = false;
  private nextAt: number;
  private endsAt = 0;

  constructor(private random: () => number = Math.random, firstAt = 70) {
    this.nextAt = firstAt + random() * 40;
  }

  update(now: number, dt: number): WeatherEvent {
    let event: WeatherEvent = null;
    if (!this.raining && now >= this.nextAt) {
      this.raining = true;
      this.endsAt = now + 45 + this.random() * 40;
      event = "start";
    } else if (this.raining && now >= this.endsAt) {
      this.raining = false;
      this.nextAt = now + 160 + this.random() * 160;
      event = "stop";
    }
    const target = this.raining ? 1 : 0;
    this.intensity += (target - this.intensity) * Math.min(1, dt * (this.raining ? 0.35 : 0.22));
    if (this.intensity < 0.002) this.intensity = 0;
    return event;
  }

  reset(now: number) {
    this.raining = false;
    this.intensity = 0;
    this.nextAt = now + 70 + this.random() * 40;
  }
}

const BOX = { w: 70, h: 26, d: 70 };

export class RainStreaks {
  readonly mesh: THREE.LineSegments;
  private positions: Float32Array;
  private count: number;

  constructor(scene: THREE.Scene, mobile: boolean) {
    this.count = mobile ? 900 : 2200;
    this.positions = new Float32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) this.place(i, Math.random() * BOX.h);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbcc8d6, transparent: true, opacity: 0, depthWrite: false }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  private place(i: number, y: number) {
    const x = (Math.random() - 0.5) * BOX.w, z = (Math.random() - 0.5) * BOX.d;
    const p = this.positions, o = i * 6;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = x + 0.06; p[o + 4] = y - 0.9; p[o + 5] = z + 0.04;
  }

  update(dt: number, intensity: number, center: THREE.Vector3) {
    this.mesh.visible = intensity > 0.01;
    if (!this.mesh.visible) return;
    (this.mesh.material as THREE.LineBasicMaterial).opacity = 0.55 * intensity;
    this.mesh.position.set(center.x, center.y - BOX.h / 2, center.z);
    const fall = 24 * dt, p = this.positions;
    const active = Math.floor(this.count * Math.max(0.15, intensity));
    this.mesh.geometry.setDrawRange(0, active * 2);
    for (let i = 0; i < active; i++) {
      const o = i * 6;
      p[o + 1] -= fall; p[o + 4] -= fall;
      if (p[o + 4] < 0) this.place(i, BOX.h);
    }
    (this.mesh.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
