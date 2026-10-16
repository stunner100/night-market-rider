/**
 * Stunt combo: close shaves, drifts, jumps and slipstream chain together if
 * each lands within the window. When the window runs out the combo banks as
 * XP — plus "style tips" in cash, but only with an empty box (with food on
 * board, careful riding matters more). Any crash drops the combo.
 */
export type StuntKind = "nearMiss" | "drift" | "jump" | "slip";

export const STUNT_POINTS: Record<StuntKind, number> = { nearMiss: 100, drift: 120, jump: 90, slip: 60 };
export const STUNT_LABEL: Record<StuntKind, string> = { nearMiss: "Close shave", drift: "Drift", jump: "Air", slip: "Slipstream" };
export const COMBO_WINDOW = 4;

export interface ComboState {
  count: number;
  points: number;
  /** Seconds left before the combo banks. */
  timer: number;
  last: StuntKind | null;
}

export const newCombo = (): ComboState => ({ count: 0, points: 0, timer: 0, last: null });

export const comboMultiplier = (count: number) => Math.min(4, 1 + Math.max(0, count - 1) * 0.5);

/** Add a stunt; `quality` scales its points (e.g. drift seconds, air time). */
export function addStunt(c: ComboState, kind: StuntKind, quality = 1): ComboState {
  const base = Math.round(STUNT_POINTS[kind] * Math.max(0.5, Math.min(3, quality)));
  return { count: c.count + 1, points: c.points + base, timer: COMBO_WINDOW, last: kind };
}

export interface ComboBank { count: number; xp: number; cash: number }

/** Tick the window; returns the banked result once it runs out. */
export function tickCombo(c: ComboState, dt: number, boxEmpty: boolean): { combo: ComboState; banked: ComboBank | null } {
  if (c.count === 0) return { combo: c, banked: null };
  const timer = c.timer - dt;
  if (timer > 0) return { combo: { ...c, timer }, banked: null };
  const xp = Math.round(c.points * comboMultiplier(c.count));
  // Style tips: about GH₵0.20 per 100 points at ×1, only when the box is empty — a bonus, never a substitute for deliveries.
  const cash = boxEmpty && c.count >= 2 ? Math.round(xp * 0.002 * 2) / 2 : 0;
  return { combo: newCombo(), banked: { count: c.count, xp, cash } };
}

/** A crash drops whatever was building. */
export const crashCombo = (): ComboState => newCombo();
