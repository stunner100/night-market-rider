"use client";
import { useGame } from "@/game/store";
import { CONTACTS } from "@/game/calls";
import { engineRef } from "./GameClient";

/** Incoming call card: rings beside the HUD so the rider can keep riding. */
export default function PhoneCall() {
  const call = useGame((s) => s.incomingCall);
  if (!call) return null;
  const contact = CONTACTS[call.from];
  const eng = engineRef.current;
  const last = call.step + 1 >= call.lines.length;
  return (
    <section className={`call-card${call.answered ? " is-live" : " is-ringing"}`} aria-label={`Call from ${call.name}`} role="dialog">
      <div className="call-who">
        <span className="call-face" aria-hidden="true">{contact.avatar}</span>
        <div>
          <b>{call.name}</b>
          <small>{call.answered ? contact.role : "dey call you…"}</small>
        </div>
      </div>
      {call.answered ? (
        <>
          <p className="call-line" aria-live="polite">“{call.lines[call.step]}”</p>
          <div className="call-actions">
            <button className="btn btn-ghost" onClick={() => eng?.declineCall()}>
              Hang up
            </button>
            <button className="btn btn-primary" onClick={() => eng?.nextCallLine()}>
              {last ? "Bye bye" : "Next ›"} <kbd>Enter</kbd>
            </button>
          </div>
        </>
      ) : (
        <div className="call-actions">
          <button className="btn call-later" onClick={() => eng?.declineCall()}>
            Later <kbd>⌫</kbd>
          </button>
          <button className="btn call-answer" onClick={() => eng?.answerCall()}>
            Answer <kbd>Enter</kbd>
          </button>
        </div>
      )}
    </section>
  );
}
