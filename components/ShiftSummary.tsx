"use client";
import { useGame } from "@/game/store";
import { COMBO_WINDOW, comboMultiplier } from "@/game/combo";
import { engineRef } from "./GameClient";

/** End-of-shift results: what you earned and how you rode. */
export function ShiftSummary() {
  const s = useGame();
  const r = s.shiftSummary;
  if (s.phase !== "gameover" || !r) return null;
  const eng = engineRef.current;
  const rows: [string, string][] = [
    ["Deliveries", `${r.deliveries}`],
    ["Shift goals", `${r.goalsDone}/${r.goalsTotal}`],
    ["Best combo", r.bestCombo ? `×${r.bestCombo}` : "—"],
    ["Distance", `${r.km.toFixed(1)} km`],
    ["XP", `+${r.xp}`],
    ["Rating", `★ ${r.rating.toFixed(1)}${r.ratingChange ? ` (${r.ratingChange > 0 ? "+" : ""}${r.ratingChange.toFixed(2)})` : ""}`],
  ];
  if (r.respected || r.disrespected) rows.push(["Road respect", `${r.respected} 🙏 · ${r.disrespected} 😤`]);
  return (
    <div className="modal-shade">
      <section className="dialog shift-summary" aria-label="Shift summary">
        <p className="eyebrow">{r.reason === "timeUp" ? "2:00 AM · SHIFT DON END" : "THREE STRIKES · SHIFT OVER"}</p>
        <h2>{r.reason === "timeUp" ? "Ayekoo! Go rest." : "Chale, rest small."}</h2>
        <div className="summary-earned">
          <span>Earned this shift</span>
          <strong>GH₵{r.earned.toFixed(2)}</strong>
        </div>
        <dl className="summary-grid">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <button className="btn btn-primary" onClick={() => eng?.startRun()}>
          RIDE ANOTHER SHIFT
        </button>
        <button className="btn btn-ghost" onClick={() => eng?.quitToMenu()}>
          GO HOUSE
        </button>
      </section>
    </div>
  );
}

/** Live combo chip by the speedometer, with the window draining. */
export function ComboMeter() {
  const c = useGame(st => st.combo);
  if (!c || c.count < 1) return null;
  return (
    <div className={`combo-meter${c.count >= 3 ? " is-hot" : ""}`} aria-live="polite">
      <b>×{c.count}</b>
      <span>COMBO · {Math.round(c.points * comboMultiplier(c.count))}</span>
      <i style={{ width: `${Math.max(0, c.timer / COMBO_WINDOW) * 100}%` }} />
    </div>
  );
}
