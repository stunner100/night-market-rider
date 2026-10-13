"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, saveBoard } from "@/game/store";
import { formatMetres } from "@/game/world/distance";
import type { MinimapFrame } from "@/game/world/minimap-data";
import RiderPhone from "./RiderPhone";
import PhoneCall from "./PhoneCall";
import Onboarding from "./Onboarding";
import Garage from "./Garage";
import { ARCHETYPES } from "@/game/archetypes";
import { LOADING_LINES } from "@/game/voice";
import { CashPayment, CheckpointPanel, InteractionPrompt, PickupTicket, RadioBar } from "./DeliveryPanels";
import { customerDetails } from "@/game/delivery/customer";
import { deliveryObjective } from "@/game/delivery/machine";
import { engineRef } from "./GameClient";

const MANEUVER_LABEL = {
  left: "Turn left",
  right: "Turn right",
  straight: "Go straight",
  uturn: "Turn back",
  arrive: "You don reach",
} as const;

/** Turn-by-turn glyphs drawn on a 48-unit grid, pointing "up" = forward. */
function ManeuverIcon({ kind }: { kind: keyof typeof MANEUVER_LABEL }) {
  const paths: Record<keyof typeof MANEUVER_LABEL, string> = {
    straight: "M24 40 V10 M14 20 L24 9 L34 20",
    left: "M30 42 V26 Q30 18 22 18 H10 M18 9 L9 18 L18 27",
    right: "M18 42 V26 Q18 18 26 18 H38 M30 9 L39 18 L30 27",
    uturn: "M32 42 V20 Q32 9 22 9 Q14 9 14 20 V30 M7 23 L14 31 L21 23",
    arrive: "M24 43 C24 43 37 30 37 20 A13 13 0 0 0 11 20 C11 30 24 43 24 43 Z M24 15 A5 5 0 1 1 23.9 15",
  };
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d={paths[kind]} />
    </svg>
  );
}

const COUNTER_STAGES = ["offer", "preparing", "collect", "checkBag", "fixingBag", "payment", "handoff", "completed"];

function NavBanner() {
  const s = useGame();
  // At the counter or with the customer, the ticket and prompt take over.
  if (COUNTER_STAGES.includes(s.delivery.stage) || (!s.mounted && s.navManeuver === "arrive")) return null;
  if (!s.navManeuver) {
    return (
      <div className="nav-pill" aria-label="Current road and heading">
        <b>{s.compass}</b>
        <span>{s.roadName || "Accra"}</span>
      </div>
    );
  }
  const kind = s.navManeuver;
  const soon = kind === "uturn" || ((kind === "left" || kind === "right") && s.navTurnIn < 18);
  return (
    <div className={`nav-banner nav-${kind}${soon ? " is-now" : ""}`} role="status" aria-live="polite">
      <div className="nav-icon">
        <ManeuverIcon kind={kind} />
      </div>
      <div className="nav-text">
        <strong>
          {kind === "uturn" ? "Chale, turn back" : soon || kind === "arrive" ? MANEUVER_LABEL[kind] : formatMetres(s.navTurnIn)}
        </strong>
        <span>
          {kind === "uturn"
            ? "You dey go wrong side o"
            : soon || kind === "arrive"
              ? s.roadName || "Follow the route"
              : `then ${MANEUVER_LABEL[kind].toLowerCase()}${s.roadName ? ` · ${s.roadName}` : ""}`}
        </span>
      </div>
      <div className="nav-eta">
        <b>{formatMetres(s.distM)}</b>
        <span>~{Math.max(1, Math.ceil(s.distM / 400))} min · {s.compass}</span>
      </div>
    </div>
  );
}

