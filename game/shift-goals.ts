/**
 * Three goals per shift — one delivery goal, one riding goal, one skill goal —
 * so every shift has something to aim for beyond the next order. Pure: the
 * engine feeds events in and pays out what comes back.
 */
import type { OrderKind } from "./delivery/order-kind";

export type GoalId =
  | "deliveries" | "sharp" | "hotFood" | "twists" | "streak"
  | "nearMiss" | "drift" | "slip" | "clean" | "combo"
  | "exactChange";

export type GoalGroup = "delivery" | "riding" | "skill";

interface GoalDef {
  id: GoalId;
  group: GoalGroup;
  /** Possible targets; one is picked per shift. */
  targets: number[];
  /** "count" adds up across the shift; "best" keeps the best single effort. */
  mode: "count" | "best";
  label: (n: number) => string;
  hint: string;
  /** Cash bonus in cedis when completed. */
  reward: number;
  unit?: string;
}

export const GOAL_DEFS: Record<GoalId, GoalDef> = {
  deliveries: { id: "deliveries", group: "delivery", targets: [3, 4], mode: "count", label: n => `Deliver ${n} orders`, hint: "Any order counts", reward: 8 },
  sharp: { id: "sharp", group: "delivery", targets: [2, 3], mode: "count", label: n => `${n} SHARP SHARP drop-offs`, hint: "Deliver with 40% of the time left", reward: 10 },
  hotFood: { id: "hotFood", group: "delivery", targets: [2, 3], mode: "count", label: n => `${n} drop-offs, food still hot`, hint: "Food 95% or better on arrival", reward: 10 },
  twists: { id: "twists", group: "delivery", targets: [2], mode: "count", label: n => `Finish ${n} Rush, Soup or Party orders`, hint: "Take the orders with a twist", reward: 12 },
  streak: { id: "streak", group: "skill", targets: [3, 4], mode: "best", label: n => `Build a ×${n} delivery streak`, hint: "Strikes break the streak", reward: 10 },
  nearMiss: { id: "nearMiss", group: "riding", targets: [4, 6], mode: "count", label: n => `Pull off ${n} close shaves`, hint: "Skim past traffic above 58 km/h", reward: 8 },
  drift: { id: "drift", group: "riding", targets: [2, 3], mode: "best", label: n => `Drift ${n} s in one go`, hint: "Hold Shift and steer hard through a bend", reward: 9, unit: "s" },
  slip: { id: "slip", group: "riding", targets: [12, 20], mode: "count", label: n => `Ride ${n} s in slipstream`, hint: "Tuck in 3–16 m behind a car or trotro", reward: 8, unit: "s" },
  combo: { id: "combo", group: "riding", targets: [3, 4], mode: "best", label: n => `Build a ×${n} stunt combo`, hint: "Chain close shaves, drifts, jumps and slipstream", reward: 10 },
  clean: { id: "clean", group: "skill", targets: [2, 3], mode: "best", label: n => `Ride ${n} km without a crash`, hint: "Any crash restarts the count", reward: 10, unit: "km" },
  exactChange: { id: "exactChange", group: "skill", targets: [1, 2], mode: "count", label: n => `Give exact change ${n}×`, hint: "Cash orders: count the change well", reward: 7 },
};

export const ALL_GOALS_BONUS = 15;

export interface GoalState {
  id: GoalId;
  target: number;
  progress: number;
  /** In-progress effort for "best" goals that build up (clean riding). */
  current: number;
  done: boolean;
}

export type GoalEvent =
  | { type: "delivered"; timeShare: number; condition: number; streak: number; kind: OrderKind; cash: boolean; changeError: number }
  | { type: "nearMiss" }
  | { type: "drift"; seconds: number }
  | { type: "slip"; seconds: number }
  | { type: "ride"; metres: number }
  | { type: "combo"; count: number }
  | { type: "crash" };

/** Small deterministic PRNG so a seed always gives the same shift. */
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One goal per group. `exactChange` is rarer since cash orders are occasional. */
export function pickGoals(seed: number): GoalState[] {
  const r = mulberry(seed);
  const groups: GoalGroup[] = ["delivery", "riding", "skill"];
  return groups.map(group => {
    let pool = Object.values(GOAL_DEFS).filter(d => d.group === group);
    if (group === "skill" && r() < 0.6) pool = pool.filter(d => d.id !== "exactChange");
    const def = pool[Math.floor(r() * pool.length)];
    const target = def.targets[Math.floor(r() * def.targets.length)];
    return { id: def.id, target, progress: 0, current: 0, done: false };
  });
}

function amount(id: GoalId, e: GoalEvent): { add?: number; best?: number } | null {
  switch (id) {
    case "deliveries": return e.type === "delivered" ? { add: 1 } : null;
    case "sharp": return e.type === "delivered" && e.timeShare >= 0.4 ? { add: 1 } : null;
    case "hotFood": return e.type === "delivered" && e.condition >= 95 ? { add: 1 } : null;
    case "twists": return e.type === "delivered" && e.kind !== "standard" ? { add: 1 } : null;
    case "streak": return e.type === "delivered" ? { best: e.streak } : null;
    case "exactChange": return e.type === "delivered" && e.cash && Math.abs(e.changeError) < 0.001 ? { add: 1 } : null;
    case "nearMiss": return e.type === "nearMiss" ? { add: 1 } : null;
    case "drift": return e.type === "drift" ? { best: e.seconds } : null;
    case "slip": return e.type === "slip" ? { add: e.seconds } : null;
    case "combo": return e.type === "combo" ? { best: e.count } : null;
    case "clean": return null; // handled with its running counter below
  }
}

/** Apply one event; returns the new goals and any that just completed. */
export function applyGoalEvent(goals: GoalState[], e: GoalEvent): { goals: GoalState[]; completed: GoalState[] } {
  const completed: GoalState[] = [];
  const next = goals.map(g => {
    if (g.done) return g;
    let { progress, current } = g;
    if (g.id === "clean") {
      if (e.type === "crash") current = 0;
      else if (e.type === "ride") current += e.metres / 1000;
      progress = Math.max(progress, current);
    } else {
      const a = amount(g.id, e);
      if (!a) return g;
      if (a.add !== undefined) progress += a.add;
      if (a.best !== undefined) progress = Math.max(progress, a.best);
    }
    const done = progress >= g.target;
    const updated = { ...g, progress: done ? g.target : progress, current, done };
    if (done) completed.push(updated);
    return updated;
  });
  return { goals: next, completed };
}

export function goalLabel(g: GoalState) {
  return GOAL_DEFS[g.id].label(g.target);
}

/** What the HUD shows: the live crash-free run for "clean", otherwise progress. */
export function goalShown(g: GoalState) {
  return g.id === "clean" && !g.done ? g.current : g.progress;
}

/** "3/5", "1.4/2 s", "0.6/2 km". */
export function goalProgressText(g: GoalState) {
  const def = GOAL_DEFS[g.id];
  const fmt = (n: number) => (def.unit ? (Math.floor(n * 10) / 10).toString() : Math.floor(n).toString());
  return `${fmt(goalShown(g))}/${g.target}${def.unit ? ` ${def.unit}` : ""}`;
}
