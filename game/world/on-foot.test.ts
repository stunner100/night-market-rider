import assert from "node:assert/strict";
import test from "node:test";
import { canRemount, chooseDismountPoint, REMOUNT_REACH, stepWalk } from "./on-foot";

test("dismount steps beside the bike and skips a blocked side", () => {
  const blockedRight = (x: number) => x > 0;
  const spot = chooseDismountPoint(0, 0, 0, blockedRight);
  assert.ok(spot.x < 0, `expected the free side, got ${spot.x}`);
  assert.ok(Math.hypot(spot.x, spot.z) > 1);
  const same = chooseDismountPoint(0, 0, 0, blockedRight);
  assert.deepEqual(same, spot);
});

test("walking stops at a wall and slides along the open axis", () => {
  const wall = (x: number) => x > 2;
  const into = stepWalk({ x: 1.5, z: 0, heading: Math.PI / 2 }, { forward: 1, turn: 0 }, 1, wall);
  assert.ok(into.x <= 2.01, `walked through the wall to ${into.x}`);
  const slide = stepWalk({ x: 1.5, z: 0, heading: Math.PI / 4 }, { forward: 1, turn: 0 }, 1, wall);
  assert.ok(slide.z > 0.2, "expected to slide along the wall");
  assert.ok(slide.x <= 2.01);
});

test("remount only works beside the parked bike", () => {
  assert.equal(canRemount(1, 0, 0, 0), true);
  assert.equal(canRemount(REMOUNT_REACH + 0.2, 0, 0, 0), false);
});