function fmtTime(s: number) {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function roadColor(highway: string): string {
  if (highway === "trunk" || highway === "trunk_link" || highway === "primary")
    return "#8d9274";
  if (highway === "secondary" || highway === "tertiary") return "#6d735c";
  return "#4a5244";
}

function roadWidth(highway: string): number {
  if (highway === "trunk" || highway === "primary") return 3.4;
  if (highway === "secondary" || highway === "tertiary") return 2.5;
  if (highway === "residential" || highway === "unclassified") return 1.7;
  return 1.15;
}

function drawOsmMinimap(
  g: CanvasRenderingContext2D,
  frame: MinimapFrame,
  px: number,
  pz: number,
  heading: number,
) {
  const W = 150;
  const H = 150;
  const cx = W / 2;
  const cy = H / 2;
  g.clearRect(0, 0, W, H);
  g.save();
  g.beginPath();
  g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = "rgba(8,18,12,0.92)";
  g.fillRect(0, 0, W, H);
  const scale = (cx - 8) / frame.radius;
  g.translate(cx, cy);
  g.rotate(-heading + Math.PI);
  const X = (x: number) => (x - px) * scale;
  const Z = (z: number) => (z - pz) * scale;
  for (const road of frame.roads) {
    g.strokeStyle = roadColor(road.highway);
    g.lineWidth = roadWidth(road.highway);
    g.beginPath();
    g.moveTo(X(road.ax), Z(road.az));
    g.lineTo(X(road.bx), Z(road.bz));
    g.stroke();
  }
  if (frame.route.length > 1) {
    g.strokeStyle = "#f2e35c";
    g.lineWidth = 2.2;
    g.setLineDash([5, 4]);
    g.beginPath();
    frame.route.forEach((point, index) => {
      const x = X(point.x);
      const z = Z(point.z);
      if (index === 0) g.moveTo(x, z);
      else g.lineTo(x, z);
    });
    g.stroke();
    g.setLineDash([]);
  }
  const marker = (point: { x: number; z: number } | null, color: string) => {
    if (!point) return;
    let x = point.x - px;
    let z = point.z - pz;
    const dist = Math.hypot(x, z);
    if (dist > frame.radius) {
      const k = (frame.radius - 8) / dist;
      x *= k;
      z *= k;
    }
    g.fillStyle = color;
    g.beginPath();
    g.arc(x * scale, z * scale, 5, 0, Math.PI * 2);
    g.fill();
  };
  for (const station of frame.fuel) marker(station, "#ff922b");
  for (const mark of frame.landmarks) {
    g.fillStyle = "#74c0fc";
    g.beginPath();
    g.arc(X(mark.x), Z(mark.z), 2.4, 0, Math.PI * 2);
    g.fill();
  }
  marker(frame.pickup, "#f2e35c");
  marker(frame.drop, "#51cf66");
  g.restore();
  g.save();
  g.translate(cx, cy);
  g.fillStyle = "#f2e35c";
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6, 7);
  g.lineTo(0, 3.5);
  g.lineTo(-6, 7);
  g.closePath();
  g.fill();
  g.restore();
  g.strokeStyle = "#f2e35c";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
  g.stroke();
}

