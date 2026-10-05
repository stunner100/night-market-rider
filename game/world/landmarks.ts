import * as THREE from "three";
import { textTexture } from "../textures";
import { latLonToWorld } from "./coordinates";

const ORIGIN = { lat: 5.6425, lon: -0.18628 };
const CREAM = 0xe7dfc9;
const RED_ROOF = 0x8f3529;
const UG_BLUE = 0x173f73;
const UPSA_BLUE = 0x1d4f91;
const NM_YELLOW = 0xf2e35c;

function world(lat: number, lon: number) {
  return latLonToWorld(lat, lon, ORIGIN);
}

function mat(color: number, roughness = 0.78, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  cast = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makeLabel(text: string, accent = NM_YELLOW, width = 13): THREE.Sprite {
  const tex = textTexture(text, {
    bg: "rgba(10,12,13,.88)",
    fg: "#ffffff",
    border: `#${accent.toString(16).padStart(6, "0")}`,
    w: 768,
    h: 128,
    font: 42,
  });
  const material = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, width / 5.4, 1);
  sprite.userData.landmarkLabel = true;
  return sprite;
}

function balmeLibrary(): THREE.Group {
  const g = new THREE.Group();
  g.name = "landmark-balme-library";
  const walls = mat(0xe9e4d6, 0.82);
  const trim = mat(0xf4f0e7, 0.76);
  const roof = mat(RED_ROOF, 0.9);
  const glass = mat(0x243b48, 0.36, 0.08);

  box(g, [26, 6.4, 10], [0, 3.2, 0], walls);
  box(g, [18, 1.5, 4.4], [0, 6.7, -0.4], walls);
  box(g, [27, 0.45, 11], [0, 6.55, 0], roof);
  box(g, [19, 0.35, 5.2], [0, 7.55, -0.4], roof);

  for (let x = -10; x <= 10; x += 4) {
    box(g, [0.42, 4.1, 0.42], [x, 2.05, 5.35], trim);
    box(g, [2.25, 1.15, 0.12], [x, 3.5, 5.55], glass, false);
  }
  box(g, [10, 0.35, 2.6], [0, 4.7, 5.3], trim);
  const label = makeLabel("BALME LIBRARY · UNIVERSITY OF GHANA", 0x204f82, 18);
  label.position.set(0, 9.6, 0);
  g.add(label);
  return g;
}

function ugMainGate(): THREE.Group {
  const g = new THREE.Group();
  g.name = "landmark-ug-main-gate";
  const stone = mat(0xe5ddca, 0.84);
  const blue = mat(UG_BLUE, 0.58, 0.08);
  const gold = mat(0xd2ae45, 0.5, 0.22);

  box(g, [2.2, 7.6, 2.2], [-8.2, 3.8, 0], stone);
  box(g, [2.2, 7.6, 2.2], [8.2, 3.8, 0], stone);
  box(g, [18.8, 1.35, 1.5], [0, 7.1, 0], blue);
  box(g, [10.8, 0.28, 0.28], [0, 4.4, 0.15], gold);
  const label = makeLabel("UNIVERSITY OF GHANA · LEGON", 0xd2ae45, 17);
  label.position.set(0, 9.4, 0);
  g.add(label);
  return g;
}

function legonHall(): THREE.Group {
  const g = new THREE.Group();
  g.name = "landmark-legon-hall";
  const walls = mat(0xd9cda9, 0.86);
  const roof = mat(0x8a3f2f, 0.91);
  const dark = mat(0x27333a, 0.4, 0.04);

  box(g, [34, 5.2, 8.6], [0, 2.6, 0], walls);
  box(g, [10, 5.8, 10.6], [-13, 2.9, -4.7], walls);
  box(g, [35, 0.42, 9.4], [0, 5.4, 0], roof);
  box(g, [11, 0.42, 11.4], [-13, 6.0, -4.7], roof);
  for (let x = -14; x <= 14; x += 4) {
    box(g, [1.65, 1.0, 0.12], [x, 3.25, 4.36], dark, false);
  }
  const label = makeLabel("LEGON HALL", 0xc18b36, 11);
  label.position.set(0, 8.0, 0);
  g.add(label);
  return g;
}

function upsaCampus(): THREE.Group {
  const g = new THREE.Group();
  g.name = "landmark-upsa-campus";
  const white = mat(0xe8edf1, 0.76);
  const blue = mat(UPSA_BLUE, 0.55, 0.06);
  const glass = mat(0x243b4d, 0.32, 0.12);

  box(g, [28, 8.8, 10], [0, 4.4, 0], white);
  box(g, [4.2, 10.6, 10.8], [-10.8, 5.3, 0], blue);
  box(g, [18, 1.1, 0.45], [3.5, 8.15, 5.15], blue);
  for (let x = -5; x <= 11; x += 4) {
    for (let y = 2.3; y <= 6.6; y += 2.15) {
      box(g, [2.2, 1.05, 0.12], [x, y, 5.08], glass, false);
    }
  }
  const label = makeLabel("UPSA · UNIVERSITY OF PROFESSIONAL STUDIES", 0x4ea3e5, 19);
  label.position.set(0, 12.5, 0);
  g.add(label);
  return g;
}

function districtSign(name: string, accent: number): THREE.Group {
  const g = new THREE.Group();
  const postMat = mat(0x45494a, 0.7, 0.3);
  box(g, [0.16, 3.2, 0.16], [-2.8, 1.6, 0], postMat);
  box(g, [0.16, 3.2, 0.16], [2.8, 1.6, 0], postMat);
  const label = makeLabel(name, accent, 8.5);
  label.position.set(0, 3.6, 0);
  g.add(label);
  return g;
}

export function buildLandmarkGroup(): THREE.Group {
  const root = new THREE.Group();
  root.name = "accra-landmarks";

  const items = [
    { model: balmeLibrary(), ...world(5.650919, -0.186967), yaw: 0.02 },
    { model: ugMainGate(), ...world(5.650848, -0.181342), yaw: Math.PI / 2 },
    { model: legonHall(), ...world(5.64937, -0.18800), yaw: 0.03 },
    { model: upsaCampus(), ...world(5.66155, -0.16638), yaw: -0.15 },
  ];
  for (const item of items) {
    item.model.position.set(item.x, 0.08, item.z);
    item.model.rotation.y = item.yaw;
    root.add(item.model);
  }

  const areas = [
    { name: "NIGHT MARKET · LEGON", lat: 5.6425, lon: -0.18628, accent: NM_YELLOW },
    { name: "OKPONGLO", lat: 5.64077, lon: -0.18375, accent: 0xf09a3e },
    { name: "LEGON CAMPUS", lat: 5.6520, lon: -0.1849, accent: 0x3f79ad },
    { name: "UPSA", lat: 5.6609, lon: -0.1669, accent: 0x4ea3e5 },
    { name: "EAST LEGON", lat: 5.6432, lon: -0.1646, accent: 0x58a36b },
  ];
  for (const area of areas) {
    const p = world(area.lat, area.lon);
    const sign = districtSign(area.name, area.accent);
    sign.position.set(p.x, 0.05, p.z);
    sign.rotation.y = Math.PI * 0.12;
    root.add(sign);
  }

  return root;
}

export function disposeLandmarkGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (obj instanceof THREE.Sprite) {
      const m = obj.material as THREE.SpriteMaterial;
      m.map?.dispose();
      materials.add(m);
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry);
    if (Array.isArray(obj.material)) obj.material.forEach(m => materials.add(m));
    else materials.add(obj.material);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}
