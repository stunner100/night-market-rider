import assert from "node:assert/strict";
import test from "node:test";
import { buildOrder, separateOrderFromRider, MIN_PICKUP_METRES, VENDORS } from "./orders";

test("orders use expanded Accra vendor templates", () => {
  assert.ok(VENDORS.length >= 12);
  const order = buildOrder(0);
  assert.match(order.vendor, / · /);
  assert.ok(order.emoji.length > 0);
  assert.ok(Math.hypot(order.dropX - order.pickupX, order.dropZ - order.pickupZ) >= MIN_PICKUP_METRES);
});

test("pickup separation keeps vendor and drop far from rider", () => {
  const moved = separateOrderFromRider(buildOrder(0), 0, -18, 0);
  const pickup = Math.hypot(moved.pickupX - 0, moved.pickupZ - (-18));
  assert.ok(pickup >= MIN_PICKUP_METRES, `pickup ${pickup}`);
  assert.ok(Math.hypot(moved.dropX - moved.pickupX, moved.dropZ - moved.pickupZ) >= MIN_PICKUP_METRES);
  assert.notEqual(moved.dropoff, moved.vendor.split(" · ").pop());
});

test("orders vary pickup pads across indices", () => {
  const pads = new Set([0, 3, 7].map(index => `${buildOrder(index).pickupX.toFixed(0)},${buildOrder(index).pickupZ.toFixed(0)}`));
  assert.ok(pads.size >= 2);
});
