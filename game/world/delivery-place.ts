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
    // Painted rider bay on the ground between the counter and the road.
    for (const [w, d, x, z] of [[2.6, 0.12, 0, 1.6], [2.6, 0.12, 0, 4.4], [0.12, 2.9, -1.3, 3], [0.12, 2.9, 1.3, 3]] as const)
      box(w, 0.02, d, 0xf2e35c, x, 0.075, z);
    const bay = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.55),
      new THREE.MeshBasicMaterial({ map: textTexture("RIDERS PARK HERE", { bg: "#00000000", fg: "#f2e35c", w: 768, h: 160, font: 70 }), transparent: true }),
    );
    bay.rotation.x = -Math.PI / 2;
    bay.position.set(0, 0.08, 3.6);
    group.add(bay);
    // Charcoal stove with a big aluminium pot (the engine puffs steam from it).
    box(0.9, 0.5, 0.9, 0x3a3532, 1.7, 0.25, -0.9);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.55, 16), new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.85, roughness: 0.3 }));
    pot.position.set(1.7, 0.78, -0.9);
    pot.name = "steam-pot";
    group.add(pot);
    // Chalk menu board with today's prices.
    box(0.08, 1.2, 0.08, 0x594b38, -2.9, 0.6, -0.4);
    box(1.4, 1.05, 0.06, 0x1d2b25, -2.9, 1.55, -0.4);
    [["WAAKYE ........ ₵25", 1.85], ["JOLLOF + CHICKEN ₵45", 1.55], ["KELEWELE ...... ₵10", 1.25]].forEach(([line, y]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.22), new THREE.MeshBasicMaterial({ map: textTexture(line as string, { bg: "#1d2b25", fg: "#f3f0e0", w: 640, h: 112, font: 44 }) }));
      m.position.set(-2.9, y as number, -0.36);
      group.add(m);
    });
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
  // Light anchor only. Real PointLights live in a fixed engine pool: a light
  // inside every shop front made each one add per-pixel cost to every
  // material, and showing/hiding them forced full shader recompiles.
  const lightAnchor = new THREE.Object3D();
  lightAnchor.position.set(0, 2.8, -0.8);
  lightAnchor.name = "shop-light";
  group.add(lightAnchor);
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

const GATE_WALL = [0xe7d3b0, 0xd8c6e0, 0xc9e0d0, 0xf0c9a8, 0xe9e2cf];

/**
 * Ghanaian compound frontage for a drop-off: boundary wall, a two-leaf metal gate
 * (leaves named gate-left / gate-right, hinged at the posts), house number, a
 * gutter with a slab bridge, and the odd "Beware of dog". Local +z faces the road.
 * Hostels get a porter's lodge with a barrier instead.
 */
export function buildCompoundGate(opts: { color: number; number: number; seed: number; hostel?: string | null }): THREE.Group {
  const group = new THREE.Group();
  group.name = opts.hostel ? "hostel-lodge" : "compound-gate";
  const solid = (color: number, roughness = 0.85, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const add = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const wall = solid(GATE_WALL[opts.seed % GATE_WALL.length]);
  const coping = solid(0xb9ad98);
  const drain = solid(0x2d2a26, 1);
  const slab = solid(0xa9a39a);
  const plate = (text: string, w: number, x: number, y: number, z: number, bg: string, fg: string) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 3.2), new THREE.MeshBasicMaterial({ map: textTexture(text, { bg, fg, w: 512, h: 160, font: 64 }) }));
    m.position.set(x, y, z);
    group.add(m);
  };
  // Open storm drain along the road with a concrete slab bridge to the entrance.
  add(group, 14, 0.04, 0.55, drain, 0, 0.02, 1.25);
  add(group, 3.4, 0.12, 0.8, slab, 0, 0.07, 1.25);
  if (opts.hostel) {
    add(group, 2.4, 2.5, 2.2, solid(0xe9e2cf), -3.2, 1.25, -0.8);
    add(group, 2.7, 0.15, 2.5, coping, -3.2, 2.58, -0.8);
    add(group, 1.2, 0.8, 0.05, solid(0x24362f, 0.3), -3.2, 1.5, 0.32);
    add(group, 0.2, 1.1, 0.2, solid(0xd8d0bc), 2.3, 0.55, 0.2);
    const arm = add(group, 4.2, 0.1, 0.1, solid(0xe03131), 0.2, 1.05, 0.2);
    arm.name = "barrier";
    plate(`${opts.hostel.toUpperCase()} · PORTER'S LODGE`, 3.6, -3.2, 2.95, 0.36, "#24533d", "#f6efd6");
    for (const side of [-1, 1]) add(group, 4.5, 2.2, 0.25, wall, side * 7, 1.1, 0);
    return group;
  }
  // Boundary wall either side of the gate, with posts and lamps.
  for (const side of [-1, 1]) {
    add(group, 5.4, 2.2, 0.25, wall, side * 4.3, 1.1, 0);
    add(group, 5.5, 0.12, 0.4, coping, side * 4.3, 2.26, 0);
    add(group, 0.5, 2.7, 0.5, wall, side * 1.6, 1.35, 0);
    const lamp = add(group, 0.22, 0.26, 0.22, new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffc27a, emissiveIntensity: 0.8 }), side * 1.6, 2.83, 0);
    lamp.material.name = "lantern";
  }
  plate(`H/No. ${opts.number}`, 0.7, 1.6, 1.9, 0.26, "#1c4f8a", "#ffffff");
  if (opts.seed % 3 === 0) plate("BEWARE OF DOG", 1.2, -4.3, 1.5, 0.13, "#f8f9fa", "#c92a2a");
  // Two gate leaves hinged at the posts: vertical bars over a solid lower half.
  const gateMat = solid(opts.color, 0.45, 0.6);
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 1.35, 0, 0);
    hinge.name = side < 0 ? "gate-left" : "gate-right";
    const dir = -side; // leaves extend toward the centre
    add(hinge, 1.32, 1.0, 0.06, gateMat, dir * 0.66, 0.6, 0);
    for (let i = 0; i < 6; i++) add(hinge, 0.05, 1.0, 0.05, gateMat, dir * (0.1 + i * 0.23), 1.6, 0);
    add(hinge, 1.32, 0.07, 0.07, gateMat, dir * 0.66, 2.1, 0);
    group.add(hinge);
  }
  // Bougainvillea spilling over the wall.
  const flowers = solid(0xd6336c, 0.9);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45 + (i % 2) * 0.15, 0), flowers);
    b.position.set(-5.8 + i * 0.5, 2.35 + (i % 2) * 0.2, -0.1);
    group.add(b);
  }
  return group;
}
