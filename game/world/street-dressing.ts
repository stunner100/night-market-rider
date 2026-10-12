import * as THREE from "three";
import { buildAccraBlock } from "./accra-block";
import { buildDeliveryPlace } from "./delivery-place";
import { pointInPolygon, distancePointToSegment } from "./coordinates";
import { billboardTexture, textTexture, vendorUmbrellaTexture } from "../textures";
import { BILLBOARDS, KIOSK_SIGNS, STREET_FOOD, pickSeeded } from "./accra-signs";
import type { WorldChunk, WorldRoad } from "./types";

const URBAN_ROADS = new Set([
  "primary", "secondary", "tertiary", "unclassified", "residential", "service",
]);
const LIT_ROADS = new Set(["primary", "secondary", "tertiary", "unclassified"]);

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01(seed: number): number {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 100000) / 100000;
}

interface Placement {
  x: number;
  z: number;
  yaw: number;
  scale?: number;
  seed: number;
}

function sampleRoad(
  road: WorldRoad,
  segmentIndex: number,
  spacing: number,
  offset: number,
  callback: (placement: Placement) => void,
): void {
  const a = road.points[segmentIndex];
  const b = road.points[segmentIndex + 1];
  if (!a || !b) return;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < Math.max(8, spacing * 0.45)) return;

  const ux = dx / len;
  const uz = dz / len;
  const nx = -uz;
  const nz = ux;
  const baseSeed = hashString(`${road.id}:${segmentIndex}`);
  const start = Math.min(spacing * 0.7, 6 + rand01(baseSeed) * spacing * 0.45);

  for (let d = start, n = 0; d < len - 3; d += spacing, n++) {
    const seed = baseSeed ^ Math.imul(n + 1, 0x9e3779b1);
    const side = rand01(seed ^ 0x51ed270b) > 0.5 ? 1 : -1;
    const jitter = (rand01(seed ^ 0x27d4eb2d) - 0.5) * 1.8;
    callback({
      x: a.x + ux * d + nx * (offset * side + jitter),
      z: a.z + uz * d + nz * (offset * side + jitter),
      yaw: Math.atan2(dx, dz),
      scale: 0.86 + rand01(seed ^ 0x165667b1) * 0.36,
      seed,
    });
  }
}

function createInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: Placement[],
  apply: (dummy: THREE.Object3D, p: Placement, index: number) => void,
): THREE.InstancedMesh | null {
  if (!placements.length) {
    geometry.dispose();
    material.dispose();
    return null;
  }
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const dummy = new THREE.Object3D();
  placements.forEach((p, i) => {
    apply(dummy, p, i);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function addTrees(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const trunks = createInstanced(
    new THREE.CylinderGeometry(0.22, 0.32, 4.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4d32, roughness: 0.96 }),
    placements,
    (d, p) => {
      const s = p.scale ?? 1;
      d.position.set(p.x, 2.1 * s, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(s, s, s);
    },
  );
  if (trunks) {
    trunks.castShadow = !mobile;
    trunks.receiveShadow = true;
    trunks.name = "accra-tree-trunks";
    group.add(trunks);
  }

  const crowns = createInstanced(
    new THREE.IcosahedronGeometry(1.75, 1),
    new THREE.MeshStandardMaterial({ color: 0x4e713d, roughness: 0.93 }),
    placements,
    (d, p) => {
      const s = p.scale ?? 1;
      d.position.set(p.x, 4.75 * s, p.z);
      d.rotation.set(0, rand01(p.seed) * Math.PI, 0);
      d.scale.set(1.15 * s, 0.9 * s, 1.05 * s);
    },
  );
  if (crowns) {
    crowns.castShadow = !mobile;
    crowns.receiveShadow = true;
    crowns.name = "accra-tree-crowns";
    group.add(crowns);
  }
}

function addPoles(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const poles = createInstanced(
    new THREE.CylinderGeometry(0.09, 0.12, 7.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x56534d, roughness: 0.88, metalness: 0.12 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 3.6, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (poles) {
    poles.castShadow = !mobile;
    poles.name = "accra-utility-poles";
    group.add(poles);
  }

  const arms = createInstanced(
    new THREE.BoxGeometry(1.55, 0.1, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x4b4a46, roughness: 0.82, metalness: 0.15 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 6.75, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (arms) {
    arms.castShadow = !mobile;
    arms.name = "accra-pole-arms";
    group.add(arms);
  }
}

function addStreetlights(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const posts = createInstanced(
    new THREE.CylinderGeometry(0.055, 0.085, 6.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x2f3438, roughness: 0.55, metalness: 0.55 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 3.25, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (posts) {
    posts.castShadow = !mobile;
    posts.name = "accra-streetlight-posts";
    group.add(posts);
  }

  const heads = createInstanced(
    new THREE.BoxGeometry(0.95, 0.12, 0.28),
    new THREE.MeshStandardMaterial({
      color: 0xe9e5ce,
      emissive: 0xffe7a8,
      emissiveIntensity: 0.26,
      roughness: 0.45,
      metalness: 0.18,
    }),
    placements,
    (d, p) => {
      d.position.set(p.x, 6.25, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (heads) {
    heads.name = "accra-streetlight-heads";
    group.add(heads);
  }
}

function addParkedCars(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const bodies = createInstanced(
    new THREE.BoxGeometry(1.55, 0.58, 3.45),
    new THREE.MeshStandardMaterial({ color: 0xb7bdc2, roughness: 0.42, metalness: 0.28 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 0.48, p.z);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (bodies) {
    bodies.castShadow = !mobile;
    bodies.receiveShadow = true;
    bodies.name = "accra-parked-car-bodies";
    group.add(bodies);
  }

  const cabins = createInstanced(
    new THREE.BoxGeometry(1.34, 0.52, 1.65),
    new THREE.MeshStandardMaterial({ color: 0x33434d, roughness: 0.32, metalness: 0.22 }),
    placements,
    (d, p) => {
      d.position.set(p.x, 0.98, p.z - Math.cos(p.yaw) * 0.05);
      d.rotation.set(0, p.yaw, 0);
      d.scale.set(1, 1, 1);
    },
  );
  if (cabins) {
    cabins.castShadow = !mobile;
    cabins.name = "accra-parked-car-cabins";
    group.add(cabins);
  }
}

function kioskColor(seed: number): number {
  const options = [0xf2e35c, 0x1d8f6e, 0x702963, 0xe36b2c, 0x2d64a8];
  return options[Math.floor(rand01(seed) * options.length) % options.length];
}

function addKiosks(group: THREE.Group, chunk: WorldChunk, mobile: boolean): void {
  const max = mobile ? 4 : 9;
  const candidates = chunk.pois
    .filter(p => p.tags?.shop || p.tags?.amenity)
    .slice(0, max);

  for (const poi of candidates) {
    const seed = hashString(poi.id);
    const kiosk = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 2.35, 2.1),
      new THREE.MeshStandardMaterial({ color: kioskColor(seed), roughness: 0.82, metalness: 0.04 }),
    );
    body.position.y = 1.175;
    body.castShadow = !mobile;
    body.receiveShadow = true;
    kiosk.add(body);

    const opening = new THREE.Mesh(
      new THREE.PlaneGeometry(1.75, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x1d2327, roughness: 0.45, metalness: 0.08 }),
    );
    opening.position.set(0, 1.35, 1.06);
    kiosk.add(opening);

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(3.15, 0.12, 1.0),
      new THREE.MeshStandardMaterial({ color: 0xf4df52, roughness: 0.75 }),
    );
    awning.position.set(0, 2.34, 0.62);
    awning.rotation.x = -0.12;
    awning.castShadow = !mobile;
    kiosk.add(awning);

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(2.25, 0.52, 0.09),
      new THREE.MeshBasicMaterial({ map: textTexture(pickSeeded(KIOSK_SIGNS, seed), { bg: "#e3bd31", fg: "#14251b", font: 44 }) }),
    );
    sign.position.set(0, 2.7, 0.9);
    kiosk.add(sign);

    kiosk.position.set(poi.x + (rand01(seed ^ 19) - 0.5) * 4, 0.02, poi.z + (rand01(seed ^ 47) - 0.5) * 4);
    kiosk.rotation.y = rand01(seed ^ 91) * Math.PI * 2;
    kiosk.name = `accra-kiosk-${poi.id}`;
    group.add(kiosk);
  }
}

/** Big two-post billboards set back from main roads. */
function addBillboards(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x3b3f42, roughness: 0.6, metalness: 0.5 });
  const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 6.6, 6);
  const frameGeo = new THREE.BoxGeometry(8.4, 4.3, 0.22);
  const faceGeo = new THREE.PlaneGeometry(8, 4);
  for (const p of placements) {
    const [title, sub, bg, fg, accent] = pickSeeded(BILLBOARDS, p.seed);
    const board = new THREE.Group();
    for (const x of [-2.6, 2.6]) {
      const post = new THREE.Mesh(postGeo, steel);
      post.position.set(x, 3.3, 0);
      post.castShadow = !mobile;
      board.add(post);
    }
    const frame = new THREE.Mesh(frameGeo, steel);
    frame.position.y = 7.4;
    frame.castShadow = !mobile;
    board.add(frame);
    const face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({ map: billboardTexture(title, sub, bg, fg, accent) }));
    face.position.set(0, 7.4, 0.12);
    face.name = "billboard-face";
    const back = new THREE.Mesh(faceGeo, face.material);
    back.position.set(0, 7.4, -0.12);
    back.rotation.y = Math.PI;
    board.add(face, back);
    board.position.set(p.x, 0, p.z);
    board.rotation.y = p.yaw + Math.PI / 2 * (rand01(p.seed ^ 0x77) > 0.5 ? 1 : -1);
    board.name = "accra-billboard";
    group.add(board);
  }
}

/** Kenkey, kelewele and coconut sellers: table, basins, umbrella and a lantern for night. */
function addFoodStands(group: THREE.Group, placements: Placement[], mobile: boolean): void {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.92 });
  const basin = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, roughness: 0.25, metalness: 0.85 });
  const food = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
  const umbrella = new THREE.MeshStandardMaterial({ map: vendorUmbrellaTexture(), roughness: 0.8, side: THREE.DoubleSide });
  const lantern = new THREE.MeshStandardMaterial({ color: 0xffd8a0, emissive: 0xffb347, emissiveIntensity: 0 });
  lantern.name = "lantern";
  const tableGeo = new THREE.BoxGeometry(1.5, 0.08, 0.8);
  const legGeo = new THREE.BoxGeometry(0.07, 0.8, 0.07);
  const basinGeo = new THREE.CylinderGeometry(0.34, 0.24, 0.2, 12);
  const ballGeo = new THREE.SphereGeometry(0.1, 6, 5);
  const shadeGeo = new THREE.ConeGeometry(1.5, 0.55, 8, 1, true);
  const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5);
  const lampGeo = new THREE.SphereGeometry(0.09, 8, 6);
  for (const p of placements) {
    const stand = new THREE.Group();
    const top = new THREE.Mesh(tableGeo, wood);
    top.position.y = 0.82;
    top.castShadow = !mobile;
    stand.add(top);
    for (const [x, z] of [[-0.68, -0.34], [0.68, -0.34], [-0.68, 0.34], [0.68, 0.34]]) {
      const leg = new THREE.Mesh(legGeo, wood);
      leg.position.set(x, 0.4, z);
      stand.add(leg);
    }
    for (const x of [-0.38, 0.38]) {
      const b = new THREE.Mesh(basinGeo, basin);
      b.position.set(x, 0.96, 0);
      stand.add(b);
      for (let i = 0; i < 4; i++) {
        const ball = new THREE.Mesh(ballGeo, food);
        ball.position.set(x + (i % 2 - 0.5) * 0.16, 1.1 + (i > 1 ? 0.1 : 0), (i % 2 ? 0.07 : -0.07));
        stand.add(ball);
      }
    }
    const pole = new THREE.Mesh(poleGeo, wood);
    pole.position.set(0, 1.15, -0.3);
    stand.add(pole);
    const shade = new THREE.Mesh(shadeGeo, umbrella);
    shade.position.set(0, 2.4, -0.3);
    shade.castShadow = !mobile;
    stand.add(shade);
    const lamp = new THREE.Mesh(lampGeo, lantern);
    lamp.position.set(0.5, 1.02, 0.25);
    stand.add(lamp);
    const [label, bg] = pickSeeded(STREET_FOOD, p.seed);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.32),
      new THREE.MeshBasicMaterial({ map: textTexture(label, { bg, fg: "#3b1d0e", font: 46 }), side: THREE.DoubleSide }),
    );
    sign.position.set(0, 0.55, 0.42);
    stand.add(sign);
    stand.position.set(p.x, 0, p.z);
    stand.rotation.y = p.yaw + Math.PI / 2 * (rand01(p.seed ^ 0x99) > 0.5 ? 1 : -1);
    stand.name = "accra-food-stand";
    group.add(stand);
  }
}

