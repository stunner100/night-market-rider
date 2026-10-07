import assert from "node:assert/strict";
import test from "node:test";
import { buildRunSummary, onTimeRate, riderStars, tipFromTimeLeft } from "./run-stats";

test("tips scale with time left on the delivery clock", () => {
  assert.equal(tipFromTimeLeft(0, 120), 0);
  assert.ok(tipFromTimeLeft(60, 120) > 0);
  assert.ok(tipFromTimeLeft(90, 120) > tipFromTimeLeft(30, 120));
});

test("on-time rate handles empty and mixed attempts", () => {
  assert.equal(onTimeRate(0, 0), 0);
  assert.equal(onTimeRate(2, 4), 0.5);
});

test("run summary stars reward clean, on-time shifts", () => {
  const strong = buildRunSummary({
    deliveries: 6,
    deliveriesOnTime: 5,
    deliveryAttempts: 6,
    tipsGhs: 4.5,
    distanceMetres: 4200,
    crashCount: 0,
    earnings: 42,
    rating: 4.8,
    bestStreak: 4,
    score: 12000,
  }, { kind: "shift_over", label: "Night shift complete" });
  assert.ok(strong.stars >= 4);
  assert.ok(strong.onTimeRate > 0.8);

  const rough = riderStars({ deliveries: 1, deliveriesOnTime: 0, deliveryAttempts: 3, rating: 3.2, crashCount: 4 });
  assert.ok(rough <= 3);
});
