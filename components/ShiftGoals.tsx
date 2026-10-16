"use client";
import { useState } from "react";
import { useGame } from "@/game/store";
import { ALL_GOALS_BONUS, GOAL_DEFS, goalLabel, goalProgressText, goalShown, type GoalState } from "@/game/shift-goals";

/** Stages where the right-hand column belongs to the offer, ticket or cash panel. */
const BUSY = ["offer", "preparing", "collect", "checkBag", "fixingBag", "payment"];

function GoalRow({ g, showHint }: { g: GoalState; showHint: boolean }) {
  const share = Math.min(1, goalShown(g) / g.target);
  return (
    <li className={g.done ? "is-done" : ""}>
      <span className="goal-check" aria-hidden="true">{g.done ? "✓" : ""}</span>
      <div>
        <b>{goalLabel(g)}</b>
        {showHint && !g.done && <small>{GOAL_DEFS[g.id].hint}</small>}
        <i style={{ width: `${share * 100}%` }} />
      </div>
      <em>{g.done ? `+GH₵${GOAL_DEFS[g.id].reward}` : goalProgressText(g)}</em>
    </li>
  );
}

/** Live card on the HUD; on phones a pill that expands on tap. */
export function ShiftGoals() {
  const s = useGame();
  const [open, setOpen] = useState(false);
  const goals = s.shiftGoals;
  if (!goals.length || s.phoneOpen || BUSY.includes(s.delivery.stage)) return null;
  if (s.delivery.stage === "vendor" && !s.mounted) return null;
  const done = goals.filter(g => g.done).length;
  return (
    <section className={`shift-goals${open ? " is-open" : ""}`} aria-label="Shift goals">
      <button type="button" className="goals-pill" onClick={() => setOpen(!open)} aria-expanded={open}>
        🎯 {done}/{goals.length}
      </button>
      <header>
        <span>SHIFT GOALS</span>
        <b>{done === goals.length ? `ALL DONE · +GH₵${ALL_GOALS_BONUS}` : `${done}/${goals.length}`}</b>
      </header>
      <ul>
        {goals.map(g => <GoalRow key={g.id} g={g} showHint={false} />)}
      </ul>
    </section>
  );
}

/** Full list with hints, for the pause screen. */
export function ShiftGoalsList() {
  const goals = useGame(st => st.shiftGoals);
  if (!goals.length) return null;
  return (
    <div className="goals-list">
      <p className="eyebrow">SHIFT GOALS · ALL THREE PAYS +GH₵{ALL_GOALS_BONUS}</p>
      <ul>
        {goals.map(g => <GoalRow key={g.id} g={g} showHint />)}
      </ul>
    </div>
  );
}
