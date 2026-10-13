import * as THREE from "three";

/**
 * Layered Accra horizon: three rings of skyline silhouettes (low-rise blocks,
 * water tanks, palms, church spires, phone masts) at increasing distance, each
 * tinted closer to the haze colour. They follow the camera, so the city always
 * fades into depth instead of stopping at flat fog.
 */
const LAYERS = [
  // Inside the camera's 1200 m far plane, beyond the ~640 m of streamed city.
  { radius: 660, height: 40, haze: 0.3, seed: 3, density: 1 },
  { radius: 880, height: 56, haze: 0.48, seed: 11, density: 0.8 },
  { radius: 1120, height: 76, haze: 0.66, seed: 29, density: 0.6 },
];

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** White-on-transparent skyline strip; the material colour does the tinting. */
function skylineTexture(seed: number, density: number): THREE.CanvasTexture {
  const w = 4096, h = 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  const r = rand(seed);
  // Continuous ground line with gentle rises.
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 32) g.lineTo(x, h - 14 - Math.sin(x * 0.0021 + seed) * 8 - r() * 4);
  g.lineTo(w, h);
  g.fill();
  let x = 0;
  while (x < w) {
    const kind = r();
    if (kind < 0.55 * density) {
      // Compound / low-rise block, sometimes with a black poly tank on top.
      const bw = 30 + r() * 90, bh = 22 + r() * 60;
      g.fillRect(x, h - bh, bw, bh);
      if (r() < 0.4) g.fillRect(x + bw * 0.3, h - bh - 14, 12, 14);
      if (r() < 0.25) { g.fillRect(x + bw * 0.6, h - bh - 30, 3, 30); } // satellite / pole
      x += bw + r() * 12;
    } else if (kind < 0.75) {
      // Palm: thin trunk and a ragged crown.
      const th = 60 + r() * 70, tx = x + 6;
      g.fillRect(tx, h - th, 4, th);
      g.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.moveTo(tx + 2, h - th);
        g.quadraticCurveTo(tx + 2 + Math.cos(a) * 18, h - th - 10, tx + 2 + Math.cos(a) * 30, h - th + 8 + Math.sin(a) * 6);
      }
      g.lineWidth = 5; g.strokeStyle = "#fff"; g.stroke();
      x += 30 + r() * 40;
    } else if (kind < 0.82) {
      // Shade tree.
      const tr = 22 + r() * 26;
      g.beginPath(); g.arc(x + tr, h - 20 - tr, tr, 0, Math.PI * 2); g.fill();
      x += tr * 2 + 6;
    } else if (kind < 0.87) {
      // Church with a spire.
      const bw = 60 + r() * 40;
      g.fillRect(x, h - 50, bw, 50);
      g.beginPath(); g.moveTo(x + bw / 2 - 10, h - 50); g.lineTo(x + bw / 2, h - 120 - r() * 30); g.lineTo(x + bw / 2 + 10, h - 50); g.fill();
      x += bw + 10;
    } else if (kind < 0.9) {
      // Phone mast (lattice tower).
      const mh = 140 + r() * 60;
      g.beginPath(); g.moveTo(x, h - 16); g.lineTo(x + 7, h - mh); g.lineTo(x + 14, h - 16); g.fill();
      g.fillRect(x + 1, h - mh + 10, 12, 6);
      x += 40;
    } else {
      x += 20 + r() * 80; // gap
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Horizon {
  readonly group = new THREE.Group();
  private materials: THREE.MeshBasicMaterial[] = [];

  constructor(scene: THREE.Scene, mobile: boolean) {
    this.group.name = "accra-horizon";
    for (const layer of mobile ? LAYERS.slice(0, 2) : LAYERS) {
      const mat = new THREE.MeshBasicMaterial({
        map: skylineTexture(layer.seed, layer.density),
        transparent: true,
        alphaTest: 0.35,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      });
      // The texture is white: use it as alpha so the colour comes only from the material.
      mat.alphaMap = mat.map;
      mat.map = null;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(layer.radius, layer.radius, layer.height, 96, 1, true), mat);
      ring.position.y = layer.height / 2 - 6;
      ring.userData.haze = layer.haze;
      this.materials.push(mat);
      this.group.add(ring);
    }
    scene.add(this.group);
  }

  /** Follow the camera and tint each layer between a dark silhouette and the haze colour. */
  update(camera: THREE.Camera, haze: THREE.Color, night: number) {
    this.group.position.set(camera.position.x, 0, camera.position.z);
    const dark = _dark.setRGB(0.16, 0.13, 0.13).lerp(_night, night);
    this.group.children.forEach((ring, i) => {
      const k = (ring.userData.haze as number) + night * 0.05;
      this.materials[i].color.copy(dark).lerp(haze, k);
    });
  }

  dispose() {
    this.group.removeFromParent();
    for (const ring of this.group.children) (ring as THREE.Mesh).geometry.dispose();
    for (const m of this.materials) { m.alphaMap?.dispose(); m.dispose(); }
  }
}

const _dark = new THREE.Color();
const _night = new THREE.Color(0x05060f);
