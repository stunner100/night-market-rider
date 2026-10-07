"use client";

import { useEffect, useState } from "react";
import { useGame, type Phase } from "@/game/store";
import { formatMetres } from "@/game/world/distance";

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px), (pointer: coarse)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

function fmtTime(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function distanceLabel(metres: number): string {
  if (!Number.isFinite(metres) || metres < 1) return "…";
  return formatMetres(metres);
}

function etaLabel(metres: number, kmh: number): string {
  if (!Number.isFinite(metres) || metres < 1) return "…";
  if (metres < 40) return "here";
  const speed = Math.max(18, kmh);
  const mins = Math.max(1, Math.round((metres / 1000) / speed * 60));
  return mins === 1 ? "~1 min" : `~${mins} min`;
}

type PhonePhase = "offer" | "toPickup" | "pickup" | "toDropoff" | "deliver" | "delivered";

function asPhonePhase(phase: Phase): PhonePhase | null {
  switch (phase) {
    case "offer":
    case "toPickup":
    case "pickup":
    case "toDropoff":
    case "deliver":
    case "delivered":
      return phase;
    case "loading":
    case "menu":
    case "countdown":
    case "gameover":
      return null;
    default: {
      const unknown: never = phase;
      return unknown;
    }
  }
}

function kicker(phase: PhonePhase): string {
  switch (phase) {
    case "offer":
      return "New chop";
    case "toPickup":
      return "Go collect";
    case "pickup":
      return "Collecting";
    case "toDropoff":
      return "Drop am";
    case "deliver":
      return "Handing over";
    case "delivered":
      return "Momo in";
    default: {
      const unknown: never = phase;
      return unknown;
    }
  }
}

export default function DeliveryPhone({ onAccept }: { onAccept: () => void }) {
  const s = useGame();
  const phase = asPhonePhase(s.phase);
  const narrow = useNarrowViewport();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (s.phase === "offer" || s.phase === "delivered") setOpen(true);
    else if (s.phase === "toPickup" || s.phase === "toDropoff") setOpen(false);
    else if (narrow) setOpen(false);
  }, [s.phase, narrow]);

  if (!phase || !s.order) return null;
  const order = s.order;
  const goingToCustomer = phase === "toDropoff" || phase === "deliver" || phase === "delivered";
  const primaryTitle = goingToCustomer ? order.dropoff : order.food;
  const secondaryLine = goingToCustomer ? order.customer : order.vendor;
  const clock = phase === "toPickup" || phase === "toDropoff" ? s.timeLeft : order.timeTotal;
  const late = clock < 15 && (phase === "toPickup" || phase === "toDropoff");

  return (
    <aside
      className={`nm-phone ${open ? "nm-phone-open" : ""} ${narrow ? "nm-phone--narrow" : ""}`}
      aria-label="Delivery phone"
    >
      <button type="button" className="nm-phone-bar" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="nm-phone-brand">NM Rider</span>
        <span className={late ? "nm-phone-late" : ""}>{fmtTime(clock)}</span>
      </button>
      <div className="nm-phone-screen">
        <div className="nm-phone-scroll">
          <div className="nm-phone-kicker">{kicker(phase)} · {order.emoji}</div>
          {s.eventHud && (
            <div className="nm-phone-event">{s.activeEvent?.emoji} {s.eventHud}</div>
          )}
          <div className="nm-phone-place" title={primaryTitle}>{primaryTitle}</div>
          <div className="nm-phone-sub" title={secondaryLine}>{secondaryLine}</div>
          {phase !== "delivered" && (
            <div className="nm-phone-meta">
              <span>{distanceLabel(s.distM)}</span>
              <span>{etaLabel(s.distM, s.speedKmh)}</span>
            </div>
          )}
          {open && (
            <div className="nm-phone-detail">
              {phase === "offer" || phase === "toPickup" || phase === "pickup" ? (
                <div>Then drop for <b>{order.customer}</b> · {order.dropoff}</div>
              ) : (
                <div>From <b>{order.vendor}</b></div>
              )}
              <div className="nm-phone-pay">GHS {order.reward.toFixed(2)} · momo on delivery</div>
              {phase === "delivered" && s.lastDelivery && (
                <div className="nm-phone-done">
                  + GHS {s.lastDelivery.reward.toFixed(2)}
                  {s.lastDelivery.tip > 0 && <> · tip {s.lastDelivery.tip.toFixed(2)}</>}<br />
                  + {s.lastDelivery.xp} XP · ⭐ {s.lastDelivery.rating.toFixed(1)}
                </div>
              )}
            </div>
          )}
          {(phase === "pickup" || phase === "deliver") && (
            <div className="nm-phone-wait">{phase === "pickup" ? "Vendor dey pack the chop…" : "Customer dey collect…"}</div>
          )}
        </div>
        {phase === "offer" && (
          <button type="button" className="btn btn-primary nm-phone-accept" onClick={onAccept}>
            Accept order
          </button>
        )}
      </div>
    </aside>
  );
}
