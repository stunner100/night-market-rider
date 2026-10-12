import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { textTexture } from "../textures";
/** Small, reusable roadside kit. Geometry is batched by material before entering the scene. */
export function buildDeliveryPlace(
  name: string,
  customer = false,
): THREE.Group {
  const group = new THREE.Group();
  group.name = customer ? "customer-momo-corner" : "night-market-vendor";
  const buckets = new Map<number, THREE.BufferGeometry[]>();
  const add = (
    geo: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
  ) => {
    geo.translate(x, y, z);
    const list = buckets.get(color) ?? [];
    list.push(geo);
    buckets.set(color, list);
  };
  const box = (
    w: number,
    h: number,
    d: number,
    c: number,
    x: number,
    y: number,
    z: number,
  ) => add(new THREE.BoxGeometry(w, h, d), c, x, y, z);
  const sign = (
    text: string,
    w: number,
    x: number,
    y: number,
    z: number,
    bg: string,
    fg = "#fff",
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w / 5),
      new THREE.MeshBasicMaterial({
        map: textTexture(text, { bg, fg, w: 1024, h: 160, font: 52 }),
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  // Entrance stays open: the actor stands at local origin, buildings sit behind them.
  box(12, 0.12, 7, 0xb6a18a, 0, 0.03, -2.8);
  if (customer) {
    box(3.1, 2.7, 2.5, 0xe3bf25, 3.3, 1.4, -2.6);
    box(3.5, 0.16, 3, 0x49514b, 3.3, 2.83, -2.6);
    box(2.4, 1, 0.06, 0x24362f, 3.3, 1.7, -1.32);
    sign("MoMo · CASH IN / OUT", 3, 3.3, 2.55, -1.27, "#e8c332", "#171f18");
    sign("LEGON COMMUNITY", 5, -2.3, 2.3, -4.1, "#24533d");
    box(4, 1.8, 0.23, 0xd3ba96, -3, 0.9, -4.5);
    box(0.3, 2.5, 0.3, 0xd4c8ad, -0.7, 1.25, -4.5);
    box(0.3, 2.5, 0.3, 0xd4c8ad, -5.2, 1.25, -4.5);
  } else {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 4;
      box(3.9, 3.2, 3.2, [0xc88e64, 0xe8d5b1, 0x7a9c8c][i], x, 1.65, -3.6);
      box(2.7, 2.25, 0.09, 0x263831, x, 1.25, -1.95);
      box(4.1, 0.18, 4, 0x895748, x, 3.35, -3.1);
      box(3.6, 0.12, 1.7, 0xd9a94c, x, 2.55, -1.25);
      for (const side of [-1, 1])
        box(0.06, 2.5, 0.06, 0x41483e, x + side * 1.65, 1.25, -0.45);
      box(2.7, 0.8, 0.65, 0xa3825d, x, 0.45, -1.7);
      sign(
        i === 1
          ? name.toUpperCase()
          : i === 0
            ? "WAakye · JOLLOF".toUpperCase()
            : "FRESH JUICE · KELEWELE",
        3.5,
        x,
        2.98,
        -1.9,
        i === 1 ? "#102b20" : "#5a3224",
        "#f3e8bc",
      );
      for (let n = 0; n < 4; n++)
        add(
          new THREE.SphereGeometry(0.12, 6, 4),
          [0xdf7527, 0xa6a332, 0xdfa933][i],
          x - 0.65 + n * 0.4,
          0.96,
          -1.55,
        );
    }
    sign("NIGHT MARKET · RIDER PICKUP", 4.6, 0, 3.85, -2, "#101f17", "#f2e35c");
    box(0.14, 4, 0.14, 0x594b38, -2.5, 2, -2.1);
    box(0.14, 4, 0.14, 0x594b38, 2.5, 2, -2.1);
  }
  // Plastic chairs, drinks crates, food table and a shade umbrella.
  for (let i = 0; i < 3; i++) {
    const x = -4.7 + i * 0.7;
    box(0.5, 0.08, 0.5, 0x496d60, x, 0.48, 0.2);
    box(0.5, 0.55, 0.06, 0x496d60, x, 0.73, -0.04);
    for (const dx of [-0.2, 0.2])
      for (const dz of [-0.2, 0.2])
        box(0.055, 0.5, 0.055, 0x496d60, x + dx, 0.24, 0.2 + dz);
  }
  box(1.3, 0.12, 0.8, 0x8e6845, -3.7, 0.77, 1.1);
  box(0.12, 0.75, 0.12, 0x655443, -3.7, 0.36, 1.1);
  add(new THREE.CylinderGeometry(0.035, 0.045, 2.7, 6), 0x6a6151, -4, 1.35, 1);
  add(new THREE.ConeGeometry(1.45, 0.55, 8), 0xbc5737, -4, 2.7, 1);
  for (let i = 0; i < 3; i++)
    box(0.65, 0.4, 0.5, 0x397456, 5, 0.25 + i * 0.41, -1.5);
  for (const [color, geos] of Array.from(buckets.entries())) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({ color, roughness: 0.83 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const light = new THREE.PointLight(0xffd7a0, 0, 16, 2);
  light.position.set(0, 2.8, -0.8);
  light.name = "shop-light";
  group.add(light);
  return group;
}
export function disposeDeliveryPlace(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => m.dispose());
    }
  });
  group.removeFromParent();
}
