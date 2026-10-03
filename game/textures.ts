import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

function roundedRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  g.beginPath();
  if (typeof g.roundRect === "function") {
    g.roundRect(x, y, w, h, r);
    return;
  }
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

export function textTexture(text: string, opts: { bg?: string; fg?: string; w?: number; h?: number; font?: number; border?: string } = {}) {
  const key = JSON.stringify([text, opts]);
  const hit = cache.get(key);
  if (hit) return hit;
  const w = opts.w ?? 512, h = opts.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#111";
  const r = 24;
  roundedRectPath(g, 2, 2, w - 4, h - 4, r);
  g.fill();
  if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = 6; roundedRectPath(g, 6, 6, w - 12, h - 12, r - 4); g.stroke(); }
  g.fillStyle = opts.fg ?? "#fff";
  g.font = `800 ${opts.font ?? 56}px system-ui, sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

export function signMesh(text: string, wM: number, bg: string, fg = "#fff") {
  const tex = textTexture(text, { bg, fg, border: "rgba(255,255,255,0.5)" });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(wM, wM / 4),
    new THREE.MeshBasicMaterial({ map: tex, transparent: false, side: THREE.DoubleSide })
  );
  return m;
}

let brandTex: THREE.Texture | null = null;
export function nightMarketTexture(): THREE.Texture | null {
  if (brandTex) return brandTex;
  const loader = new THREE.TextureLoader();
  const t = loader.load("/brand/night-market-logo.png", (tex) => { tex.colorSpace = THREE.SRGBColorSpace; });
  brandTex = t;
  return brandTex;
}

export function ghanaFlagTexture() {
  const key = "ghana-flag";
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 84;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ce1126"; g.fillRect(0, 0, 128, 28);
  g.fillStyle = "#fcd116"; g.fillRect(0, 28, 128, 28);
  g.fillStyle = "#006b3f"; g.fillRect(0, 56, 128, 28);
  g.fillStyle = "#111"; g.font = "28px serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("★", 64, 43);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Photorealistic procedural textures
// ---------------------------------------------------------------------------

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Asphalt road surface with cracks, patches, and wear */
export function asphaltTexture(): THREE.CanvasTexture {
  const key = "asphalt";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 512);
  // Base dark asphalt
  g.fillStyle = "#2a2a2e";
  g.fillRect(0, 0, 512, 512);
  // Noise speckle for asphalt aggregate
  for (let i = 0; i < 12000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const v = 30 + Math.random() * 40;
    g.fillStyle = `rgb(${v},${v},${v + 4})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
  // Cracks
  g.strokeStyle = "#1a1a1c";
  g.lineWidth = 1;
  for (let i = 0; i < 15; i++) {
    g.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (Math.random() - 0.5) * 80;
      y += (Math.random() - 0.5) * 80;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Tar patches
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * 400 + 56, y = Math.random() * 400 + 56;
    g.fillStyle = "rgba(18,18,20,0.6)";
    g.beginPath();
    g.ellipse(x, y, 30 + Math.random() * 40, 20 + Math.random() * 30, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  // Oil stains
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * 400 + 56, y = Math.random() * 400 + 56;
    const grd = g.createRadialGradient(x, y, 0, x, y, 20 + Math.random() * 30);
    grd.addColorStop(0, "rgba(15,12,18,0.5)");
    grd.addColorStop(1, "transparent");
    g.fillStyle = grd;
    g.fillRect(x - 50, y - 50, 100, 100);
  }
  const t = toTexture(c, 4);
  cache.set(key, t);
  return t;
}

/** Concrete sidewalk / gutter surface */
export function concreteTexture(): THREE.CanvasTexture {
  const key = "concrete";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = "#8a8a8a";
  g.fillRect(0, 0, 256, 256);
  // Aggregate noise
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    const v = 110 + Math.random() * 60;
    g.fillStyle = `rgb(${v},${v},${v - 5})`;
    g.fillRect(x, y, 1, 1);
  }
  // Subtle cracks
  g.strokeStyle = "#777";
  g.lineWidth = 0.5;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    x += (Math.random() - 0.5) * 60;
    y += (Math.random() - 0.5) * 60;
    g.lineTo(x, y);
    g.stroke();
  }
  const t = toTexture(c, 2);
  cache.set(key, t);
  return t;
}

