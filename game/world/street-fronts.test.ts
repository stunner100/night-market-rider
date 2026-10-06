import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { distancePointToSegment } from "./coordinates";
import { planStreetFronts } from "./street-fronts";
import type { WorldChunk } from "./types";

const chunk: WorldChunk = {
  key: "t",
  cx: 0,
  cz: 0,
  roads: [{
    id: "market-road",
    highway: "unclassified",
    width: 8,
    points: [{ x: 0, z: 0 }, { x: 80, z: 0 }],
  }],
  buildings: [{
    id: "block",
    height: 6,
    footprint: [
      { x: 40, z: 6 },
      { x: 52, z: 6 },
      { x: 52, z: 16 },
      { x: 40, z: 16 },
    ],
  }],
  pois: [],
};

function insideBlock(x: number, z: number): boolean {
  return x > 40 && x < 52 && z > 6 && z < 16;
}

test("street fronts hug the road, avoid buildings, and stay deterministic", () => {
  const once = planStreetFronts(chunk, false);
  const twice = planStreetFronts(chunk, false);
  assert.deepEqual(once, twice);
  assert.ok(once.fronts.length >= 8);
  assert.ok(once.parked.some(item => item.kind === "okada"));
  assert.ok(once.fronts.some(front => front.z > 0));
  assert.ok(once.fronts.some(front => front.z < 0));

  for (const front of once.fronts) {
    assert.ok(front.footprint.length === 4);
    for (const point of front.footprint) {
      const clearance = distancePointToSegment(point.x, point.z, 0, 0, 80, 0);
      assert.ok(clearance > 4.3, `front clipped the carriageway at ${clearance}`);
      assert.equal(insideBlock(point.x, point.z), false);
    }
  }
  for (const vehicle of once.parked) {
    for (const point of vehicle.footprint) {
      assert.equal(insideBlock(point.x, point.z), false);
      const clearance = distancePointToSegment(point.x, point.z, 0, 0, 80, 0);
      assert.ok(clearance > 4.2, `parked ${vehicle.kind} clipped the road at ${clearance}`);
    }
  }
});

test("mobile plans fewer fronts than desktop on the Accra spawn chunk", () => {
  const raw = JSON.parse(fs.readFileSync("public/world/accra/chunks/0_0.json", "utf8")) as WorldChunk;
  const desktop = planStreetFronts(raw, false);
  const mobile = planStreetFronts(raw, true);
  assert.ok(desktop.fronts.length >= 12);
  assert.ok(mobile.fronts.length > 0);
  assert.ok(mobile.fronts.length <= desktop.fronts.length);
  const signs = new Set(desktop.fronts.map(front => front.sign));
  assert.ok(signs.size >= 4);
});