export function buildStreetDressingGroup(chunk: WorldChunk, mobile = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "osm-street-dressing";

  const trees: Placement[] = [];
  const poles: Placement[] = [];
  const lights: Placement[] = [];
  const cars: Placement[] = [];
  const billboards: Placement[] = [];
  const stands: Placement[] = [];

  const maxTrees = mobile ? 36 : 82;
  const maxPoles = mobile ? 18 : 42;
  const maxLights = mobile ? 14 : 34;
  const maxCars = mobile ? 8 : 18;
  const maxBillboards = mobile ? 1 : 3;
  const maxStands = mobile ? 4 : 10;

  for (const road of chunk.roads) {
    if (!URBAN_ROADS.has(road.highway)) continue;
    const edge = road.width * 0.5;
    for (let i = 0; i < road.points.length - 1; i++) {
      if (trees.length < maxTrees) {
        sampleRoad(road, i, mobile ? 64 : 44, edge + 5.2, p => {
          if (trees.length < maxTrees && rand01(p.seed ^ 0x93ab) > 0.22) trees.push(p);
        });
      }
      if (poles.length < maxPoles) {
        sampleRoad(road, i, mobile ? 105 : 82, edge + 2.7, p => {
          if (poles.length < maxPoles && rand01(p.seed ^ 0x8191) > 0.35) poles.push(p);
        });
      }
      if (LIT_ROADS.has(road.highway) && lights.length < maxLights) {
        sampleRoad(road, i, mobile ? 78 : 52, edge + 2.25, p => {
          if (lights.length < maxLights) lights.push(p);
        });
      }
      if (["primary", "secondary", "tertiary"].includes(road.highway) && billboards.length < maxBillboards) {
        sampleRoad(road, i, 140, edge + 9, p => {
          if (billboards.length < maxBillboards && rand01(p.seed ^ 0xb1b) > 0.45) billboards.push(p);
        });
      }
      if (stands.length < maxStands) {
        sampleRoad(road, i, mobile ? 70 : 38, edge + 2.4, p => {
          if (stands.length < maxStands && rand01(p.seed ^ 0x5f00d) > 0.5) stands.push(p);
        });
      }
      if (!mobile && road.width >= 5.5 && cars.length < maxCars) {
        sampleRoad(road, i, 96, edge + 1.05, p => {
          if (cars.length < maxCars && rand01(p.seed ^ 0x44f1) > 0.52) cars.push(p);
        });
      }
    }
  }

  // Author a compact commercial frontage on otherwise empty roadside lots.
  // Reject mapped footprints and roads; never fill the carriageway for density.
  let frontage = 0;
  const frontageLimit = mobile ? 8 : 14;
  const occupied:{x:number;z:number}[]=[];
  for (const road of chunk.roads) {
    if (frontage >= frontageLimit || !URBAN_ROADS.has(road.highway) || road.width > 15) continue;
    for (let i=0;i<road.points.length-1 && frontage<frontageLimit;i++) {
      const a=road.points[i],b=road.points[i+1],len=Math.hypot(b.x-a.x,b.z-a.z);
      if(len<35)continue;
      const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
      for(let distance=18;distance<len-16 && frontage<frontageLimit;distance+=30) {
      for(const side of [1,-1]) {
        if(frontage>=frontageLimit)break;
        const x=a.x+(b.x-a.x)*distance/len+nx*side*(road.width/2+3.2),z=a.z+(b.z-a.z)*distance/len+nz*side*(road.width/2+3.2);
        if(occupied.some(p=>Math.hypot(p.x-x,p.z-z)<24))continue;
        const yaw=Math.atan2(-nx*side,-nz*side);
        const samples=[[-8,-8],[8,-8],[-8,2],[8,2],[0,-3]].map(([lx,lz])=>({x:x+Math.cos(yaw)*lx+Math.sin(yaw)*lz,z:z-Math.sin(yaw)*lx+Math.cos(yaw)*lz}));
        if(samples.some(p=>chunk.buildings.some(building=>pointInPolygon(p.x,p.z,building.footprint))))continue;
        if(samples.some(p=>chunk.roads.some(r=>r.points.slice(1).some((b,j)=>distancePointToSegment(p.x,p.z,r.points[j].x,r.points[j].z,b.x,b.z)<r.width/2+.5))))continue;
        const names=['LEGON NIGHT KITCHEN','AKWAABA CHOP BAR','SWEET MOTHER CHOP BAR','SHIASHIE FOOD JOINT','AUNTIE AKOS WAAKYE','OSU KENKEY HOUSE'];
        const seed=hashString(chunk.key+road.id+i+":"+distance+":"+side);
        const kit=frontage===0?buildDeliveryPlace(names[seed%names.length]):buildAccraBlock(seed);
        kit.name='accra-commercial-frontage';kit.position.set(x,0,z);kit.rotation.y=yaw;group.add(kit);frontage++;occupied.push({x,z});
      }
    }
  }
  }
  // Sagging utility wires share one line draw call per chunk.
  if(poles.length>1){
    const vertices:number[]=[];
    for(let i=1;i<poles.length;i++){
      const a=poles[i-1],b=poles[i];if(Math.hypot(b.x-a.x,b.z-a.z)>110)continue;
      for(let j=0;j<8;j++){
        for(const t of [j/8,(j+1)/8])vertices.push(a.x+(b.x-a.x)*t,6.65-Math.sin(t*Math.PI)*.6,a.z+(b.z-a.z)*t);
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    group.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:0x3e4140})));
  }

  addTrees(group, trees, mobile);
  addPoles(group, poles, mobile);
  addStreetlights(group, lights, mobile);
  addParkedCars(group, cars, mobile);
  addKiosks(group, chunk, mobile);
  const clear = (p: Placement, r: number) => !chunk.buildings.some(b => pointInPolygon(p.x, p.z, b.footprint))
    && !chunk.roads.some(road => road.points.slice(1).some((b, j) => distancePointToSegment(p.x, p.z, road.points[j].x, road.points[j].z, b.x, b.z) < road.width / 2 + r));
  addBillboards(group, billboards.filter(p => clear(p, 4.5)), mobile);
  addFoodStands(group, stands.filter(p => clear(p, 1.2)), mobile);

  return group;
}

export function disposeStreetDressingGroup(group: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse(obj => {
    if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.LineSegments)) return;
    geometries.add(obj.geometry);
    if (Array.isArray(obj.material)) obj.material.forEach(m => materials.add(m));
    else materials.add(obj.material);
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
}
