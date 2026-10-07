import assert from "node:assert/strict";
import test from "node:test";
import { activateEvents, eventModifiers, planNightEvents } from "./night-events";

test("plans spaced events without duplicates by default", () => {
  const planned = planNightEvents(3);
  assert.ok(planned.length >= 2 && planned.length <= 3);
  const kinds = planned.map(event => event.kind);
  assert.equal(new Set(kinds).size, kinds.length);
  assert.ok(planned[0].startAtSec < planned[planned.length - 1].startAtSec);
});

test("forced debug events fire quickly in sequence", () => {
  const planned = planNightEvents(0, ["rain_shower", "order_surge"]);
  assert.equal(planned.length, 2);
  assert.equal(planned[0].kind, "rain_shower");
  let active = activateEvents(planned, 0, []);
  assert.equal(active.length, 0);
  active = activateEvents(planned, 8, []);
  assert.equal(active.length, 1);
  assert.equal(active[0].kind, "rain_shower");
});

test("surge raises payout and rain reduces steering", () => {
  const planned = planNightEvents(0, ["order_surge", "rain_shower", "police_checkpoint"]);
  let active = activateEvents(planned, 8, []);
  active = activateEvents(planned, 26, active);
  const mods = eventModifiers(active, 280, 192);
  assert.ok(mods.payoutMult >= 1.35);
  assert.ok(mods.steerMult < 1);
  assert.ok(mods.fogMult > 1);
});

test("police checkpoint caps speed near the junction", () => {
  const planned = planNightEvents(0, ["police_checkpoint"]);
  const active = activateEvents(planned, 8, []);
  assert.ok(active[0]?.checkpoint);
  const { x, z } = active[0].checkpoint!;
  const near = eventModifiers(active, x, z);
  const far = eventModifiers(active, x + 500, z + 500);
  assert.ok(near.maxSpeedCap !== null);
  assert.equal(far.maxSpeedCap, null);
});