export default function UI({
  ready,
  progress,
}: {
  ready: boolean;
  progress: number;
}) {
  const s = useGame();
  const [showBoard, setShowBoard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const mapRef = useRef<HTMLCanvasElement>(null);

  // minimap painter — throttled to ~15fps to save battery
  useEffect(() => {
    let raf = 0;
    let lastDraw = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < 66) return; // ~15fps
      lastDraw = now;
      const cv = mapRef.current;
      const eng = engineRef.current;
      if (!cv || !eng) return;
      const g = cv.getContext("2d");
      if (!g) return;
      const frame = eng.osmActive ? eng.collectMinimap() : null;
      if (frame) {
        drawOsmMinimap(g, frame, eng.px, eng.pz, eng.heading);
        return;
      }
      const W = cv.width,
        H = cv.height,
        cx = W / 2,
        cy = H / 2;
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath();
      g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
      g.clip();
      g.fillStyle = "rgba(10,14,10,0.9)";
      g.fillRect(0, 0, W, H);
      const scale = 0.85;
      const px = eng.px,
        pz = eng.pz,
        hd = eng.heading;
      g.translate(cx, cy);
      g.rotate(-hd + Math.PI);
      const X = (x: number) => (x - px) * scale;
      const Z = (z: number) => (z - pz) * scale;
      // roads
      g.strokeStyle = "#555";
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(X(-95), Z(0));
      g.lineTo(X(95), Z(0));
      g.stroke();
      g.beginPath();
      g.moveTo(X(0), Z(-95));
      g.lineTo(X(0), Z(95));
      g.stroke();
      g.strokeStyle = "#444";
      g.lineWidth = 4;
      for (const c of [-60, 60]) {
        g.beginPath();
        g.moveTo(X(-66), Z(c));
        g.lineTo(X(66), Z(c));
        g.stroke();
        g.beginPath();
        g.moveTo(X(c), Z(-66));
        g.lineTo(X(c), Z(66));
        g.stroke();
      }
      // route + target
      const o = useGame.getState().order;
      const ph = useGame.getState().phase;
      if (o && (ph === "toPickup" || ph === "toDropoff" || ph === "offer")) {
        const tx = ph === "toDropoff" ? o.dropX : o.pickupX;
        const tz = ph === "toDropoff" ? o.dropZ : o.pickupZ;
        g.strokeStyle = "#f2e35c";
        g.lineWidth = 2.5;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(X(tx), Z(tz));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = ph === "toDropoff" ? "#51cf66" : "#f2e35c";
        g.beginPath();
        g.arc(X(tx), Z(tz), 6, 0, Math.PI * 2);
        g.fill();
      }
      // fuel stations on minimap
      if (eng.world?.fuelStations) {
        for (const fs of eng.world.fuelStations) {
          const fx = X(fs.x),
            fz = Z(fs.z);
          g.fillStyle = "#ff922b";
          g.beginPath();
          g.arc(fx, fz, 3.5, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = "#ffffff";
          g.lineWidth = 1;
          g.stroke();
        }
      }
      g.restore();
      // player arrow (screen-aligned)
      g.save();
      g.translate(cx, cy);
      g.fillStyle = "#f2e35c";
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(6, 7);
      g.lineTo(0, 3.5);
      g.lineTo(-6, 7);
      g.closePath();
      g.fill();
      g.restore();
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  // touch steering joystick — analog with cached rect
  const joyRef = useRef<HTMLDivElement>(null);
  const joyActive = useRef<number | null>(null);
  const joyRect = useRef<DOMRect | null>(null);
  useEffect(() => {
    const el = joyRef.current;
    if (!el) return;
    const move = (e: PointerEvent) => {
      if (joyActive.current !== e.pointerId) return;
      const r = joyRect.current;
      if (!r) return;
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const eng = engineRef.current;
      if (!eng) return;
      // analog steering: use threshold but also provide proportional input
      eng.input.left = dx < -0.25;
      eng.input.right = dx > 0.25;
    };
    const down = (e: PointerEvent) => {
      joyActive.current = e.pointerId;
      joyRect.current = el.getBoundingClientRect();
      el.setPointerCapture(e.pointerId);
      move(e);
    };
    const up = (e: PointerEvent) => {
      if (joyActive.current !== e.pointerId) return;
      joyActive.current = null;
      joyRect.current = null;
      const eng = engineRef.current;
      if (eng) {
        eng.input.left = false;
        eng.input.right = false;
      }
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [ready, s.phase === "menu"]);

  const hold = (key: "up" | "down" | "boost" | "drift") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      const eng = engineRef.current;
      if (eng) {
        eng.audio.ensure();
        eng.input[key] = true;
      }
    },
    onPointerUp: () => {
      const eng = engineRef.current;
      if (eng) eng.input[key] = false;
    },
    onPointerCancel: () => {
      const eng = engineRef.current;
      if (eng) eng.input[key] = false;
    },
    onPointerLeave: () => {
      const eng = engineRef.current;
      if (eng) eng.input[key] = false;
    },
  });

  if (!ready) {
    return (
      <div
        className="hud-layer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b0c",
        }}
      >
        <div
          className="card pop"
          style={{ padding: 36, width: 340, textAlign: "center" }}
        >
          <img
            src="/brand/night-market-logo.png"
            alt="Night Market"
            style={{
              width: 120,
              background: "#000",
              borderRadius: 14,
              padding: 8,
            }}
          />
          <h2 style={{ margin: "14px 0 6px" }}>
            Your shift dey load…
          </h2>
          <p style={{ opacity: 0.7, fontSize: 13 }}>
            {LOADING_LINES[Math.floor(progress / 17) % LOADING_LINES.length]}
          </p>
          <div className="loading-bar">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    );
  }

  const eng = engineRef.current;
  const inGame = !["loading", "menu", "gameover"].includes(s.phase);
  const stage = s.delivery.stage;
  const online = stage !== "offline";
  const interaction =
    stage === "vendor"
      ? "CONFIRM ORDER"
      : stage === "collect"
        ? "TAKE THE FOOD"
        : stage === "findCustomer"
          ? "GIVE AM THE FOOD"
          : stage === "contact"
            ? s.delivery.callAttempts > 0 ? "CALL AGAIN" : "CALL CUSTOMER"
            : null;
  const canInteract =
    stage === "contact"
      ? s.speedKmh < 3.6 && s.delivery.remaining <= 0
      : !s.mounted && s.interactionDistance < 3;
  return (
    <div className="hud-layer">
      {s.phase === "menu" && (
        <div className="welcome-screen">
          <img src="/brand/night-market-logo.png" alt="Night Market" />
          <p className="welcome-ticker">{LOADING_LINES[0]}</p>
          <p className="eyebrow">AKWAABA · LEGON · OKPONGLO · SHIASHIE</p>
          <h1>RIDER</h1>
          <p>
            {s.archetype
              ? `Welcome back, ${s.nickname} · ${ARCHETYPES[s.archetype].emoji} ${ARCHETYPES[s.archetype].name}`
              : "Chale, Accra dey wait. Your moto, your hustle, your shift."}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => (s.archetype ? eng?.startRun() : s.set({ onboarding: true }))}
          >
            ENTER ACCRA
          </button>
          <div className="welcome-links">
            {s.archetype && (
              <button onClick={() => s.set({ onboarding: true })}>Change who you be</button>
            )}
            <button onClick={() => s.set({ garageOpen: true })}>🏍️ Garage</button>
            <button onClick={() => setShowHelp(true)}>How e dey work</button>
            <button onClick={() => setShowBoard(true)}>Top riders</button>
            <button
              onClick={() => {
                s.set({ sound: !s.sound });
                eng?.audio.setEnabled(!s.sound);
              }}
            >
              Sound {s.sound ? "on" : "off"}
            </button>
          </div>
        </div>
      )}
      {inGame && (
        <>
          <header className="shift-header">
            <div className="shift-brand">
              <img src="/brand/night-market-logo.png" alt="Night Market" />
              <span>RIDER / ACCRA</span>
            </div>
            <div className="shift-stats">
              <span>GH₵{s.earnings.toFixed(2)}</span>
              <span>★ {s.rating.toFixed(1)}</span>
              <button aria-label="Pause game" onClick={() => eng?.pauseGame()}>
                Ⅱ
              </button>
            </div>
          </header>
          <NavBanner />
          <section className="task-panel" aria-label="Current task">
            <div className="task-heading">
              <span className={online ? "online-dot" : "offline-dot"}>
                {online ? "● ONLINE" : "○ OFFLINE"}
              </span>
              <button onClick={() => eng?.toggleOnline()}>
                {online ? "GO OFFLINE" : "GO ONLINE"}
              </button>
            </div>
            <p className="eyebrow">CURRENT TASK</p>
            <h2>{s.navigationTarget || deliveryObjective(stage, s.mounted)}</h2>
            {s.order && (
              <p>
                {["ridePickup", "vendor", "preparing", "collect", "checkBag", "fixingBag"].includes(
                  stage,
                )
                  ? s.order.vendor
                  : `${s.order.customer} · ${s.order.dropoff}`}
              </p>
            )}
            {s.order?.address && ["returnBike", "rideCustomer", "contact", "calling", "findCustomer"].includes(stage) && (
              <p className="task-address">📍 {s.order.address}</p>
            )}
            {(s.navigationTarget ||
              ["ridePickup", "rideCustomer"].includes(stage)) && (
              <div className="route-instruction">
                <b>{s.turnHint || "Follow the yellow road"}</b>
                <span>
                  {formatMetres(s.distM)} · ~
                  {Math.max(1, Math.ceil(s.distM / 400))} min
                </span>
              </div>
            )}
            {["returnBike", "rideCustomer", "contact", "calling", "findCustomer", "handoff"].includes(stage) && (
              <div
                className={`food-meter${s.foodCondition < 60 ? " is-low" : ""}`}
                aria-label={`Food condition ${Math.round(s.foodCondition)} percent`}
              >
                <span>FOOD CONDITION</span>
                <b>{Math.round(s.foodCondition)}%</b>
                <i style={{ width: `${s.foodCondition}%` }} />
              </div>
            )}
            {stage === "returnBike" && (
              <p>
                {Math.round(s.bikeDistance)} m to your bike · E to climb
              </p>
            )}
            {stage === "preparing" && (
              <p>
                “Small time please.” E go ready in {Math.ceil(s.delivery.remaining)}{" "}
                s
              </p>
            )}
            {stage === "findCustomer" && (
              <p>
                {customerDetails(s.order?.id ?? 1, s.order?.meeting).meeting} ·{" "}
                {Math.round(s.interactionDistance)} m
              </p>
            )}
            {stage === "contact" && s.delivery.callAttempts > 0 && (
              <>
                <p>{s.delivery.message}</p>
                {s.delivery.remaining > 0 && <p>Call again in {Math.ceil(s.delivery.remaining)} s.</p>}
                <button className="btn btn-ghost" disabled={s.speedKmh >= 3.6 || s.delivery.messageSent}
                  onClick={() => eng?.messageCustomer()}>TEXT: “I DON REACH”</button>
              </>
            )}
            {interaction && (
              <button
                className="btn btn-primary"
                disabled={!canInteract}
                onClick={() => eng?.interact()}
              >
                {interaction} <small>F</small>
              </button>
            )}
            {interaction && !canInteract && (
              <p className="muted">
                {s.mounted && stage !== "contact"
                  ? "Stop, press E to get down, then waka go."
                  : stage === "contact"
                    ? s.delivery.remaining > 0 ? "Wait small before you call again, or text am." : "Stop the bike before you call."
                    : "Waka close to the person (3 m)."}
              </p>
            )}
            {s.atBase && stage === "offline" && (
              <button
                className="btn btn-ghost"
                disabled={s.speedKmh > 3}
                onClick={() => eng?.serviceBike()}
              >
                SERVICE BIKE AT BASE
              </button>
            )}
            {stage === "offline" && !s.tutorialDone && (
              <p className="muted">
                First shift? Go online → accept → park and collect → call → give
                the food. We go show you step by step.
              </p>
            )}
          </section>
          <div className="ride-actions">
            <button onClick={() => s.set({ phoneOpen: !s.phoneOpen })}>
              PHONE <kbd>N</kbd>
              {s.unread > 0 && <span className="unread-badge" aria-label={`${s.unread} unread messages`}>{s.unread}</span>}
            </button>
            <button
              disabled={s.mounted ? s.speedKmh > 3 : s.bikeDistance > 3}
              onClick={() => eng?.toggleMount()}
            >
              {s.mounted ? "GET DOWN" : "CLIMB BIKE"} <kbd>E</kbd>
            </button>
          </div>
          <div className="ride-telemetry">
            <strong>
              {s.mounted ? s.speedKmh : Math.round(s.speedKmh / 3.6)}
            </strong>
            <span>{s.mounted ? "KM/H" : "M/S · ON FOOT"}</span>
            {s.mounted && (s.drifting || s.slipstream > 0) && (
              <div className="ride-feel">
                {s.drifting && <b className="feel-drift">DRIFT</b>}
                {s.slipstream > 0 && (
                  <b className="feel-slip" style={{ ["--slip" as string]: s.slipstream }}>SLIPSTREAM</b>
                )}
              </div>
            )}
            <div className="fuel-meter">
              <i style={{ width: `${s.fuel}%` }} />
            </div>
            <small>
              FUEL {Math.round(s.fuel)}% ·{" "}
              {Math.floor(s.hour).toString().padStart(2, "0")}:
              {Math.floor((s.hour % 1) * 60)
                .toString()
                .padStart(2, "0")}
            </small>
          </div>
          <canvas ref={mapRef} id="minimap" width={150} height={150} />
          <div className="map-caption">
            LEGON / ACCRA <span>GPS LIVE</span>
          </div>
          <div className="toasts" aria-live="polite">
            {s.toasts.map((t) => (
              <div key={t.id}>{t.text}</div>
            ))}
          </div>
          <div className="desktop-controls">
            W S accelerate / brake · A D steer · Shift drift · E mount · F interact
            · N phone · R radio · H horn · ESC pause
          </div>
          <div ref={joyRef} className="touch-steer">
            ◀ STEER ▶
          </div>
          <div className="touch-pedals">
            <div className="touch-btn" {...hold("down")}>
              BRAKE
            </div>
            <div className="touch-btn" {...hold("up")}>
              {s.mounted ? "GAS" : "WALK"}
            </div>
            <div className="touch-btn" {...hold("boost")}>
              {s.mounted ? "BOOST" : "RUN"}
            </div>
            {s.mounted && (
              <div className="touch-btn touch-drift" {...hold("drift")}>
                DRIFT
              </div>
            )}
          </div>
          {stage === "offer" && s.order && (
            <section className="order-offer" aria-label="New delivery offer">
              <div className="offer-kicker">
                NIGHT MARKET{" "}
                <span>{Math.ceil(s.delivery.remaining)}s · ACCEPT QUICK</span>
              </div>
              <p className="eyebrow">NEW ORDER DEY!</p>
              <h2>{s.order.vendor}</h2>
              <p>{s.order.food}</p>
              <div className="offer-route">
                <span>01 · TAKE FROM</span>
                <b>{s.order.vendor}{s.order.vendorSite?.road ? ` · ${s.order.vendorSite.road}` : " · Legon corridor"}</b>
                <span>02 · CARRY GO</span>
                <b>
                  {s.order.customer} · {s.order.dropoff}
                </b>
                {s.order.address && <span className="offer-address">{s.order.address}</span>}
              </div>
              <div className="offer-pay">
                <strong>GH₵{s.order.reward.toFixed(2)}</strong>
                <span>
                  {(
                    Math.hypot(
                      s.order.dropX - s.order.pickupX,
                      s.order.dropZ - s.order.pickupZ,
                    ) / 1000
                  ).toFixed(1)}{" "}
                  km direct · {Math.ceil(s.order.timeTotal / 60)} min target
                </span>
              </div>
              <div className="offer-buttons">
                <button
                  className="btn btn-ghost"
                  onClick={() => eng?.declineOrder()}
                >
                  PASS
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => eng?.acceptOrder()}
                >
                  ACCEPT AM
                </button>
              </div>
              <div
                className="offer-timer"
                style={{ width: `${(s.delivery.remaining / 25) * 100}%` }}
              />
            </section>
          )}
          <PickupTicket />
          <CashPayment />
          <CheckpointPanel />
          <RadioBar />
          <InteractionPrompt />
          {stage === "completed" && s.lastDelivery && (
            <div className="completion">
              <p className="eyebrow">DELIVERY DONE · MEDAASE!</p>
              <h2>+GH₵{s.lastDelivery.reward.toFixed(2)}</h2>
              <div className="completion-stars" aria-label={`Customer rating ${s.lastDelivery.rating.toFixed(1)} of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className={s.lastDelivery && s.lastDelivery.rating >= n - 0.25 ? "on" : ""}>★</span>
                ))}
              </div>
              <blockquote>“{s.lastDelivery.comment}” — {s.lastDelivery.customer}</blockquote>
              <dl className="payout-lines">
                {s.lastDelivery.lines.map((line) => (
                  <div key={line.label} className={line.amount < 0 ? "is-negative" : ""}>
                    <dt>{line.label}</dt>
                    <dd>{line.amount < 0 ? "−" : "+"}GH₵{Math.abs(line.amount).toFixed(2)}</dd>
                  </div>
                ))}
              </dl>
              <p>
                +{s.lastDelivery.xp} XP · {s.timeLeft > 0 ? "On time" : "Late small"} · food{" "}
                {s.lastDelivery.condition}% intact · {fmtTime(s.delivery.elapsed)}
              </p>
            </div>
          )}
          <RiderPhone />
          <PhoneCall />
        </>
      )}
      {s.onboarding && s.phase === "menu" && <Onboarding />}
      {s.garageOpen && <Garage />}
      {s.paused && (
        <div className="modal-shade">
          <section className="dialog">
            <p className="eyebrow">REST SMALL</p>
            <h2>Shift dey pause</h2>
            <button
              className="btn btn-primary"
              onClick={() => eng?.resumeGame()}
            >
              CONTINUE
            </button>
            <button className="btn btn-ghost" onClick={() => eng?.quitToMenu()}>
              GO HOUSE
            </button>
          </section>
        </div>
      )}
      {(showHelp || showBoard) && (
        <div className="modal-shade">
          <section className="dialog">
            <h2>
              {showBoard ? "Accra top riders" : "Akwaaba, Night Market rider"}
            </h2>
            {showBoard ? (
              <>
                {s.leaderboard.length ? (
                  s.leaderboard.map((r, i) => (
                    <p key={i}>
                      {i + 1}. {r.name} · {r.score}
                    </p>
                  ))
                ) : (
                  <p>Nobody don ride yet. Be the first!</p>
                )}
              </>
            ) : (
              <>
                <p>
                  Roam Accra free, or go online for work. Accept an order and
                  follow the GPS go the vendor.
                </p>
                <p>
                  Brake, press E to park, waka go the vendor and press F to
                  confirm. Check the bag well, go back to your bike, then follow
                  GPS go the customer.
                </p>
                <p>
                  Call when you near. Find the customer, get down and press F to
                  give the food. Your phone go ring too — Auntie Dede, Kofi
                  Mechanic, even your Maame. Enter to answer.
                </p>
                <p>
                  W / S to move · A / D to steer · E mount · F interact · N
                  phone · H horn · Space boost · Esc pause.
                </p>
              </>
            )}
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowHelp(false);
                setShowBoard(false);
              }}
            >
              OK, I GET AM
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
