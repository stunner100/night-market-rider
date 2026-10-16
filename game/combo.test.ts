import { test } from "node:test";
import assert from "node:assert/strict";
import { addStunt, COMBO_WINDOW, comboMultiplier, crashCombo, newCombo, tickCombo } from "./combo";

test("stunts chain inside the window and bank when it runs out", () => {
  let c = newCombo();
  c = addStunt(c, "nearMiss");
  c = tickCombo(c, COMBO_WINDOW - 0.5, true).combo;
  c = addStunt(c, "drift", 2);
  assert.equal(c.count, 2);
  assert.equal(c.points, 100 + 240);
  assert.equal(c.timer, COMBO_WINDOW, "each stunt refreshes the window");
  const r = tickCombo(c, COMBO_WINDOW + 0.1, true);
  assert.equal(r.combo.count, 0);
  assert.equal(r.banked?.count, 2);
  assert.equal(r.banked?.xp, Math.round(340 * comboMultiplier(2)));
  assert.ok((r.banked?.cash ?? 0) > 0);
});

test("style tips only with an empty box and at least two stunts", () => {
  const two = addStunt(addStunt(newCombo(), "jump"), "slip");
  assert.equal(tickCombo(two, 10, false).banked?.cash, 0, "food on board: XP only");
  assert.ok((tickCombo(two, 10, false).banked?.xp ?? 0) > 0);
  assert.equal(tickCombo(addStunt(newCombo(), "jump"), 10, true).banked?.cash, 0, "a single stunt is not a combo");
});

test("multiplier grows and caps; a crash drops the combo", () => {
  assert.equal(comboMultiplier(1), 1);
  assert.equal(comboMultiplier(3), 2);
  assert.equal(comboMultiplier(20), 4);
  assert.deepEqual(crashCombo(), newCombo());
  assert.equal(tickCombo(newCombo(), 5, true).banked, null);
});
