export interface FollowOption {
  dirX: number;
  dirZ: number;
}

/** Prefer the departure that continues straight. `roll` is 0..1. */
export function pickContinuation(options: FollowOption[], dirX: number, dirZ: number, roll: number): number {
  if (options.length === 0) return -1;
  let best = 0;
  let bestDot = -Infinity;
  const scored: { index: number; dot: number }[] = [];
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const len = Math.hypot(option.dirX, option.dirZ) || 1;
    const dot = (dirX * option.dirX + dirZ * option.dirZ) / len;
    scored.push({ index: i, dot });
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  const forward = scored.filter(item => item.dot > 0.25);
  const pool = forward.length > 0 ? forward : scored;
  pool.sort((a, b) => b.dot - a.dot);
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)));
  return pool[index]?.index ?? best;
}
