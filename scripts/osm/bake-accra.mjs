#!/usr/bin/env node
/**
 * Bakes a slice of real Accra from OpenStreetMap into streamable chunks:
 * roads (split at chunk edges so long ways never vanish), buildings, POIs,
 * land cover (forest, scrub, grass, water…), delivery sites and a compact
 * routing graph. Coordinates are metres east (x) / south (z) of ORIGIN.
 */
import fs from "node:fs/promises";
import path from "node:path";

const EARTH_R = 6378137;
const CHUNK_SIZE = 256;
const ORIGIN = { lat: 5.6425, lon: -0.18628, name: "UG Night Market" };
// Legon, East Legon, Madina, Okponglo, Shiashie, Tetteh Quarshie and the Achimota forest edge.
const BBOX = { south: 5.6150, west: -0.2120, north: 5.6850, east: -0.1450 };
const USER_AGENT = "NightMarketRider/0.3 (+https://night-market-rider.vercel.app; OSM world baker)";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const NON_DRIVABLE = new Set(["footway", "path", "pedestrian", "cycleway", "steps", "corridor", "bridleway", "proposed", "construction", "platform"]);
const FOOD_AMENITY = new Set(["restaurant", "fast_food", "cafe", "food_court", "bar", "pub", "ice_cream", "marketplace"]);
const FOOD_SHOP = new Set(["bakery", "convenience", "supermarket", "butcher", "beverages", "deli", "greengrocer"]);
const HOME_BUILDINGS = new Set(["house", "residential", "apartments", "yes", "dormitory", "detached", "semidetached_house", "terrace", "bungalow"]);
const DROP_ROADS = new Set(["residential", "service", "unclassified", "tertiary", "living_street", "secondary"]);

const argv = process.argv.slice(2);
const outArg = argv.indexOf("--out");
const outDir = path.resolve(outArg >= 0 ? argv[outArg + 1] : "public/world/accra");
const cacheArg = argv.indexOf("--cache");
const cacheDir = cacheArg >= 0 ? path.resolve(argv[cacheArg + 1]) : null;
// Offline input: network.json + buildings.json in Overpass format (e.g. extracted from a Geofabrik .osm.pbf).
const sourceArg = argv.indexOf("--source");
const sourceDir = sourceArg >= 0 ? path.resolve(argv[sourceArg + 1]) : null;

const r1 = v => Math.round(v * 10) / 10;
function project(lat, lon) {
  const lat0 = ORIGIN.lat * Math.PI / 180;
  return {
    x: r1((lon - ORIGIN.lon) * Math.PI / 180 * EARTH_R * Math.cos(lat0)),
    z: r1(-(lat - ORIGIN.lat) * Math.PI / 180 * EARTH_R),
  };
}
const chunkCoord = v => Math.floor(v / CHUNK_SIZE);
const chunkKey = (x, z) => `${x}_${z}`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function roadWidth(tags = {}) {
  const explicit = Number.parseFloat(tags.width || "");
  if (Number.isFinite(explicit) && explicit > 1) return explicit;
  const lanes = Number.parseInt(tags.lanes || "", 10);
  if (Number.isFinite(lanes) && lanes > 0) return Math.max(3.2, lanes * 3.15);
  const byClass = {
    motorway: 14, trunk: 12, primary: 10.5, secondary: 9,
    tertiary: 8, residential: 6.5, unclassified: 6,
    living_street: 5, service: 4.5, track: 4, footway: 2.2,
    pedestrian: 4, path: 1.8,
  };
  return byClass[(tags.highway || "").replace("_link", "")] ?? 5.5;
}

function buildingHeight(tags = {}) {
  const h = Number.parseFloat(tags.height || tags["building:height"] || "");
  if (Number.isFinite(h) && h > 1) return Math.min(h, 80);
  const levels = Number.parseFloat(tags["building:levels"] || "");
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 80);
  if (["apartments", "office", "commercial", "university", "dormitory", "hotel"].includes(tags.building)) return 9.6;
  return 3.6;
}

function cleanTags(tags = {}) {
  const keep = ["name", "highway", "building", "building:levels", "height", "lanes", "oneway", "surface", "amenity", "shop", "landuse", "brand"];
  return Object.fromEntries(keep.filter(k => tags[k] != null).map(k => [k, tags[k]]));
}

