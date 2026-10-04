#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const EARTH_R = 6378137;
const CHUNK_SIZE = 256;
const ORIGIN = { lat: 5.6425, lon: -0.18628, name: "UG Night Market" };
const BBOX = { south: 5.6380, west: -0.1915, north: 5.6645, east: -0.1625 };
const USER_AGENT = "NightMarketRider/0.2 (+https://night-market-rider.vercel.app; OSM world baker)";
const ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];
const NON_DRIVABLE = new Set(["footway", "path", "pedestrian", "cycleway", "steps", "corridor", "bridleway"]);

const argv = process.argv.slice(2);
const outArg = argv.indexOf("--out");
const outDir = path.resolve(outArg >= 0 ? argv[outArg + 1] : "public/world/accra");

function project(lat, lon) {
  const lat0 = ORIGIN.lat * Math.PI / 180;
  return {
    x: (lon - ORIGIN.lon) * Math.PI / 180 * EARTH_R * Math.cos(lat0),
    z: -(lat - ORIGIN.lat) * Math.PI / 180 * EARTH_R,
  };
}

function chunkCoord(v) { return Math.floor(v / CHUNK_SIZE); }
function chunkKey(x, z) { return `${x}_${z}`; }
function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

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
  return byClass[tags.highway] ?? 5.5;
}

function buildingHeight(tags = {}) {
  const h = Number.parseFloat(tags.height || tags["building:height"] || "");
  if (Number.isFinite(h) && h > 1) return Math.min(h, 80);
  const levels = Number.parseFloat(tags["building:levels"] || "");
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 80);
  const type = tags.building;
  if (["apartments", "office", "commercial", "university"].includes(type)) return 9.6;
  return 3.6;
}

function cleanTags(tags = {}) {
  const keep = ["name", "highway", "building", "building:levels", "height", "lanes", "oneway", "surface", "amenity", "shop", "landuse"];
  return Object.fromEntries(keep.filter(k => tags[k] != null).map(k => [k, tags[k]]));
}

function buildQuery() {
  const b = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
  return `[out:json][timeout:60];(way["highway"](${b});way["building"](${b});node["amenity"](${b});node["shop"](${b}););out body geom;`;
}

