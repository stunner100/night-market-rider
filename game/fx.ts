import * as THREE from "three";

/**
 * Cheap visual effects, each a single draw call:
 * - ParticleField: pooled soft billboards for dust, exhaust, steam and sparks
 *   (replaces one sphere mesh + material per puff).
 * - GlowField: additive halos for vehicle head/tail lights at night.
 * - SpeedStreaks: air streaks rushing past the camera at speed.
 */

const pointVertex = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // World-size billboards: pixels = size * (viewport height / 2) * cot(fov/2) / depth.
  gl_PointSize = aSize * uScale * projectionMatrix[1][1] / max(0.1, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
}`;

const pointFragment = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
uniform float uSoftness;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = pow(1.0 - d, uSoftness) * vAlpha;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}`;

function pointMaterial(additive: boolean, softness: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, uSoftness: { value: softness } },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    toneMapped: false,
    fog: false,
  });
}

function pointGeometry(count: number) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  return g;
}

export interface PuffOptions {
  /** Starting world size in metres. */
  size?: number;
  /** Growth multiplier over the particle's life. */
  grow?: number;
  life?: number;
  rise?: number;
  alpha?: number;
}

interface Puff {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number; alpha: number;
  r: number; g: number; b: number;
}

const _c = new THREE.Color();
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class ParticleField {
  readonly points: THREE.Points;
  private puffs: Puff[] = [];

  constructor(private capacity: number, additive = false, softness = 1.6) {
    this.points = new THREE.Points(pointGeometry(capacity), pointMaterial(additive, softness));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  spawn(x: number, y: number, z: number, color: number, n = 1, spread = 1, o: PuffOptions = {}) {
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      // Oldest puff makes way when the pool is full.
      if (this.puffs.length >= this.capacity) this.puffs.shift();
      this.puffs.push({
        x: x + rand(-0.25, 0.25), y, z: z + rand(-0.25, 0.25),
        vx: rand(-spread, spread), vy: rand(0.4, 1) * (o.rise ?? 1.6), vz: rand(-spread, spread),
        life: 0, max: (o.life ?? 0.8) * rand(0.7, 1.2),
        size: (o.size ?? 0.45) * rand(0.75, 1.25), grow: o.grow ?? 2.4, alpha: o.alpha ?? 0.45,
        r: _c.r, g: _c.g, b: _c.b,
      });
    }
  }

  update(dt: number) {
    const geo = this.points.geometry;
    const pos = geo.attributes.position.array as Float32Array;
    const size = geo.attributes.aSize.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    const col = geo.attributes.aColor.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const drag = 1 - Math.min(1, dt * 2.2);
      p.vx *= drag; p.vz *= drag; p.vy *= 1 - Math.min(1, dt * 1.2);
      const k = p.life / p.max;
      this.puffs[n] = p;
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      size[n] = p.size * (1 + (p.grow - 1) * k);
      // Fade in quickly, out slowly.
      alpha[n] = p.alpha * Math.min(1, k * 8) * (1 - k) * (1 - k);
      col[n * 3] = p.r; col[n * 3 + 1] = p.g; col[n * 3 + 2] = p.b;
      n++;
    }
    this.puffs.length = n;
    geo.setDrawRange(0, n);
    if (n) {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
    }
  }

  setViewport(heightPx: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx / 2;
  }

  clear() {
    this.puffs.length = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Additive halos for lamps; positions are written fresh every frame. */
export class GlowField {
  readonly points: THREE.Points;
  private n = 0;

  constructor(private capacity: number) {
    this.points = new THREE.Points(pointGeometry(capacity), pointMaterial(true, 2.2));
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
  }

  begin() { this.n = 0; }

  add(p: THREE.Vector3, color: number, size: number, alpha: number) {
    if (this.n >= this.capacity) return;
    const geo = this.points.geometry;
    const i = this.n++;
    _c.setHex(color);
    (geo.attributes.position.array as Float32Array).set([p.x, p.y, p.z], i * 3);
    (geo.attributes.aColor.array as Float32Array).set([_c.r, _c.g, _c.b], i * 3);
    (geo.attributes.aSize.array as Float32Array)[i] = size;
    (geo.attributes.aAlpha.array as Float32Array)[i] = alpha;
  }

  end() {
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.n);
    if (!this.n) return;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  setViewport(heightPx: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx / 2;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

const STREAKS = 90;

/** Thin air streaks in a tube around the camera that rush past at speed. */
export class SpeedStreaks {
  readonly lines: THREE.LineSegments;
  private seeds = new Float32Array(STREAKS * 4); // angle, radius, z, length
  private material: THREE.LineBasicMaterial;

  constructor() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    this.lines = new THREE.LineSegments(geo, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 7;
    this.lines.visible = false;
    for (let i = 0; i < STREAKS; i++) this.reseed(i, -Math.random() * 30);
  }

  private reseed(i: number, z: number) {
    // Keep the centre of the view clear: streaks live at the edges.
    this.seeds[i * 4] = Math.random() * Math.PI * 2;
    this.seeds[i * 4 + 1] = 2.2 + Math.random() * 3.5;
    this.seeds[i * 4 + 2] = z;
    this.seeds[i * 4 + 3] = 0.8 + Math.random() * 1.8;
  }

  /** `intensity` 0..1; streaks are laid out in camera space so they always frame the view. */
  update(dt: number, intensity: number, speed: number, camera: THREE.Camera) {
    this.material.opacity += (intensity * 0.32 - this.material.opacity) * Math.min(1, dt * 4);
    this.lines.visible = this.material.opacity > 0.01;
    if (!this.lines.visible) return;
    this.lines.position.copy(camera.position);
    this.lines.quaternion.copy(camera.quaternion);
    const pos = this.lines.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < STREAKS; i++) {
      let z = this.seeds[i * 4 + 2] + speed * 1.4 * dt;
      if (z > 1) { this.reseed(i, -30); z = -30; }
      this.seeds[i * 4 + 2] = z;
      const a = this.seeds[i * 4], r = this.seeds[i * 4 + 1], len = this.seeds[i * 4 + 3] * (0.5 + intensity);
      const x = Math.cos(a) * r * 1.6, y = Math.sin(a) * r * 0.8;
      pos.set([x, y, z, x, y, z - len], i * 6);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }

  dispose() {
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}

const MOTES = 180;
const MOTE_BOX = 26;

/** Harmattan dust hanging in the daylight air around the camera. */
export class DustMotes {
  readonly points: THREE.Points;
  private seeds = new Float32Array(MOTES * 4);

  constructor() {
    this.points = new THREE.Points(pointGeometry(MOTES), pointMaterial(false, 1.4));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    const geo = this.points.geometry;
    const col = geo.attributes.aColor.array as Float32Array;
    const size = geo.attributes.aSize.array as Float32Array;
    _c.setHex(0xf3dcb4);
    for (let i = 0; i < MOTES; i++) {
      this.seeds.set([Math.random(), Math.random(), Math.random(), Math.random() * 10], i * 4);
      col.set([_c.r, _c.g, _c.b], i * 3);
      size[i] = 0.035 + Math.random() * 0.05;
    }
    geo.setDrawRange(0, MOTES);
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }

  /** `amount` 0..1: full in dry daylight, none at night or in rain. */
  update(time: number, amount: number, camera: THREE.Camera) {
    this.points.visible = amount > 0.02;
    if (!this.points.visible) return;
    const geo = this.points.geometry;
    const pos = geo.attributes.position.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let i = 0; i < MOTES; i++) {
      const sx = this.seeds[i * 4], sy = this.seeds[i * 4 + 1], sz = this.seeds[i * 4 + 2], ph = this.seeds[i * 4 + 3];
      // Slow drift with the breeze, wrapped into a box that follows the camera.
      const wrap = (v: number, c: number) => c + ((((v - c) % MOTE_BOX) + MOTE_BOX * 1.5) % MOTE_BOX) - MOTE_BOX / 2;
      pos[i * 3] = wrap(sx * MOTE_BOX + time * 0.45 + Math.sin(time * 0.7 + ph) * 0.4, cx);
      pos[i * 3 + 1] = cy - 2.5 + ((sy * 7 + Math.sin(time * 0.5 + ph) * 0.3) % 7);
      pos[i * 3 + 2] = wrap(sz * MOTE_BOX + time * 0.2 + Math.cos(time * 0.6 + ph) * 0.4, cz);
      alpha[i] = amount * (0.35 + 0.25 * Math.sin(time * 1.7 + ph));
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  }

  setViewport(heightPx: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx / 2;
  }

  dispose() {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
