import test from "node:test";
import assert from "node:assert/strict";
import { updateDriveSpeed } from "../game/drive.mjs";

const drive = (overrides = {}) => updateDriveSpeed({
  speed: 0,
  up: false,
  down: false,
  canDrive: true,
  boostOn: false,
  maxSpeed: 26,
  boostMax: 37,
  fuel: 100,
  dt: 1 / 60,
  ...overrides,
});

test("holding down from a standstill engages reverse", () => {
  assert.ok(drive({ down: true, dt: 0.1 }) < 0);
});

test("holding down while moving forward brakes through zero and reverses", () => {
  let speed = 8;
  for (let i = 0; i < 40; i++) {
    speed = drive({ speed, down: true, dt: 0.05 });
    if (speed < 0) break;
  }
  assert.ok(speed < 0, `expected reverse speed, received ${speed}`);
});

test("empty-fuel coasting preserves reverse sign until momentum reaches zero", () => {
  const speed = drive({ speed: -4, fuel: 0, dt: 0.1 });
  assert.ok(speed < 0, `reverse momentum should remain negative, received ${speed}`);
  assert.ok(speed > -4, `reverse momentum should decay toward zero, received ${speed}`);
});

test("empty fuel still prevents starting in reverse from a stop", () => {
  assert.equal(drive({ down: true, fuel: 0, dt: 0.1 }), 0);
});