async function fetchOverpass() {
  const body = new URLSearchParams({ data: buildQuery() }).toString();
  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": USER_AGENT,
          accept: "application/json",
        },
        body,
      });
      if (!res.ok) throw new Error(`${endpoint} returned ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      console.warn(`Overpass failed at ${endpoint}:`, err.message);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastError || new Error("All Overpass endpoints failed");
}

function normalize(raw) {
  const roads = [];
  const buildings = [];
  const pois = [];

  for (const el of raw.elements || []) {
    if (el.type === "way" && el.tags?.highway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const points = el.geometry.map(p => project(p.lat, p.lon));
      roads.push({
        id: `osm-way-${el.id}`,
        osmId: el.id,
        highway: el.tags.highway,
        name: el.tags.name || null,
        width: roadWidth(el.tags),
        oneWay: ["yes", "1", "true"].includes(el.tags.oneway),
        surface: el.tags.surface || null,
        points,
        nodeIds: Array.isArray(el.nodes) ? el.nodes : [],
        tags: cleanTags(el.tags),
      });
    } else if (el.type === "way" && el.tags?.building && Array.isArray(el.geometry) && el.geometry.length >= 4) {
      const footprint = el.geometry.map(p => project(p.lat, p.lon));
      buildings.push({
        id: `osm-building-${el.id}`,
        osmId: el.id,
        height: buildingHeight(el.tags),
        footprint,
        tags: cleanTags(el.tags),
      });
    } else if (el.type === "node" && (el.tags?.amenity || el.tags?.shop)) {
      const p = project(el.lat, el.lon);
      pois.push({ id: `osm-node-${el.id}`, osmId: el.id, x: p.x, z: p.z, tags: cleanTags(el.tags) });
    }
  }

  const graphNodes = new Map();
  const graphEdges = [];
  for (const road of roads) {
    if (NON_DRIVABLE.has(road.highway)) continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const aid = road.nodeIds[i] != null ? `n${road.nodeIds[i]}` : `${road.id}:${i}`;
      const bid = road.nodeIds[i + 1] != null ? `n${road.nodeIds[i + 1]}` : `${road.id}:${i + 1}`;
      graphNodes.set(aid, { id: aid, x: a.x, z: a.z });
      graphNodes.set(bid, { id: bid, x: b.x, z: b.z });
      const length = dist(a, b);
      if (length < 0.2) continue;
      graphEdges.push({ id: `${road.id}:${i}:f`, from: aid, to: bid, length, roadId: road.id, highway: road.highway });
      if (!road.oneWay) graphEdges.push({ id: `${road.id}:${i}:r`, from: bid, to: aid, length, roadId: road.id, highway: road.highway });
    }
  }

  return { roads, buildings, pois, graph: { nodes: [...graphNodes.values()], edges: graphEdges } };
}

function assignChunks(data) {
  const chunks = new Map();
  const get = (cx, cz) => {
    const key = chunkKey(cx, cz);
    if (!chunks.has(key)) chunks.set(key, { key, cx, cz, roads: [], buildings: [], pois: [] });
    return chunks.get(key);
  };

  for (const road of data.roads) {
    const minX = Math.min(...road.points.map(p => p.x));
    const maxX = Math.max(...road.points.map(p => p.x));
    const minZ = Math.min(...road.points.map(p => p.z));
    const maxZ = Math.max(...road.points.map(p => p.z));
    for (let cx = chunkCoord(minX); cx <= chunkCoord(maxX); cx++) {
      for (let cz = chunkCoord(minZ); cz <= chunkCoord(maxZ); cz++) get(cx, cz).roads.push(road);
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

const LANDMARKS = [
  { id: "night-market", name: "Night Market", lat: 5.6425, lon: -0.18628, kind: "marketplace" },
  { id: "okponglo", name: "Okponglo Roundabout", lat: 5.64077, lon: -0.18375, kind: "junction" },
  { id: "legon-traffic-light", name: "Legon Traffic Light", lat: 5.64055, lon: -0.17925, kind: "junction" },
  { id: "legon-post-office", name: "Legon Post Office", lat: 5.65090, lon: -0.18763, kind: "poi" },
  { id: "upsa", name: "UPSA", lat: 5.66155, lon: -0.16638, kind: "university" },
].map(p => ({ ...p, ...project(p.lat, p.lon) }));

async function main() {
  console.log("Fetching OSM data for Legon → Okponglo → UPSA…");
  const raw = await fetchOverpass();
  const data = normalize(raw);
  const chunks = assignChunks(data);

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, "chunks"), { recursive: true });

  for (const chunk of chunks.values()) {
    await fs.writeFile(path.join(outDir, "chunks", `${chunk.key}.json`), JSON.stringify(chunk));
  }
  await fs.writeFile(path.join(outDir, "graph.json"), JSON.stringify(data.graph));
  await fs.writeFile(path.join(outDir, "locations.json"), JSON.stringify(LANDMARKS, null, 2));
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "OpenStreetMap via Overpass API",
    attribution: "Map data © OpenStreetMap contributors",
    license: "ODbL-1.0",
    origin: ORIGIN,
    bbox: BBOX,
    chunkSize: CHUNK_SIZE,
    counts: { roads: data.roads.length, buildings: data.buildings.length, pois: data.pois.length, graphNodes: data.graph.nodes.length, graphEdges: data.graph.edges.length },
    chunks: [...chunks.values()].map(c => ({ key: c.key, cx: c.cx, cz: c.cz, roads: c.roads.length, buildings: c.buildings.length, pois: c.pois.length })),
  }, null, 2));

  console.log(`Wrote ${chunks.size} chunks to ${outDir}`);
  console.log(`${data.roads.length} roads · ${data.buildings.length} buildings · ${data.graph.nodes.length} drivable graph nodes`);
}

main().catch(err => { console.error(err); process.exit(1); });