const bboxString = (bb) => `${bb.south},${bb.west},${bb.north},${bb.east}`;
const QUERIES = {
  network: (bb) => {
    const b = bboxString(bb);
    return `[out:json][timeout:240][maxsize:1073741824];(
      way["highway"](${b});
      node["amenity"](${b});
      node["shop"](${b});
      way["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery|farmland|orchard|village_green|brownfield|greenfield)$"](${b});
      way["natural"~"^(wood|scrub|grassland|heath|wetland|water)$"](${b});
      way["leisure"~"^(park|pitch|golf_course|garden|nature_reserve|stadium)$"](${b});
      relation["landuse"~"^(forest|grass|meadow|recreation_ground|cemetery)$"](${b});
      relation["natural"~"^(wood|scrub|grassland|wetland|water)$"](${b});
      relation["leisure"~"^(park|golf_course|nature_reserve)$"](${b});
    );out body geom;`;
  },
  buildings: (bb) => `[out:json][timeout:240][maxsize:1073741824];(way["building"](${bboxString(bb)}););out body geom;`,
};

/** Public Overpass servers time out on the whole area, so fetch a grid of tiles and merge. */
async function fetchTiled(name, n = 3) {
  const seen = new Set();
  const elements = [];
  const dLat = (BBOX.north - BBOX.south) / n, dLon = (BBOX.east - BBOX.west) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const bb = { south: BBOX.south + i * dLat, north: BBOX.south + (i + 1) * dLat, west: BBOX.west + j * dLon, east: BBOX.west + (j + 1) * dLon };
    const json = await fetchOverpass(name, bb, `${name}-${i}-${j}`);
    for (const el of json.elements || []) {
      const key = `${el.type}/${el.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      elements.push(el);
    }
  }
  return { elements };
}

async function fetchOverpass(name, bb, cacheName) {
  if (cacheDir) {
    try { return JSON.parse(await fs.readFile(path.join(cacheDir, `${cacheName}.json`), "utf8")); } catch { /* fetch */ }
  }
  const body = new URLSearchParams({ data: QUERIES[name](bb) }).toString();
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`  ${cacheName}: ${endpoint}`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": USER_AGENT, accept: "application/json" },
        body,
      });
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      const json = await res.json();
      if (cacheDir) {
        await fs.mkdir(cacheDir, { recursive: true });
        await fs.writeFile(path.join(cacheDir, `${cacheName}.json`), JSON.stringify(json));
      }
      return json;
    } catch (err) {
      lastError = err;
      console.warn(`  Overpass failed at ${endpoint}:`, err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw lastError || new Error("All Overpass endpoints failed");
}

// ---------- land cover ----------
function coverKind(tags = {}) {
  const v = tags.landuse || tags.natural || tags.leisure;
  if (["forest", "wood", "orchard", "nature_reserve"].includes(v)) return "forest";
  if (["scrub", "heath", "brownfield", "greenfield"].includes(v)) return "scrub";
  if (["wetland"].includes(v)) return "wetland";
  if (["water"].includes(v)) return "water";
  if (["pitch", "stadium"].includes(v)) return "pitch";
  if (["grass", "meadow", "recreation_ground", "village_green", "grassland", "park", "garden", "golf_course", "cemetery", "farmland"].includes(v)) return "grass";
  return null;
}

/** Douglas–Peucker simplification; closed rings are split at their farthest point first. */
function simplify(points, tol) {
  if (points.length >= 4 && dist(points[0], points[points.length - 1]) < 0.01) {
    let far = 1;
    for (let i = 1; i < points.length - 1; i++) if (dist(points[0], points[i]) > dist(points[0], points[far])) far = i;
    const head = simplifyOpen(points.slice(0, far + 1), tol);
    const tail = simplifyOpen(points.slice(far), tol);
    return head.concat(tail.slice(1));
  }
  return simplifyOpen(points, tol);
}

function simplifyOpen(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = points[s], b = points[e];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    let best = -1, bestD = tol;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((points[i].x - a.x) * dz - (points[i].z - a.z) * dx) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0) { keep[best] = 1; stack.push([s, best], [best, e]); }
  }
  return points.filter((_, i) => keep[i]);
}

function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].z - pts[i].z);
  return Math.abs(a / 2);
}

/** Stitch relation outer ways into closed rings. */
function stitchRings(ways) {
  const rings = [];
  const pool = ways.map(w => w.slice());
  while (pool.length) {
    let ring = pool.shift();
    let grew = true;
    while (grew && dist(ring[0], ring[ring.length - 1]) > 0.5) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], end = ring[ring.length - 1];
        if (dist(w[0], end) < 0.5) { ring = ring.concat(w.slice(1)); }
        else if (dist(w[w.length - 1], end) < 0.5) { ring = ring.concat(w.slice(0, -1).reverse()); }
        else continue;
        pool.splice(i, 1); grew = true; break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

function normalize(network, buildingsRaw) {
  const roads = [];
  const buildings = [];
  const pois = [];
  const cover = [];

  for (const el of network.elements || []) {
    const tags = el.tags || {};
    if (el.type === "way" && tags.highway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      roads.push({
        id: `osm-way-${el.id}`,
        osmId: el.id,
        highway: tags.highway,
        name: tags.name || null,
        width: roadWidth(tags),
        oneWay: ["yes", "1", "true"].includes(tags.oneway),
        surface: tags.surface || null,
        points: el.geometry.map(p => project(p.lat, p.lon)),
        nodeIds: Array.isArray(el.nodes) ? el.nodes : [],
        tags: cleanTags(tags),
      });
    } else if (el.type === "node" && (tags.amenity || tags.shop)) {
      const p = project(el.lat, el.lon);
      pois.push({ id: `osm-node-${el.id}`, osmId: el.id, x: p.x, z: p.z, tags: cleanTags(tags) });
    } else if (coverKind(tags)) {
      const kind = coverKind(tags);
      let rings = [];
      if (el.type === "way" && el.geometry?.length >= 4) rings = [el.geometry.map(p => project(p.lat, p.lon))];
      else if (el.type === "relation") {
        const outers = (el.members || []).filter(m => m.type === "way" && m.role !== "inner" && m.geometry?.length >= 2)
          .map(m => m.geometry.map(p => project(p.lat, p.lon)));
        rings = stitchRings(outers);
      }
      for (const ring of rings) {
        const pts = simplify(ring, kind === "water" ? 1.5 : 3);
        if (pts.length < 4 || polygonArea(pts) < 300) continue;
        cover.push({ kind, points: pts.map(p => [p.x, p.z]) });
      }
    }
  }

  for (const el of buildingsRaw.elements || []) {
    if (el.type !== "way" || !el.tags?.building || !Array.isArray(el.geometry) || el.geometry.length < 4) continue;
    buildings.push({
      id: `osm-building-${el.id}`,
      osmId: el.id,
      height: buildingHeight(el.tags),
      footprint: el.geometry.map(p => project(p.lat, p.lon)),
      tags: cleanTags(el.tags),
    });
  }

  // Compact routing graph: nodes are [x,z]; edges are [from, to, length, highwayIndex, oneWay].
  const nodeIndex = new Map();
  const nodes = [];
  const highways = [];
  const edges = [];
  const idx = (key, p) => {
    let i = nodeIndex.get(key);
    if (i === undefined) { i = nodes.length; nodeIndex.set(key, i); nodes.push([p.x, p.z]); }
    return i;
  };
  for (const road of roads) {
    if (NON_DRIVABLE.has(road.highway)) continue;
    let hw = highways.indexOf(road.highway);
    if (hw < 0) { hw = highways.length; highways.push(road.highway); }
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const length = dist(a, b);
      if (length < 0.2) continue;
      const ai = idx(road.nodeIds[i] != null ? `n${road.nodeIds[i]}` : `${road.id}:${i}`, a);
      const bi = idx(road.nodeIds[i + 1] != null ? `n${road.nodeIds[i + 1]}` : `${road.id}:${i + 1}`, b);
      edges.push([ai, bi, r1(length), hw, road.oneWay ? 1 : 0]);
    }
  }

  return { roads, buildings, pois, cover, graph: { v: 2, highways, nodes, edges } };
}

/** Split a segment wherever it crosses a chunk grid line. */
function splitAtGrid(a, b) {
  const ts = [0, 1];
  for (const axis of ["x", "z"]) {
    const lo = Math.min(a[axis], b[axis]), hi = Math.max(a[axis], b[axis]);
    for (let k = Math.ceil(lo / CHUNK_SIZE); k * CHUNK_SIZE < hi; k++) {
      const t = (k * CHUNK_SIZE - a[axis]) / (b[axis] - a[axis]);
      if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
    }
  }
  ts.sort((p, q) => p - q);
  const at = t => ({ x: r1(a.x + (b.x - a.x) * t), z: r1(a.z + (b.z - a.z) * t) });
  const pieces = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const p = at(ts[i]), q = at(ts[i + 1]);
    if (dist(p, q) > 0.05) pieces.push([p, q]);
  }
  return pieces;
}

function assignChunks(data) {
  const chunks = new Map();
  const get = (cx, cz) => {
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, { key, cx, cz, roads: [], buildings: [], pois: [] });
    return chunks.get(key);
  };
  for (const road of data.roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      splitAtGrid(road.points[i], road.points[i + 1]).forEach(([a, b], j) => {
        get(chunkCoord((a.x + b.x) / 2), chunkCoord((a.z + b.z) / 2)).roads.push({
          id: `${road.id}:${i}${j ? `.${j}` : ""}`,
          osmId: road.osmId,
          highway: road.highway,
          name: road.name,
          width: road.width,
          oneWay: road.oneWay,
          surface: road.surface,
          points: [a, b],
          tags: road.tags,
        });
      });
    }
  }
  for (const b of data.buildings) {
    const x = b.footprint.reduce((s, p) => s + p.x, 0) / b.footprint.length;
    const z = b.footprint.reduce((s, p) => s + p.z, 0) / b.footprint.length;
    get(chunkCoord(x), chunkCoord(z)).buildings.push(b);
  }
  for (const p of data.pois) get(chunkCoord(p.x), chunkCoord(p.z)).pois.push(p);
  return chunks;
}

// ---------- delivery sites ----------
function segmentIndex(roads, filter) {
  const cells = new Map();
  const CELL = 64;
  for (const road of roads) {
    if (!filter(road)) continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const seg = { a, b, road };
      const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z) / CELL), z1 = Math.floor(Math.max(a.z, b.z) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = `${x}:${z}`;
        if (!cells.has(k)) cells.set(k, []);
        cells.get(k).push(seg);
      }
    }
  }
  return (p, radius) => {
    let best = null;
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    for (let x = cx - r; x <= cx + r; x++) for (let z = cz - r; z <= cz + r; z++) {
      for (const s of cells.get(`${x}:${z}`) || []) {
        const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, len2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / len2));
        const q = { x: s.a.x + dx * t, z: s.a.z + dz * t };
        const d = dist(p, q);
        if (d <= radius && (!best || d < best.d)) best = { d, q, road: s.road, dir: Math.atan2(dx, dz) };
      }
    }
    return best;
  };
}

function buildSites(data) {
  const drivable = segmentIndex(data.roads, r => !NON_DRIVABLE.has(r.highway) && !["motorway", "trunk", "motorway_link", "trunk_link"].includes(r.highway));
  const homeRoads = segmentIndex(data.roads, r => DROP_ROADS.has(r.highway));
  const named = segmentIndex(data.roads, r => !!r.name && !NON_DRIVABLE.has(r.highway));
  const landmarks = data.pois.filter(p => p.tags?.name && (p.tags.amenity || p.tags.shop) && !["parking", "toilets", "atm", "bench", "waste_basket"].includes(p.tags.amenity));
  const nearestLandmark = (p, radius) => {
    let best = null;
    for (const l of landmarks) {
      const d = dist(p, l);
      if (d < radius && (!best || d < best.d)) best = { d, name: l.tags.name };
    }
    return best?.name ?? null;
  };

  const vendors = [];
  for (const poi of data.pois) {
    const t = poi.tags || {};
    if (!FOOD_AMENITY.has(t.amenity) && !FOOD_SHOP.has(t.shop)) continue;
    const snap = drivable(poi, 70);
    if (!snap) continue;
    vendors.push({
      x: r1(snap.q.x), z: r1(snap.q.z), yaw: r1(snap.dir * 100) / 100,
      kind: t.amenity || t.shop,
      near: t.name || nearestLandmark(poi, 200),
      road: snap.road.name || named(snap.q, 120)?.road.name || null,
    });
  }

  // One home per ~70 m cell keeps drops spread across every neighbourhood.
  const taken = new Set();
  const drops = [];
  for (const b of data.buildings) {
    const tags = b.tags || {};
    if (!HOME_BUILDINGS.has(tags.building)) continue;
    const area = polygonArea(b.footprint);
    if (area < 50 || area > 2500) continue;
    const c = { x: b.footprint.reduce((s, p) => s + p.x, 0) / b.footprint.length, z: b.footprint.reduce((s, p) => s + p.z, 0) / b.footprint.length };
    const cell = `${Math.floor(c.x / 70)}:${Math.floor(c.z / 70)}`;
    if (taken.has(cell)) continue;
    const snap = homeRoads(c, 40);
    if (!snap || snap.d < 4) continue;
    taken.add(cell);
    // Gate sits at the property line on the road side, facing the road.
    const half = snap.road.width / 2 + 2.6;
    const k = Math.min(1, half / Math.max(snap.d, 0.01));
    drops.push({
      x: r1(snap.q.x), z: r1(snap.q.z),
      gx: r1(snap.q.x + (c.x - snap.q.x) * k), gz: r1(snap.q.z + (c.z - snap.q.z) * k),
      yaw: r1(Math.atan2(snap.q.x - c.x, snap.q.z - c.z) * 100) / 100,
      kind: tags.building === "dormitory" || /hall|hostel|lodge/i.test(tags.name || "") ? "hostel" : "home",
      name: tags.name || null,
      road: snap.road.name || named(snap.q, 150)?.road.name || null,
      near: nearestLandmark(c, 300),
    });
  }
  return { vendors, drops };
}

const LANDMARKS = [
  { id: "night-market", name: "Night Market", lat: 5.6425, lon: -0.18628, kind: "marketplace" },
  { id: "okponglo", name: "Okponglo Roundabout", lat: 5.64077, lon: -0.18375, kind: "junction" },
  { id: "legon-traffic-light", name: "Legon Traffic Light", lat: 5.64055, lon: -0.17925, kind: "junction" },
  { id: "legon-post-office", name: "Legon Post Office", lat: 5.65090, lon: -0.18763, kind: "poi" },
  { id: "upsa", name: "UPSA", lat: 5.66155, lon: -0.16638, kind: "university" },
  { id: "madina", name: "Madina", lat: 5.6800, lon: -0.1660, kind: "district" },
  { id: "east-legon", name: "East Legon", lat: 5.6370, lon: -0.1560, kind: "district" },
  { id: "shiashie", name: "Shiashie", lat: 5.6230, lon: -0.1720, kind: "district" },
  { id: "tetteh-quarshie", name: "Tetteh Quarshie Interchange", lat: 5.6170, lon: -0.1745, kind: "junction" },
].map(p => ({ ...p, ...project(p.lat, p.lon) }));

async function main() {
  console.log("Fetching OSM data for Legon · East Legon · Madina · Shiashie…");
  const readSource = async name => JSON.parse(await fs.readFile(path.join(sourceDir, `${name}.json`), "utf8"));
  const network = sourceDir ? await readSource("network") : await fetchTiled("network");
  const buildingsRaw = sourceDir ? await readSource("buildings") : await fetchTiled("buildings");
  const data = normalize(network, buildingsRaw);
  const chunks = assignChunks(data);
  const sites = buildSites(data);

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, "chunks"), { recursive: true });
  for (const chunk of chunks.values()) {
    await fs.writeFile(path.join(outDir, "chunks", `${chunk.key}.json`), JSON.stringify(chunk));
  }
  await fs.writeFile(path.join(outDir, "graph.json"), JSON.stringify(data.graph));
  await fs.writeFile(path.join(outDir, "pois.json"), JSON.stringify(data.pois));
  await fs.writeFile(path.join(outDir, "landcover.json"), JSON.stringify(data.cover));
  await fs.writeFile(path.join(outDir, "sites.json"), JSON.stringify(sites));
  await fs.writeFile(path.join(outDir, "locations.json"), JSON.stringify(LANDMARKS, null, 2));
  const sw = project(BBOX.south, BBOX.west), ne = project(BBOX.north, BBOX.east);
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    version: 2,
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap via Overpass API",
    attribution: "Map data © OpenStreetMap contributors",
    license: "ODbL-1.0",
    origin: ORIGIN,
    bbox: BBOX,
    bounds: { minX: sw.x, maxX: ne.x, minZ: ne.z, maxZ: sw.z },
    chunkSize: CHUNK_SIZE,
    counts: {
      roads: data.roads.length, buildings: data.buildings.length, pois: data.pois.length,
      graphNodes: data.graph.nodes.length, graphEdges: data.graph.edges.length,
      landcover: data.cover.length, vendors: sites.vendors.length, drops: sites.drops.length,
    },
    chunks: [...chunks.values()].map(c => ({ key: c.key, cx: c.cx, cz: c.cz, roads: c.roads.length, buildings: c.buildings.length, pois: c.pois.length })),
  }, null, 2));

  console.log(`Wrote ${chunks.size} chunks to ${outDir}`);
  console.log(`${data.roads.length} roads · ${data.buildings.length} buildings · ${data.pois.length} POIs · ${data.cover.length} land-cover areas`);
  console.log(`${sites.vendors.length} vendor sites · ${sites.drops.length} drop sites · ${data.graph.nodes.length} graph nodes`);
}

main().catch(err => { console.error(err); process.exit(1); });
