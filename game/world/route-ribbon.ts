import * as THREE from "three";
import type { WorldPoint } from "./types";

const MAX_POINTS = 160;
const WIDTH = 1.7;
const ARROW_SPACING = 3.2; // metres per chevron
const AHEAD = 260; // metres of route drawn in front of the rider

function chevronTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  // Soft band underneath so the route reads even between chevrons.
  g.fillStyle = "rgba(255,255,255,0.32)";
  g.fillRect(6, 0, 52, 64);
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.fillRect(4, 0, 4, 64);
  g.fillRect(56, 0, 4, 64);
  // Chevron pointing toward +V (direction of travel).
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(12, 18);
  g.lineTo(32, 42);
  g.lineTo(52, 18);
  g.lineTo(52, 30);
  g.lineTo(32, 54);
  g.lineTo(12, 30);
  g.closePath();
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/**
 * GPS route painted on the road: a flowing chevron strip from the rider to the
 * next destination, fading in at the bike and out in the distance.
 */
export class RouteRibbon {
  readonly mesh: THREE.Mesh;
  private positions = new Float32Array(MAX_POINTS * 2 * 3);
  private uvs = new Float32Array(MAX_POINTS * 2 * 2);
  private colors = new Float32Array(MAX_POINTS * 2 * 4);
  private material: THREE.MeshBasicMaterial;
  private texture = chevronTexture();
  private pts: { x: number; z: number; d: number }[] = [];

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      index.push(a, c, b, b, c, d);
    }
    geometry.setIndex(index);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: 0xf2e35c,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
      fog: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = "route-ribbon";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  setColor(hex: number) {
    this.material.color.setHex(hex);
  }

  /** Rebuild from the route, starting at the rider's projection onto it. */
  update(route: WorldPoint[], x: number, z: number, time: number) {
    if (route.length < 2) {
      this.mesh.visible = false;
      return;
    }
    // Nearest point on the route to the rider.
    let bestI = 0, bestT = 0, bestD = Infinity;
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const abx = b.x - a.x, abz = b.z - a.z;
      const len2 = abx * abx + abz * abz;
      const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
      const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
      if (d < bestD) { bestD = d; bestI = i; bestT = t; }
    }
    const pts = this.pts;
    pts.length = 0;
    const a0 = route[bestI], b0 = route[bestI + 1];
    pts.push({ x: a0.x + (b0.x - a0.x) * bestT, z: a0.z + (b0.z - a0.z) * bestT, d: 0 });
    let walked = 0;
    for (let i = bestI + 1; i < route.length && pts.length < MAX_POINTS; i++) {
      const prev = pts[pts.length - 1];
      const p = route[i];
      const step = Math.hypot(p.x - prev.x, p.z - prev.z);
      if (step < 0.25) continue;
      if (walked + step > AHEAD) {
        const u = (AHEAD - walked) / step;
        pts.push({ x: prev.x + (p.x - prev.x) * u, z: prev.z + (p.z - prev.z) * u, d: AHEAD });
        walked = AHEAD;
        break;
      }
      walked += step;
      pts.push({ x: p.x, z: p.z, d: walked });
    }
    if (pts.length < 2) {
      this.mesh.visible = false;
      return;
    }

    const flow = (time * 1.6) % 1; // chevrons slide toward the destination
    const total = walked;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let tx = next.x - prev.x, tz = next.z - prev.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      // Mitre: widen at corners so the strip keeps a constant width.
      let miter = 1;
      if (i > 0 && i < pts.length - 1) {
        const ix = p.x - prev.x, iz = p.z - prev.z, il = Math.hypot(ix, iz) || 1;
        miter = 1 / Math.max(0.5, (ix / il) * tx + (iz / il) * tz);
      }
      const nx = -tz * WIDTH * 0.5 * miter, nz = tx * WIDTH * 0.5 * miter;
      const o = i * 6;
      this.positions[o] = p.x + nx; this.positions[o + 1] = 0.11; this.positions[o + 2] = p.z + nz;
      this.positions[o + 3] = p.x - nx; this.positions[o + 4] = 0.11; this.positions[o + 5] = p.z - nz;
      const v = -(p.d / ARROW_SPACING) + flow;
      const u = i * 4;
      this.uvs[u] = 0; this.uvs[u + 1] = v; this.uvs[u + 2] = 1; this.uvs[u + 3] = v;
      const fadeIn = Math.min(1, p.d / 4);
      const fadeOut = Math.min(1, (total - p.d) / 30 + 0.15, (AHEAD - p.d) / 60);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.92;
      const c = i * 8;
      for (const k of [0, 4]) {
        this.colors[c + k] = 1; this.colors[c + k + 1] = 1; this.colors[c + k + 2] = 1; this.colors[c + k + 3] = alpha;
      }
    }
    const geometry = this.mesh.geometry;
    geometry.setDrawRange(0, (pts.length - 1) * 6);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.uv.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = true;
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/** Tall light column over the destination, visible above rooftops from afar. */
export class DestinationBeacon {
  readonly group = new THREE.Group();
  private material: THREE.ShaderMaterial;
  private ring: THREE.Mesh;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xf2e35c) }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){
          float fade = pow(1.0 - vUv.y, 1.6);
          float pulse = 0.75 + 0.25 * sin(uTime * 3.0 - vUv.y * 18.0);
          gl_FragColor = vec4(uColor, fade * pulse * 0.55);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
    const column = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 70, 20, 1, true), this.material);
    column.position.y = 35;
    column.renderOrder = 4;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.7, 40),
      new THREE.MeshBasicMaterial({ color: 0xf2e35c, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.13;
    this.group.add(column, this.ring);
    this.group.name = "destination-beacon";
    this.group.visible = false;
  }

  show(x: number, z: number, color: number, time: number, riderDistance: number) {
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.material.uniforms.uColor.value.setHex(color);
    this.material.uniforms.uTime.value = time;
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(color);
    const s = 1 + Math.sin(time * 4) * 0.08;
    this.ring.scale.set(s, s, s);
    // Thin the column up close so it doesn't wash out the interaction view.
    this.group.children[0].scale.set(riderDistance < 25 ? 0.6 : 1, 1, riderDistance < 25 ? 0.6 : 1);
  }

  hide() {
    this.group.visible = false;
  }

  dispose() {
    this.group.traverse(o => {
      if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
    });
  }
}
