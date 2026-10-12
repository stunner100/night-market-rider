import * as THREE from "three";

/**
 * Procedural tropical sky: zenith → horizon gradient, sun disc with glow,
 * drifting cumulus and night stars. Colours are driven by `setTime(night)`
 * so the sky, fog and lights stay in step through the shift.
 */
const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const fragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // Gradient: denser warm haze near the horizon, deep colour overhead.
  float up = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, up);
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));

  // Sun disc + wide atmospheric glow.
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.32 + pow(sd, 64.0) * 0.55) * (1.0 - uNight * 0.6);
  col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 2.2 * (1.0 - uNight);

  // Clouds projected onto a flat layer above the city.
  if (h > 0.015) {
    vec2 uv = d.xz / (h + 0.08) * 1.4 + vec2(uTime * 0.006, uTime * 0.0025);
    float c = fbm(uv);
    float cover = smoothstep(0.52, 0.78, c) * smoothstep(0.015, 0.2, h);
    vec3 lit = mix(vec3(1.0, 0.98, 0.95), uSunColor * 1.1 + 0.25, 0.35 + uNight * 0.4);
    vec3 cloudCol = mix(lit, uHorizon * 0.75, smoothstep(0.6, 0.95, c) * 0.5);
    cloudCol = mix(cloudCol, vec3(0.07, 0.08, 0.14), smoothstep(0.6, 1.0, uNight));
    col = mix(col, cloudCol, cover * 0.85);
  }

  // Stars fade in after dusk.
  if (uNight > 0.55 && h > 0.05) {
    vec2 sp = d.xz / (h + 0.3) * 160.0;
    float s = step(0.9965, hash(floor(sp)));
    col += vec3(s) * smoothstep(0.55, 0.95, uNight) * smoothstep(0.05, 0.3, h) * 0.9;
  }

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

// Palette keyframes: [night, zenith, horizon, sun]
const KEYS: [number, number, number, number][] = [
  [0.0, 0x2f7fd0, 0xbfe0f2, 0xfff1d6],
  [0.35, 0x3b6fb8, 0xf6c793, 0xffc884],
  [0.6, 0x3a3f7a, 0xff8f5a, 0xff7a3d],
  [0.8, 0x10153a, 0x6a3b3a, 0xc45a3a],
  // Accra after dark: deep navy overhead, sodium-orange city glow on the horizon.
  [1.0, 0x04061a, 0x3d2620, 0x6a4a6a],
];
const _a = new THREE.Color(), _b = new THREE.Color();

function samplePalette(night: number, index: 1 | 2 | 3, out: THREE.Color) {
  let i = 0;
  while (i < KEYS.length - 2 && night > KEYS[i + 1][0]) i++;
  const [n0] = KEYS[i], [n1] = KEYS[i + 1];
  const k = THREE.MathUtils.clamp((night - n0) / (n1 - n0), 0, 1);
  return out.copy(_a.setHex(KEYS[i][index])).lerp(_b.setHex(KEYS[i + 1][index]), k);
}

export class Sky {
  mesh: THREE.Mesh;
  horizon = new THREE.Color();
  sunColor = new THREE.Color();
  private uniforms: Record<string, THREE.IUniform>;

  constructor() {
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color(0x8a7a66) },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3) },
      uNight: { value: 0 },
      uTime: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    this.mesh.name = "sky";
  }

  /** `sunDir` is world-space direction toward the sun. */
  setTime(night: number, sunDir: THREE.Vector3, time: number) {
    const u = this.uniforms;
    samplePalette(night, 1, u.uZenith.value);
    samplePalette(night, 2, this.horizon);
    samplePalette(night, 3, this.sunColor);
    u.uHorizon.value.copy(this.horizon);
    u.uSunColor.value.copy(this.sunColor);
    u.uGround.value.copy(this.horizon).multiplyScalar(0.55);
    u.uSunDir.value.copy(sunDir).normalize();
    u.uNight.value = night;
    u.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
