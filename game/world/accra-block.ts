import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { textTexture } from "../textures";

/** Art-directed mixed-use roadside buildings: verandas, compounds and shops. */
export function buildAccraBlock(seed: number): THREE.Group {
  const group = new THREE.Group();
  const buckets = new Map<number, THREE.BufferGeometry[]>();
  const add = (
    geo: THREE.BufferGeometry,
    c: number,
    x: number,
    y: number,
    z: number,
  ) => {
    geo.translate(x, y, z);
    const list = buckets.get(c) ?? [];
    list.push(geo);
    buckets.set(c, list);
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
  const sign = (label: string, bg: string, x: number, y: number, w = 3.7) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, 0.65),
      new THREE.MeshBasicMaterial({
        map: textTexture(label, {
          bg,
          fg: "#fff5d7",
          w: 768,
          h: 128,
          font: 40,
        }),
      }),
    );
    mesh.position.set(x, y, -1.78);
    group.add(mesh);
  };
  const facade = [0xd0b48a, 0xe0cfb1, 0xa2b5aa, 0xc18f78][seed % 4];
  const roof = [0x84483a, 0x535e60, 0x70685c][seed % 3];
  const floors = seed % 3 === 0 ? 1 : seed % 3 === 1 ? 2 : 3;
  const height = floors * 3.1;
  box(11.8, height, 5, facade, 0, height / 2, -4.5);
  box(12.4, 0.16, 5.7, roof, 0, height + 0.08, -4.5);
  // Corrugated eaves catch tropical sun instead of reading as a smooth cube.
  for (let x = -6; x < 6; x += 0.32)
    box(0.05, 0.06, 5.7, roof, x, height + 0.19, -4.5);
  for (let level = 0; level < floors; level++) {
    const y = level * 3.1;
    box(12.3, 0.16, 0.65, 0xe2d9bf, 0, y + 2.98, -1.93);
    for (const x of [-4, 0, 4]) {
      box(1.45, 1.3, 0.08, 0x233d42, x, y + 1.65, -1.94);
      box(1.63, 0.1, 0.17, 0xe6dac1, x, y + 2.32, -1.86);
      box(1.63, 0.12, 0.2, 0xe6dac1, x, y + 0.98, -1.82);
      box(0.05, 1.3, 0.1, 0xafb9b1, x, y + 1.65, -1.87);
      if (level === 0) {
        box(2.8, 2.15, 0.1, 0x283e36, x, 1.1, -1.93);
        for (let n = 0; n < 9; n++)
          box(2.7, 0.018, 0.07, 0x718379, x, 0.3 + n * 0.18, -1.84);
      }
    }
    if (level > 0) {
      box(10.8, 0.16, 1.4, 0xcebea5, 0, y + 0.06, -1.35);
      box(10.7, 0.06, 0.06, 0x3d4742, 0, y + 1.04, -0.68);
      for (let x = -5.2; x < 5.3; x += 0.5)
        box(0.035, 0.9, 0.035, 0x3d4742, x, y + 0.55, -0.68);
      box(0.5, 0.4, 0.35, 0xbbbbb0, 4.9, y + 2.1, -1.8); // air conditioning unit
    }
  }
  for (const x of [-5.7, -1.9, 1.9, 5.7])
    box(0.22, height, 0.22, 0xe2d9bf, x, height / 2, -1.3);
  box(12.2, 0.12, 1.7, seed % 2 ? 0x476e57 : 0xbc8b40, 0, 2.8, -1.05);
  const shops = [
    ["ADOM PHARMACY", "#245847"],
    ["LEGON BARBER SHOP", "#633e34"],
    ["AKOSUA PROVISIONS", "#9c7330"],
    ["MOBILE MONEY", "#b49a25"],
    ["SHIASHIE TAILOR", "#335167"],
    ["CHOP BAR · BANKU", "#753e2e"],
  ];
  for (let i = 0; i < 3; i++) {
    const shop = shops[(seed + i) % shops.length];
    sign(shop[0], shop[1], (i - 1) * 4, 2.48);
  }
  // A side boundary wall and gated yard make a compound rather than an isolated object.
  box(0.18, 1.35, 5, 0xae997a, 6.3, 0.675, -4.3);
  box(1.6, 1.35, 0.18, 0xae997a, 6.9, 0.675, -1.75);
  box(0.18, 1.6, 0.25, 0xd0bda0, 7.7, 0.8, -1.75);
  if (floors > 1) {
    add(
      new THREE.CylinderGeometry(0.62, 0.65, 1.15, 10),
      0x243438,
      3,
      height + 0.75,
      -5,
    );
    box(1.6, 0.25, 1.6, 0x8f8b7d, 3, height + 0.2, -5);
  }
  box(12.8, 0.1, 2.3, 0xb5ad9b, 0, 0.02, -0.35);
  for (const [color, geos] of Array.from(buckets.entries())) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(
      merged,
      new THREE.MeshStandardMaterial({
        color,
        roughness: color === 0x233d42 ? 0.32 : 0.86,
        metalness: color === 0x233d42 ? 0.12 : 0,
      }),
    );
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  group.name = "accra-commercial-frontage";
  return group;
}
