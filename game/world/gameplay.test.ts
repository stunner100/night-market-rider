import assert from "node:assert/strict";
import test from "node:test";
import { formatMetres, formatWorldDistance, polylineLength, remainingPolylineMetres } from "./distance";
import { CORRIDOR_FUEL, CRUISE_FUEL_PER_SECOND, missingFuelAnchors } from "./fuel-stations";
import { visibleFuel } from "./minimap-data";
import { allowsPothole, planHazards, type RoadSample } from "./hazard-placement";
import { cueFromRoute } from "./navigation";
import { pickContinuation } from "./road-follow";
import { chooseRoadside, offsetSide, rampYaw, type RoadFrame } from "./roadside-placement";
import { allowsVehicle, goatRoadOk, pedestrianSpawnOk, vehicleSpawnOk } from "./spawn-validity";
import { makeOrder, separateOrderFromRider } from "../store";

const straight: RoadFrame = {
  x: 5, z: 0, tangentX: 1, tangentZ: 0, normalX: 0, normalZ: 1,
  width: 6, highway: "residential", roadId: "r", t: 0.5, segmentLength: 10, segmentIndex: 0,
};

test("formats OSM metres without the old x8 scale", () => {
  assert.equal(formatMetres(95), "95 m");
  assert.equal(formatMetres(420), "420 m");
  assert.equal(formatMetres(1200), "1.2 km");
  assert.equal(formatMetres(10500), "11 km");
  assert.equal(formatWorldDistance(95, "osm"), "95 m");
  assert.equal(formatWorldDistance(10, "procedural"), "80 m");
});

test("route length follows the road instead of the chord", () => {
  const route = [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 80, z: 100 }];
  assert.equal(polylineLength(route), 180);
  assert.equal(remainingPolylineMetres(route, 0, 40), 140);
  assert.ok(polylineLength(route) > Math.hypot(80, 100));
});

test("turn cues come from the upcoming road geometry", () => {
  const route = [{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 80, z: 100 }];
  const cue = cueFromRoute(route, 0, 20, 0);
  assert.equal(cue.text, "← TURN LEFT IN 80 m");
  assert.equal(Math.round(cue.remaining), 160);

  const straightRoad = [{ x: 0, z: 0 }, { x: 0, z: 400 }];
  const ahead = cueFromRoute(straightRoad, 0, 50, 0);
  assert.equal(ahead.text, "CONTINUE 350 m");

  const close = cueFromRoute(straightRoad, 0, 380, 0);
  assert.equal(close.text, "DESTINATION AHEAD");
});

test("roadside placement sits off the carriageway", () => {
  const spot = offsetSide(straight, 1, 1.5);
  assert.equal(spot.x, 5);
  assert.equal(spot.z, 4.5);
  const placed = chooseRoadside({
    nearestFrame: () => straight,
    blocked: () => false,
  }, 5, 0);
  assert.ok(placed);
  assert.ok(Math.abs(placed.z) > straight.width * 0.5);
  assert.equal(rampYaw(0, 1), Math.atan2(-1, 0));
});

test("hazard placement is deterministic and skips highways and junctions", () => {
  assert.equal(allowsPothole("trunk"), false);
  assert.equal(allowsPothole("residential"), true);
  const base: RoadSample = {
    roadId: "market-road", highway: "residential", width: 6,
    ax: 0, az: 0, bx: 40, bz: 0, length: 40, index: 0,
  };
  let pothole: RoadSample | null = null;
  for (let index = 0; index < 80 && !pothole; index++) {
    const segment = { ...base, index, roadId: `road-${index}` };
    const spots = planHazards([segment], [], { x: 1000, z: 1000 }, 5000);
    if (spots.some(spot => spot.kind === "pothole")) pothole = segment;
  }
  assert.ok(pothole);
  const once = planHazards([pothole], [], { x: 0, z: 0 }, 5000);
  const twice = planHazards([pothole], [], { x: 0, z: 0 }, 5000);
  assert.deepEqual(once, twice);
  const spot = once.find(item => item.kind === "pothole");
  assert.ok(spot);
  assert.equal(spot.x, 20);
  assert.equal(spot.z, 0);
  const cleared = planHazards([pothole], [{ x: spot.x, z: spot.z, r: 8 }], { x: 0, z: 0 }, 5000);
  assert.equal(cleared.some(item => item.kind === "pothole"), false);
  const trunk = planHazards(
    [{ ...base, highway: "trunk", roadId: "highway", index: 3 }],
    [],
    { x: 0, z: 0 },
    5000,
  );
  assert.equal(trunk.some(item => item.kind === "pothole"), false);
  const junction = planHazards([{ ...base, length: 8, bx: 8 }], [], { x: 0, z: 0 }, 5000);
  assert.equal(junction.length, 0);
});

