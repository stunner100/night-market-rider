"use client";
import { useEffect, useState } from "react";
import { useGame, chooseIdentity } from "@/game/store";
import { ARCHETYPES, QUIZ, scoreQuiz, type ArchetypeId } from "@/game/archetypes";
import { engineRef } from "./GameClient";

type Step = "name" | number | "rolling" | "reveal";

/** First-run flow: your name, four small questions, then Accra decides who you be. */
export default function Onboarding() {
  const s = useGame();
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState(s.nickname === "Rider" ? "" : s.nickname);
  const [picks, setPicks] = useState<ArchetypeId[]>([]);
  const result = picks.length === QUIZ.length ? scoreQuiz(picks) : null;

  useEffect(() => {
    if (step !== "rolling") return;
    const t = setTimeout(() => setStep("reveal"), 1600);
    return () => clearTimeout(t);
  }, [step]);

  const answer = (to: ArchetypeId) => {
    const next = [...picks, to];
    setPicks(next);
    setStep(next.length === QUIZ.length ? "rolling" : next.length);
  };

  // Number keys pick an answer, like the bag check and cash panels.
  useEffect(() => {
    if (typeof step !== "number") return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      const choice = QUIZ[step].answers[n - 1];
      if (choice) answer(choice.to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const close = () => s.set({ onboarding: false });
  const start = () => {
    if (!result) return;
    chooseIdentity(name || "Rider", result);
    s.set({ onboarding: false });
    engineRef.current?.startRun();
  };

  const back = () => {
    if (step === 0) setStep("name");
    else if (typeof step === "number") { setPicks(picks.slice(0, -1)); setStep(step - 1); }
  };

  return (
    <div className="modal-shade onboarding-shade">
      <section className="dialog onboarding" aria-label="Who you be for Accra">
        {step !== "rolling" && step !== "reveal" && (
          <header className="onboarding-top">
            {step === "name" ? <button onClick={close}>✕ Close</button> : <button onClick={back}>‹ Back</button>}
            <div className="onboarding-dots" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} className={(step === "name" ? 0 : (step as number) + 1) >= i ? "on" : ""} />
              ))}
            </div>
          </header>
        )}

        {step === "name" && (
          <form onSubmit={(e) => { e.preventDefault(); setStep(0); }}>
            <h2>Wetin we go call you?</h2>
            <input
              autoFocus
              className="onboarding-name"
              value={name}
              maxLength={20}
              placeholder="e.g. Kojo Speed"
              onChange={(e) => setName(e.target.value)}
              aria-label="Rider name"
            />
            <p className="muted">Na this name customers and Auntie Dede go see. Accra go decide the rest.</p>
            <button className="btn btn-primary" type="submit">NEXT</button>
          </form>
        )}

        {typeof step === "number" && (
          <>
            <p className="eyebrow">SMALL QUESTION · {step + 1} OF {QUIZ.length}</p>
            <h2>{QUIZ[step].q}</h2>
            <div className="onboarding-answers">
              {QUIZ[step].answers.map((a, i) => (
                <button key={a.text} onClick={() => answer(a.to)}>
                  <kbd>{i + 1}</kbd> {a.text}
                </button>
              ))}
            </div>
          </>
        )}

        {step === "rolling" && (
          <div className="onboarding-rolling" role="status">
            <p className="eyebrow">ACCRA DEY DECIDE…</p>
            <div className="onboarding-spinner">🏍️ 🎓 ✈️ 🍲</div>
          </div>
        )}

        {step === "reveal" && result && (
          <div className="onboarding-reveal">
            <p className="eyebrow">ACCRA DON DECIDE</p>
            <div className="reveal-emoji" aria-hidden="true">{ARCHETYPES[result].emoji}</div>
            <h2>
              {name ? `${name}, you be ` : "You be "}
              <span>{ARCHETYPES[result].name}</span>
            </h2>
            <p>{ARCHETYPES[result].tagline}</p>
            <dl>
              <div><dt>You stay</dt><dd>{ARCHETYPES[result].home}</dd></div>
              <div><dt>Upside</dt><dd>{ARCHETYPES[result].upside}</dd></div>
              <div><dt>Wahala</dt><dd>{ARCHETYPES[result].wahala}</dd></div>
            </dl>
            <button className="btn btn-primary" onClick={start}>START MY SHIFT</button>
            <button className="btn btn-ghost" onClick={() => { setPicks([]); setStep(0); }}>Ask me again</button>
          </div>
        )}
      </section>
    </div>
  );
}
