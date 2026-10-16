import * as THREE from "three";

/**
 * Ink outline pass. The scene renders once into an off-screen target (MSAA +
 * depth/stencil), then one full-screen pass draws ink where depth jumps,
 * fading with distance so the city reads as a deliberate illustrated style
 * instead of plain boxes.
 *
 * Tone mapping and sRGB output normally only happen when drawing to the
 * screen. Flagging the target as an XR target makes three apply them while
 * rendering into it (storage stays plain RGBA8), so the composite can copy
 * the image straight out and the existing grade is untouched.
 */

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const fragment = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 inkColor;
uniform float inkStrength;
uniform float fadeNear;
uniform float fadeFar;
varying vec2 vUv;

float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}

void main() {
  vec4 color = texture2D(tColor, vUv);
  float z = viewZ(vUv);
  // Ink this pixel only if a neighbour is clearly farther: the line lands on
  // the near object's edge, never on the sky or the far side.
  float zl = viewZ(vUv - vec2(texel.x, 0.0));
  float zr = viewZ(vUv + vec2(texel.x, 0.0));
  float zu = viewZ(vUv + vec2(0.0, texel.y));
  float zd = viewZ(vUv - vec2(0.0, texel.y));
  float jump = max(max(zl, zr), max(zu, zd)) - z;
  float edge = smoothstep(0.012, 0.05, jump / max(z, 0.5));
  float fade = 1.0 - smoothstep(fadeNear, fadeFar, z);
  float ink = edge * fade * inkStrength;
  gl_FragColor = vec4(mix(color.rgb, inkColor, ink), 1.0);
}`;

export class InkPass {
  private target: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private quadScene = new THREE.Scene();
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  constructor(samples: number) {
    const depth = new THREE.DepthTexture(1, 1);
    depth.format = THREE.DepthStencilFormat;
    depth.type = THREE.UnsignedInt248Type;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      samples,
      depthBuffer: true,
      stencilBuffer: true,
      depthTexture: depth,
      type: THREE.UnsignedByteType,
    });
    // Render the final, graded image into the target (see file comment).
    (this.target as unknown as { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.target.texture.internalFormat = "RGBA8";
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depth },
        texel: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        inkColor: { value: new THREE.Color(0x1b1410) },
        inkStrength: { value: 0.88 },
        fadeNear: { value: 55 },
        fadeFar: { value: 240 },
      },
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Size in drawing-buffer pixels. */
  setSize(width: number, height: number) {
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    this.target.setSize(w, h);
    // Lines a little thicker on high-density screens.
    const px = Math.max(1, Math.round(h / 650));
    this.material.uniforms.texel.value.set(px / w, px / h);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * See-through rider: visible rider pixels mark the stencil buffer; flat ghost
 * copies draw only where the rider is hidden by the world (depth Greater) and
 * not covered by the rider itself (stencil != 1), so overlapping parts of the
 * rider never x-ray through each other.
 */
export function addSilhouette(root: THREE.Object3D, color: number) {
  const ghost = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.KeepStencilOp,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    toneMapped: false,
    fog: false,
  });
  const marked = new Set<THREE.Material>();
  const ghosts: THREE.Mesh[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse(o => { if (o instanceof THREE.Mesh && !(o.material as THREE.Material).transparent) meshes.push(o); });
  for (const mesh of meshes) {
    // Draw the rider after the world: three sorts opaque meshes by program
    // before depth, so without this the rider could stamp the stencil before
    // a trotro in front of it was drawn, and its ghost would never show.
    mesh.renderOrder = Math.max(mesh.renderOrder, 10);
    // Visible rider pixels write stencil = 1.
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (marked.has(m)) continue;
      marked.add(m);
      m.stencilWrite = true;
      m.stencilRef = 1;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
    // Ghosts only for parts big enough to read as a silhouette.
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if ((g.boundingSphere?.radius ?? 0) < 0.12) continue;
    const copy = new THREE.Mesh(g, ghost);
    copy.name = "rider-ghost";
    copy.renderOrder = 20; // after the world and the rider itself
    copy.frustumCulled = false;
    copy.visible = false; // the engine shows ghosts only while the rider is blocked
    mesh.add(copy);
    ghosts.push(copy);
  }
  return {
    setVisible(v: boolean) { for (const c of ghosts) c.visible = v; },
    dispose() {
      for (const c of ghosts) c.parent?.remove(c);
      ghost.dispose();
    },
  };
}