test("spawn checks keep vehicles and people out of bad places", () => {
  assert.equal(vehicleSpawnOk({ x: 0, z: 0, playerX: 2, playerZ: 0, inBuilding: false, minPlayer: 16 }), false);
  assert.equal(vehicleSpawnOk({ x: 30, z: 0, playerX: 0, playerZ: 0, inBuilding: true }), false);
  assert.equal(vehicleSpawnOk({ x: 30, z: 0, playerX: 0, playerZ: 0, inBuilding: false }), true);
  assert.equal(allowsVehicle("bus", "residential"), false);
  assert.equal(allowsVehicle("bus", "service"), false);
  assert.equal(allowsVehicle("bus", "tertiary"), true);
  assert.equal(allowsVehicle("trotro", "residential"), true);
  assert.equal(allowsVehicle("trotro", "service"), true);
  assert.equal(allowsVehicle("okada", "service"), true);
  assert.equal(allowsVehicle("okada", "motorway"), false);
  assert.equal(goatRoadOk("trunk"), false);
  assert.equal(goatRoadOk("residential"), true);
  assert.equal(pedestrianSpawnOk({
    x: 0, z: 4, playerX: 40, playerZ: 0, inBuilding: false,
    highway: "trunk", distFromCenter: 0.4, roadWidth: 8,
  }), false);
  assert.equal(pedestrianSpawnOk({
    x: 0, z: 6, playerX: 40, playerZ: 0, inBuilding: false,
    highway: "residential", distFromCenter: 4, roadWidth: 6,
  }), true);
});

test("a traffic-slowed kilometre of cruising ends near a third of a tank", () => {
  const seconds = 1200 / 6;
  const left = 100 - CRUISE_FUEL_PER_SECOND * seconds;
  assert.ok(left > 30 && left < 45, `left ${left}`);
});

test("corridor stations fill gaps and skip spots that already have fuel", () => {
  const needed = missingFuelAnchors([]);
  assert.equal(needed.length, CORRIDOR_FUEL.length);
  const okponglo = CORRIDOR_FUEL.find(anchor => anchor.id === "authored-okponglo-fuel");
  assert.ok(okponglo);
  const covered = missingFuelAnchors([{ x: okponglo.x, z: okponglo.z }]);
  assert.equal(covered.some(anchor => anchor.id === okponglo.id), false);
  assert.ok(covered.some(anchor => anchor.id === "authored-legon-fuel"));
});

test("the first pickup is a few hundred metres from the rider", () => {
  const moved = separateOrderFromRider(makeOrder(0), 0, -18, 0);
  const pickup = Math.hypot(moved.pickupX - 0, moved.pickupZ - (-18));
  assert.ok(pickup >= 280, `pickup ${pickup}`);
  assert.ok(pickup < 900);
  assert.ok(moved.dropoff.length > 2);
  assert.ok(Math.hypot(moved.dropX - moved.pickupX, moved.dropZ - moved.pickupZ) >= 280);
});

test("the nearest fuel station stays on the minimap beyond the road radius", () => {
  const farOnly = visibleFuel([{ x: 500, z: 0 }], 0, 0, 130);
  assert.equal(farOnly.length, 1);
  assert.equal(farOnly[0].x, 500);
  assert.equal(visibleFuel([{ x: 40, z: 0 }, { x: 500, z: 0 }], 0, 0, 130).length, 1);
  assert.equal(visibleFuel([{ x: 2000, z: 0 }], 0, 0, 130).length, 0);
});

test("traffic prefers the straight continuation", () => {
  const index = pickContinuation([
    { dirX: 0, dirZ: 1 },
    { dirX: 1, dirZ: 0 },
  ], 0, 1, 0);
  assert.equal(index, 0);
});
