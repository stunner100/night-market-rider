export interface RunCounters {
  deliveries: number;
  deliveriesOnTime: number;
  deliveryAttempts: number;
  tipsGhs: number;
  distanceMetres: number;
  crashCount: number;
  earnings: number;
  rating: number;
  bestStreak: number;
  score: number;
}

export interface RunEndReason {
  kind: "strikes" | "shift_over";
  label: string;
}

export interface RunSummary extends RunCounters {
  reason: RunEndReason;
  onTimeRate: number;
  stars: number;
  starLabel: string;
}

export function onTimeRate(deliveriesOnTime: number, deliveryAttempts: number): number {
  if (deliveryAttempts <= 0) return deliveriesOnTime > 0 ? 1 : 0;
  return Math.round((deliveriesOnTime / deliveryAttempts) * 1000) / 1000;
}

export function riderStars(input: Pick<RunCounters, "deliveries" | "rating" | "crashCount" | "deliveriesOnTime" | "deliveryAttempts">): number {
  const onTime = onTimeRate(input.deliveriesOnTime, input.deliveryAttempts);
  let stars = 2;
  if (input.deliveries >= 3) stars += 0.5;
  if (input.deliveries >= 6) stars += 0.5;
  if (input.rating >= 4.2) stars += 0.5;
  if (input.rating >= 4.7) stars += 0.5;
  if (onTime >= 0.75) stars += 0.5;
  if (input.crashCount <= 1) stars += 0.5;
  if (input.crashCount === 0 && input.deliveries >= 2) stars += 0.5;
  return Math.min(5, Math.max(1, Math.round(stars * 2) / 2));
}

export function starLabel(stars: number): string {
  if (stars >= 4.5) return "Top rider";
  if (stars >= 3.5) return "Solid shift";
  if (stars >= 2.5) return "Getting there";
  return "Rough night";
}

export function buildRunSummary(counters: RunCounters, reason: RunEndReason): RunSummary {
  const stars = riderStars(counters);
  return {
    ...counters,
    reason,
    onTimeRate: onTimeRate(counters.deliveriesOnTime, counters.deliveryAttempts),
    stars,
    starLabel: starLabel(stars),
  };
}

/** Tips from leftover delivery timer (GHS), separate from base reward. */
export function tipFromTimeLeft(secondsLeft: number, orderTimeTotal: number): number {
  if (secondsLeft <= 0 || orderTimeTotal <= 0) return 0;
  const ratio = Math.min(1, secondsLeft / orderTimeTotal);
  return Math.round(ratio * 1.8 * 100) / 100;
}

/** Night shift length before the rider clocks out automatically. */
export const SHIFT_SECONDS = 12 * 60;

/** Optional `?shift=90` shortens the shift for demos (30–720 seconds). */
export function readShiftSeconds(defaultSec = SHIFT_SECONDS): number {
  if (typeof window === "undefined") return defaultSec;
  try {
    const raw = new URLSearchParams(window.location.search).get("shift");
    if (!raw) return defaultSec;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return defaultSec;
    return Math.min(defaultSec, Math.max(30, Math.round(parsed)));
  } catch {
    return defaultSec;
  }
}