/** Grass terrain texture */
export function grassTexture(): THREE.CanvasTexture {
  const key = "grass";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 512);
  // Base green
  g.fillStyle = "#4a7c3a";
  g.fillRect(0, 0, 512, 512);
  // Grass blade clusters
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const hue = 80 + Math.random() * 40;
    const sat = 30 + Math.random() * 30;
    const lig = 22 + Math.random() * 18;
    g.fillStyle = `hsl(${hue},${sat}%,${lig}%)`;
    g.fillRect(x, y, 2, 3);
  }
  // Dirt patches
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * 400 + 56, y = Math.random() * 400 + 56;
    const grd = g.createRadialGradient(x, y, 0, x, y, 15 + Math.random() * 30);
    grd.addColorStop(0, "rgba(120,90,50,0.4)");
    grd.addColorStop(1, "transparent");
    g.fillStyle = grd;
    g.fillRect(x - 45, y - 45, 90, 90);
  }
  const t = toTexture(c, 8);
  cache.set(key, t);
  return t;
}

/** Building facade texture with windows */
export function buildingTexture(baseColor: string, windowRows = 4, windowCols = 6): THREE.CanvasTexture {
  const key = `building-${baseColor}-${windowRows}-${windowCols}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 512, 512);
  // Weathering
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const v = Math.random() * 30 - 15;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 100})`;
    g.fillRect(x, y, 2, 2);
  }
  // Windows
  const wW = 512 / windowCols, wH = 512 / windowRows;
  for (let r = 0; r < windowRows; r++) {
    for (let col = 0; col < windowCols; col++) {
      const wx = col * wW + wW * 0.15, wy = r * wH + wH * 0.2;
      const ww = wW * 0.7, wh = wH * 0.55;
      // Window frame
      g.fillStyle = "#333";
      g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      // Glass
      const glassG = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      glassG.addColorStop(0, "#87ceeb");
      glassG.addColorStop(0.5, "#5ba3d9");
      glassG.addColorStop(1, "#3a7ab5");
      g.fillStyle = glassG;
      g.fillRect(wx, wy, ww, wh);
      // Reflection
      g.fillStyle = "rgba(255,255,255,0.15)";
      g.beginPath();
      g.moveTo(wx, wy);
      g.lineTo(wx + ww * 0.4, wy);
      g.lineTo(wx, wy + wh * 0.6);
      g.fill();
    }
  }
  // Ground floor darker band
  g.fillStyle = "rgba(0,0,0,0.2)";
  g.fillRect(0, 512 - 40, 512, 40);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Corrugated metal roof texture */
export function corrugatedTexture(color: string): THREE.CanvasTexture {
  const key = `corrugated-${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  // Corrugation ridges
  for (let x = 0; x < 256; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, "rgba(255,255,255,0.15)");
    grd.addColorStop(0.5, "rgba(0,0,0,0.2)");
    grd.addColorStop(1, "rgba(255,255,255,0.1)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 16, 256);
  }
  // Rust spots
  for (let i = 0; i < 15; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(139,69,19,${0.1 + Math.random() * 0.2})`;
    g.beginPath();
    g.arc(x, y, 3 + Math.random() * 8, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c, 2);
  cache.set(key, t);
  return t;
}

/** Wood plank texture for stalls */
export function woodTexture(): THREE.CanvasTexture {
  const key = "wood";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = "#8B5E3C";
  g.fillRect(0, 0, 256, 256);
  // Wood grain
  for (let i = 0; i < 40; i++) {
    const y = i * 6.5 + Math.random() * 3;
    g.strokeStyle = `rgba(60,35,15,${0.15 + Math.random() * 0.2})`;
    g.lineWidth = 0.8 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x < 256; x += 20) {
      g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2);
    }
    g.stroke();
  }
  // Knots
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = "rgba(50,30,10,0.4)";
    g.beginPath();
    g.ellipse(x, y, 4, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Plank gaps
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.fillRect(0, y, 256, 1.5);
  }
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Skin texture for characters */
export function skinTexture(baseColor: string): THREE.CanvasTexture {
  const key = `skin-${baseColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 128);
  // Subtle skin texture
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    const v = Math.random() * 15 - 7;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 200 : 0},${v > 0 ? 180 : 0},${Math.abs(v) / 80})`;
    g.fillRect(x, y, 1, 1);
  }
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Fabric/cloth texture for clothing */
export function fabricTexture(baseColor: string): THREE.CanvasTexture {
  const key = `fabric-${baseColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(128, 128);
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 128);
  // Weave pattern
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      const v = ((x + y) % 4 === 0) ? 8 : -5;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 60})`;
      g.fillRect(x, y, 2, 2);
    }
  }
  const t = toTexture(c, 2);
  cache.set(key, t);
  return t;
}

