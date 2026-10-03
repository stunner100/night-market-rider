import test from "node:test";
import assert from "node:assert/strict";
import { movePointOutsideOrientedBox, segmentOrientedBoxEntryT } from "../game/collision.mjs";

test("swept collision catches a fast path through a thin obstacle", () => {
  const pole = { x: 0, z: 0, halfX: 0.4, halfZ: 0.4 };
  const entry = segmentOrientedBoxEntryT(-1.2, 0, 1.2, 0, pole);
  assert.ok(entry !== null);
  assert.ok(Math.abs(entry - 1 / 3) < 1e-9);
});

test("swept collision rejects a parallel path outside the collider", () => {
  const pole = { x: 0, z: 0, halfX: 0.4, halfZ: 0.4 };
  assert.equal(segmentOrientedBoxEntryT(-1, 0.5, 1, 0.5, pole), null);
});

test("starting inside a collider is detected at the segment start", () => {
  const box = { x: 2, z: -3, halfX: 1, halfZ: 2 };
  assert.equal(segmentOrientedBoxEntryT(2, -3, 5, -3, box), 0);
});

test("rotated collider uses its actual oriented footprint", () => {
  const box = { x: 0, z: 0, halfX: 0.4, halfZ: 2, rotationY: Math.PI / 4 };
  assert.ok(segmentOrientedBoxEntryT(-2, -2, 2, 2, box) !== null);
  // This point is within the rotated box's axis-aligned envelope, but outside
  // its actual narrow side, so a non-rotated broad box would be a false hit.
  assert.equal(segmentOrientedBoxEntryT(1.5, -0.1, 1.5, 0.1, box), null);
});

test("a point inside a rotated collider is pushed outside its nearest face", () => {
  const box = { x: 4, z: -2, halfX: 0.4, halfZ: 2, rotationY: -0.3 };
  const outside = movePointOutsideOrientedBox(4, -2, box);
  assert.ok(segmentOrientedBoxEntryT(outside.x, outside.z, outside.x, outside.z, box) === null);
});
