/**
 * @param {unknown} value
 * @returns {{ name: string, score: number }[]}
 */
export function sanitizeLeaderboard(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 14) : "";
    const score = entry.score;
    if (!name || typeof score !== "number" || !Number.isFinite(score) || score < 0) continue;
    entries.push({ name, score: Math.floor(score) });
  }
  return entries.sort((a, b) => b.score - a.score).slice(0, 8);
}

/** @param {unknown} value */
export function sanitizeNickname(value) {
  return typeof value === "string" ? value.trim().slice(0, 14) : "";
}
