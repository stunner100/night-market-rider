import { test } from "node:test";
import assert from "node:assert/strict";
import { Corridor, FUNERAL, judgeFuneral, judgeSiren, newFuneralJudge, newSirenJudge } from "./road-events";

test("corridor places points along the road and projects back", () => {
  const c = new Corridor([{ x: 0, z: 0 }, { x: 0, z: 100 }, { x: 50, z: 100 }]);
  assert.equal(c.length, 150);
  const p = c.at(50, 2);
  // Travelling +Z, right of travel is -X.
  assert.deepEqual([Math.round(p.x), Math.round(p.z)], [-2, 50]);
  const r = c.project(-2, 50);
  assert.equal(Math.round(r.s), 50);
  assert.equal(Math.round(r.lateral), 2);
  assert.equal(Math.round(c.project(25, 103).s), 125);
});

const step = (j = newFuneralJudge(), gap: number, speed: number, honked = false, distance = 3) =>
  judgeFuneral(j, { gap, distance, speed, honked, halfLength: 4, dt: 0.1 });

test("passing a funeral slowly is respectful; speeding past is not", () => {
  let j = newFuneralJudge();
  const types: string[] = [];
  for (let gap = -60; gap <= 20; gap += 1) {
    const r = step(j, gap, 4);
    j = r.judge;
    types.push(...r.out.map(o => o.type));
  }
  assert.deepEqual(types, ["warn", "respect"]);

  j = newFuneralJudge();
  const fast: string[] = [];
  for (let gap = -30; gap <= 20; gap += 2) { const r = step(j, gap, 12); j = r.judge; fast.push(...r.out.map(o => o.type)); }
  assert.deepEqual(fast, ["warn", "disrespect"]);
});

test("honking near a funeral is rude; following patiently is respectful", () => {
  const honk = step(newFuneralJudge(), -20, 3, true);
  assert.ok(honk.out.some(o => o.type === "disrespect"));

  let j = newFuneralJudge();
  const types: string[] = [];
  for (let t = 0; t < (FUNERAL.followFor + 1) / 0.1; t++) { const r = step(j, -15, 2); j = r.judge; types.push(...r.out.map(o => o.type)); }
  assert.deepEqual(types, ["warn", "respect"]);
  assert.equal(j.done, true);
});

test("giving way to an ambulance is rewarded; blocking it is penalised", () => {
  // Rider pulls to the side as it passes.
  let j = newSirenJudge();
  const out: string[] = [];
  for (let gap = 50; gap >= -10; gap -= 1) { const r = judgeSiren(j, { gap, lateralDiff: 2.5, dt: 0.1 }); j = r.judge; out.push(...r.out.map(o => o.type)); }
  assert.deepEqual(out, ["warn", "yield"]);

  // Rider stays in its path ahead of it.
  j = newSirenJudge();
  const blocked: string[] = [];
  let blocking = false;
  for (let t = 0; t < 30; t++) { const r = judgeSiren(j, { gap: 8, lateralDiff: 0.3, dt: 0.1 }); j = r.judge; blocking = r.blocking; blocked.push(...r.out.map(o => o.type)); }
  assert.equal(blocking, true);
  assert.deepEqual(blocked, ["warn", "blocked"]);
  const after = judgeSiren(j, { gap: -8, lateralDiff: 2, dt: 0.1 });
  assert.equal(after.out.length, 0, "no reward after blocking");
});