/** Trotro/bus side livery */
export function trotroTexture(): THREE.CanvasTexture {
  const key = "trotro";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 256);
  // Yellow base
  g.fillStyle = "#f2c200";
  g.fillRect(0, 0, 512, 256);
  // Green stripe
  g.fillStyle = "#1a7a2e";
  g.fillRect(0, 100, 512, 60);
  // Text
  g.fillStyle = "#fff";
  g.font = "bold 28px sans-serif";
  g.textAlign = "center";
  g.fillText("TROTRO", 256, 145);
  // Window band
  g.fillStyle = "#1a1a2e";
  g.fillRect(0, 30, 512, 55);
  // Window separations
  for (let x = 0; x < 512; x += 50) {
    g.fillStyle = "#2a2a3e";
    g.fillRect(x + 2, 32, 46, 51);
    // Glass reflection
    const grd = g.createLinearGradient(x, 32, x + 46, 83);
    grd.addColorStop(0, "rgba(135,206,235,0.6)");
    grd.addColorStop(1, "rgba(100,149,237,0.3)");
    g.fillStyle = grd;
    g.fillRect(x + 4, 34, 42, 47);
  }
  // Rust and wear
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512, y = Math.random() * 256;
    g.fillStyle = `rgba(100,50,10,${Math.random() * 0.15})`;
    g.fillRect(x, y, 2, 2);
  }
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Concrete sidewalk paver slabs */
export function sidewalkTexture(): THREE.CanvasTexture {
  const key = "sidewalk-pavers";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 512);
  g.fillStyle = "#9e9e9e";
  g.fillRect(0, 0, 512, 512);

  // Paver tile grid (64x64 tiles)
  for (let y = 0; y < 512; y += 64) {
    for (let x = 0; x < 512; x += 64) {
      const v = 145 + Math.random() * 25;
      g.fillStyle = `rgb(${v},${v - 2},${v - 4})`;
      g.fillRect(x + 2, y + 2, 60, 60);

      // Speckle noise
      for (let k = 0; k < 60; k++) {
        const sx = x + 2 + Math.random() * 60;
        const sy = y + 2 + Math.random() * 60;
        const sv = v - 20 + Math.random() * 40;
        g.fillStyle = `rgb(${sv},${sv},${sv})`;
        g.fillRect(sx, sy, 1.5, 1.5);
      }
    }
  }

  // Seam lines (mortar joints)
  g.strokeStyle = "rgba(40,40,40,0.6)";
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }

  const t = toTexture(c, 4);
  cache.set(key, t);
  return t;
}

/** Concrete road curb with bevel */
export function curbTexture(): THREE.CanvasTexture {
  const key = "curb-concrete";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 64);
  g.fillStyle = "#8d8d8d";
  g.fillRect(0, 0, 256, 64);
  // Edge highlight
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(0, 0, 256, 8);
  // Shadowed base
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(0, 56, 256, 8);
  const t = toTexture(c, 2);
  cache.set(key, t);
  return t;
}

/** Ghanaian red laterite dirt shoulder */
export function lateriteShoulderTexture(): THREE.CanvasTexture {
  const key = "laterite-dirt";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(512, 512);
  // Rich reddish-brown Accra laterite soil
  g.fillStyle = "#8c4828";
  g.fillRect(0, 0, 512, 512);

  // Dirt color variations
  for (let i = 0; i < 20000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const r = 120 + Math.random() * 50;
    const gr = 60 + Math.random() * 35;
    const b = 30 + Math.random() * 25;
    g.fillStyle = `rgb(${r},${gr},${b})`;
    g.fillRect(x, y, 2, 2);
  }

  // Small gravel stones & dry grass tufts
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    g.fillStyle = "rgba(45,30,20,0.7)";
    g.beginPath();
    g.arc(x, y, 1.5 + Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }

  const t = toTexture(c, 6);
  cache.set(key, t);
  return t;
}

