import { test } from "node:test";
import assert from "node:assert/strict";
import { applyGoalEvent, GOAL_DEFS, goalProgressText, pickGoals, type GoalEvent, type GoalState } from "./shift-goals";

const delivered = (over: Partial<Extract<GoalEvent, { type: "delivered" }>> = {}): GoalEvent => ({
  type: "delivered", timeShare: 0.5, condition: 100, streak: 1, kind: "standard", cash: false, changeError: 0, ...over,
});

test("each shift gets one goal per group, stable per seed", () => {
  for (let seed = 1; seed < 300; seed++) {
    const goals = pickGoals(seed);
    assert.deepEqual(goals, pickGoals(seed));
    assert.deepEqual(goals.map(g => GOAL_DEFS[g.id].group), ["delivery", "riding", "skill"]);
    for (const g of goals) assert.ok(GOAL_DEFS[g.id].targets.includes(g.target));
  }
  const ids = new Set(Array.from({ length: 300 }, (_, s) => pickGoals(s + 1).map(g => g.id)).flat());
  assert.equal(ids.size, Object.keys(GOAL_DEFS).length, "every goal shows up across shifts");
});

test("count goals add up and complete once", () => {
  let goals: GoalState[] = [{ id: "nearMiss", target: 2, progress: 0, current: 0, done: false }];
  let r = applyGoalEvent(goals, { type: "nearMiss" });
  assert.equal(r.completed.length, 0);
  r = applyGoalEvent(r.goals, { type: "nearMiss" });
  assert.equal(r.completed.length, 1);
  goals = r.goals;
  r = applyGoalEvent(goals, { type: "nearMiss" });
  assert.equal(r.completed.length, 0, "a finished goal never pays twice");
  assert.equal(r.goals[0].progress, 2);
});

test("delivery goals check time, food, twists, streak and change", () => {
  const g = (id: GoalState["id"], target = 1): GoalState[] => [{ id, target, progress: 0, current: 0, done: false }];
  assert.equal(applyGoalEvent(g("sharp"), delivered({ timeShare: 0.39 })).completed.length, 0);
  assert.equal(applyGoalEvent(g("sharp"), delivered({ timeShare: 0.4 })).completed.length, 1);
  assert.equal(applyGoalEvent(g("hotFood"), delivered({ condition: 94 })).completed.length, 0);
  assert.equal(applyGoalEvent(g("twists"), delivered({ kind: "rush" })).completed.length, 1);
  assert.equal(applyGoalEvent(g("streak", 3), delivered({ streak: 2 })).goals[0].progress, 2);
  assert.equal(applyGoalEvent(g("streak", 3), delivered({ streak: 3 })).completed.length, 1);
  assert.equal(applyGoalEvent(g("exactChange"), delivered({ cash: true, changeError: 5 })).completed.length, 0);
  assert.equal(applyGoalEvent(g("exactChange"), delivered({ cash: true, changeError: 0 })).completed.length, 1);
  assert.equal(applyGoalEvent(g("exactChange"), delivered({ cash: false })).completed.length, 0);
});

test("best goals keep the best effort; clean riding resets on a crash", () => {
  let drift: GoalState[] = [{ id: "drift", target: 3, progress: 0, current: 0, done: false }];
  drift = applyGoalEvent(drift, { type: "drift", seconds: 2.2 }).goals;
  drift = applyGoalEvent(drift, { type: "drift", seconds: 1 }).goals;
  assert.equal(drift[0].progress, 2.2);
  assert.equal(goalProgressText(drift[0]), "2.2/3 s");

  let clean: GoalState[] = [{ id: "clean", target: 2, progress: 0, current: 0, done: false }];
  clean = applyGoalEvent(clean, { type: "ride", metres: 1500 }).goals;
  clean = applyGoalEvent(clean, { type: "crash" }).goals;
  clean = applyGoalEvent(clean, { type: "ride", metres: 800 }).goals;
  assert.equal(clean[0].progress, 1.5, "best run so far is kept");
  assert.equal(clean[0].current, 0.8);
  const r = applyGoalEvent(clean, { type: "ride", metres: 1300 });
  assert.equal(r.completed.length, 1);
});
