/**
 * Police checkpoint on the delivery route. Stop and show your licence (costs
 * time), "settle am" (costs cedis), or ride through and get fined. Pure reducer;
 * the engine supplies distance and speed.
 */
export type CheckpointStage = "ahead" | "stopped" | "checking" | "cleared" | "fined";

export interface CheckpointState {
  stage: CheckpointStage;
  remaining: number;
  warned: boolean;
  line: string;
}

export const CHECKPOINT = {
  warnAt: 70,
  stopWithin: 9,
  /** m/s; slower than this inside the stop zone counts as stopping. */
  stopSpeed: 1.6,
  checkSeconds: 4,
  settle: 5,
  fine: 20,
} as const;

export const initialCheckpoint = (): CheckpointState => ({ stage: "ahead", remaining: 0, warned: false, line: "" });

export type CheckpointEvent =
  | { type: "tick"; dt: number; distance: number; speed: number }
  | { type: "showLicence" }
  | { type: "settle" };

export function reduceCheckpoint(s: CheckpointState, e: CheckpointEvent): CheckpointState {
  if (e.type === "showLicence" && s.stage === "stopped")
    return { ...s, stage: "checking", remaining: CHECKPOINT.checkSeconds, line: "Officer: Ehh… let me check am small." };
  if (e.type === "settle" && s.stage === "stopped")
    return { ...s, stage: "cleared", line: `Officer: Hmm. Go. (−GH₵${CHECKPOINT.settle})` };
  if (e.type !== "tick") return s;
  const speed = Math.abs(e.speed);
  switch (s.stage) {
    case "ahead":
      if (e.distance < CHECKPOINT.stopWithin) {
        if (speed <= CHECKPOINT.stopSpeed)
          return { ...s, stage: "stopped", line: "Officer: Chale, good evening. Licence and roadworthy?" };
        // Rode straight through the barrels.
        if (e.distance < 4) return { ...s, stage: "fined", line: `Officer: Hey! You no see police? GH₵${CHECKPOINT.fine} fine!` };
      }
      if (!s.warned && e.distance < CHECKPOINT.warnAt)
        return { ...s, warned: true, line: "👮🏾 Police checkpoint ahead — slow down and stop." };
      return s;
    case "stopped":
      // Rolling away without answering is the same as running the checkpoint.
      return e.distance > CHECKPOINT.stopWithin + 6
        ? { ...s, stage: "fined", line: `Officer: Come back! GH₵${CHECKPOINT.fine} fine!` }
        : s;
    case "checking": {
      if (e.distance > CHECKPOINT.stopWithin + 6)
        return { ...s, stage: "fined", line: `Officer: I never finish! GH₵${CHECKPOINT.fine} fine!` };
      const remaining = Math.max(0, s.remaining - Math.max(0, e.dt));
      return remaining <= 0
        ? { ...s, stage: "cleared", remaining: 0, line: "Officer: Everything correct. Go, ride safe." }
        : { ...s, remaining };
    }
    default:
      return s;
  }
}