/** Pedestrian zebra crossing thermoplastic white bars */
export function zebraTexture(): THREE.CanvasTexture {
  const key = "zebra-crossing";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 512);
  g.fillStyle = "#2a2a2e"; // Dark asphalt base
  g.fillRect(0, 0, 256, 512);

  // Alternating white thermoplastic bars
  for (let y = 0; y < 512; y += 64) {
    g.fillStyle = "#f8f9fa";
    g.fillRect(8, y + 8, 240, 48);

    // Weathering/tire wear scuffs
    for (let k = 0; k < 300; k++) {
      const tx = 8 + Math.random() * 240;
      const ty = y + 8 + Math.random() * 48;
      g.fillStyle = "rgba(40,40,40,0.3)";
      g.fillRect(tx, ty, 2, 1);
    }
  }

  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Drain gutter concrete channel */
export function drainGutterTexture(): THREE.CanvasTexture {
  const key = "drain-gutter";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(128, 256);
  g.fillStyle = "#3d3d3d";
  g.fillRect(0, 0, 128, 256);
  // Stains and mossy water line
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, "rgba(20,20,20,0.8)");
  grd.addColorStop(0.3, "rgba(50,55,40,0.7)");
  grd.addColorStop(0.7, "rgba(50,55,40,0.7)");
  grd.addColorStop(1, "rgba(20,20,20,0.8)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 256);
  const t = toTexture(c, 4);
  cache.set(key, t);
  return t;
}

/** Tropical sky dome with sunset gradient and clouds */
export function skyDomeTexture(): THREE.CanvasTexture {
  const key = "sky-dome";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(1024, 512);

  // Vertical sky gradient (Deep blue top -> golden amber horizon)
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, "#2b5c8f");
  grad.addColorStop(0.4, "#5b92c4");
  grad.addColorStop(0.75, "#e8a868");
  grad.addColorStop(0.95, "#ffcc80");
  grad.addColorStop(1.0, "#fde6b8");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);

  // Soft cumulus cloud puffs
  function drawCloud(cx: number, cy: number, w: number, h: number) {
    g.fillStyle = "rgba(255, 250, 240, 0.45)";
    for (let i = 0; i < 6; i++) {
      const rx = cx + (Math.random() - 0.5) * w;
      const ry = cy + (Math.random() - 0.5) * h * 0.4;
      const r = (w * 0.25) + Math.random() * (w * 0.2);
      g.beginPath();
      g.arc(rx, ry, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawCloud(200, 240, 180, 60);
  drawCloud(550, 190, 260, 70);
  drawCloud(850, 260, 200, 60);
  drawCloud(380, 290, 140, 50);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Vendor umbrella multi-color fabric segments */
export function vendorUmbrellaTexture(): THREE.CanvasTexture {
  const key = "vendor-umbrella";
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 256);
  const cx = 128, cy = 128, r = 128;
  const colors = ["#e03131", "#fcc419", "#1971c2", "#ffffff", "#2f9e44", "#ffffff", "#fcc419", "#e03131"];
  const segments = colors.length;

  for (let i = 0; i < segments; i++) {
    const start = (i / segments) * Math.PI * 2;
    const end = ((i + 1) / segments) * Math.PI * 2;
    g.fillStyle = colors[i];
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, r, start, end);
    g.closePath();
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** Car paint texture */
export function carPaintTexture(color: string): THREE.CanvasTexture {
  const key = `carpaint-${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  // Metallic flake
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    g.fillRect(x, y, 0.5, 0.5);
  }
  // Subtle clearcoat highlight
  const grd = g.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, "rgba(255,255,255,0.06)");
  grd.addColorStop(0.5, "transparent");
  grd.addColorStop(1, "rgba(255,255,255,0.03)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Clear texture cache on engine teardown to prevent GPU memory leaks */
export function disposeTextureCache() {
  cache.forEach((t) => {
    t.dispose();
  });
  cache.clear();
  brandTex = null;
}
