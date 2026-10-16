import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOrderKind, ORDER_KINDS, orderKind } from "./order-kind";

test("order kinds are stable, start simple, and mix twists in later", () => {
  assert.equal(orderKind(1), "standard");
  assert.equal(orderKind(2), "standard");
  const seen = new Map<string, number>();
  for (let id = 3; id <= 402; id++) {
    assert.equal(orderKind(id), orderKind(id));
    seen.set(orderKind(id), (seen.get(orderKind(id)) ?? 0) + 1);
  }
  for (const kind of ["standard", "rush", "soup", "party"]) assert.ok((seen.get(kind) ?? 0) > 30, `${kind} appears`);
  // Roughly half of later offers stay normal.
  assert.ok((seen.get("standard") ?? 0) > 150 && (seen.get("standard") ?? 0) < 260);
});

test("each twist trades difficulty for pay", () => {
  const base = { id: 0, reward: 10, timeTotal: 100 };
  for (let id = 3; id < 200; id++) {
    const o = applyOrderKind({ ...base, id });
    const info = ORDER_KINDS[o.kind];
    assert.equal(o.reward, Math.round(10 * info.fareMult * 100) / 100);
    assert.equal(o.timeTotal, Math.round(100 * info.timeMult));
  }
  assert.ok(ORDER_KINDS.rush.timeMult < 1 && ORDER_KINDS.rush.fareMult > 1);
  assert.ok(ORDER_KINDS.soup.spillMult > 1 && ORDER_KINDS.soup.fareMult > 1);
  assert.ok(ORDER_KINDS.party.speedMult < 1 && ORDER_KINDS.party.timeMult > 1);
});
