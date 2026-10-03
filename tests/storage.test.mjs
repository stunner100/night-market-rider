import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLeaderboard, sanitizeNickname } from "../game/storage.mjs";

test("leaderboard sanitizer rejects malformed entries and normalizes valid rows", () => {
  const clean = sanitizeLeaderboard([
    { name: "  Accra Ace  ", score: 420.8 },
    null,
    { name: { text: "not a string" }, score: 99 },
    { name: "NaN", score: Number.NaN },
    { name: "Negative", score: -2 },
    { name: "Infinity", score: Number.POSITIVE_INFINITY },
  ]);
  assert.deepEqual(clean, [{ name: "Accra Ace", score: 420 }]);
});

test("leaderboard sanitizer caps names and retains only the top eight scores", () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ name: `Rider ${i} with long name`, score: i }));
  const clean = sanitizeLeaderboard(rows);
  assert.equal(clean.length, 8);
  assert.deepEqual(clean.map((row) => row.score), [11, 10, 9, 8, 7, 6, 5, 4]);
  assert.ok(clean.every((row) => row.name.length <= 14));
});

test("nickname sanitizer accepts only bounded strings", () => {
  assert.equal(sanitizeNickname("  123456789012345678  "), "12345678901234");
  assert.equal(sanitizeNickname("  Patrick  "), "Patrick");
  assert.equal(sanitizeNickname({ name: "bad" }), "");
});
