import assert from "node:assert/strict";
import test from "node:test";
import { driveTarget, effectiveDriveTarget, updateDriveSpeed } from "./drive";

const drive = (overrides: Partial<Parameters<typeof updateDriveSpeed>[0]> = {}) =>
  updateDriveSpeed({
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
  let speed = 0;
  for (let i = 0; i < 30; i++) speed = drive({ speed, down: true });
  assert.ok(speed < -1, `expected sustained reverse speed, received ${speed}`);
});

test("holding down while moving forward brakes through zero and reverses", () => {
  let speed = 8;
  for (let i = 0; i < 80; i++) {
    speed = drive({ speed, down: true, dt: 0.05 });
    if (speed < -0.5) break;
  }
  assert.ok(speed < -0.5, `expected reverse speed, received ${speed}`);
});

test("empty-fuel coasting preserves reverse sign until momentum reaches zero", () => {
  const speed = drive({ speed: -4, fuel: 0, dt: 0.1 });
  assert.ok(speed < 0, `reverse momentum should remain negative, received ${speed}`);
  assert.ok(speed > -4, `reverse momentum should decay toward zero, received ${speed}`);
});

test("empty fuel allows a slow reverse creep from a stop", () => {
  let speed = 0;
  for (let i = 0; i < 40; i++) speed = drive({ speed, down: true, fuel: 0, dt: 0.05 });
  assert.ok(speed < 0, `expected reverse creep, received ${speed}`);
  assert.ok(speed >= -3.5, `reverse creep should stay capped, received ${speed}`);
});

test("drive target keeps reverse engaged once rolling backward", () => {
  assert.equal(driveTarget({ speed: -2, up: false, down: true, canDrive: true, boostOn: false, maxSpeed: 26, boostMax: 37 }), -5.5);
});

test("effective target blocks forward acceleration on an empty tank", () => {
  assert.equal(effectiveDriveTarget(26, 0), 0);
  assert.equal(effectiveDriveTarget(-5.5, 0), -3.5);
});
