"use client";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Clock,
  Flame,
  Fuel,
  Gauge,
  HelpCircle,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Star,
  Trophy,
  UserRound,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useGame, saveBoard } from "@/game/store";
import type { MinimapFrame } from "@/game/world/minimap-data";
import { engineRef } from "./GameClient";
import DeliveryPhone from "./DeliveryPhone";

function fmtTime(s: number) {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function roadColor(highway: string): string {
  if (highway === "trunk" || highway === "trunk_link" || highway === "primary") return "#8d9274";
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
    g.strokeStyle = "#f2c94c";
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
  marker(frame.pickup, "#f2c94c");
  marker(frame.drop, "#51cf66");
  g.restore();
  g.save();
  g.translate(cx, cy);
  g.fillStyle = "#f2c94c";
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(6, 7);
  g.lineTo(0, 3.5);
  g.lineTo(-6, 7);
  g.closePath();
  g.fill();
  g.restore();
  g.strokeStyle = "#f2c94c";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, cx - 2, 0, Math.PI * 2);
  g.stroke();
}

function StarRating({ stars }: { stars: number }) {
  const full = Math.floor(stars);
  const half = stars % 1 >= 0.5;
  return (
    <div className="nm-stars" aria-label={`${stars} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const on = i < full || (i === full && half);
        return (
          <Star
            key={i}
            size={22}
            className={on ? "nm-star nm-star--on" : "nm-star"}
            fill={on ? "currentColor" : "none"}
            strokeWidth={on ? 0 : 1.5}
          />
        );
      })}
    </div>
  );
}

export default function UI({
  ready,
  progress,
  loadingLabel,
}: {
  ready: boolean;
  progress: number;
  loadingLabel: string;
}) {
  const s = useGame();
  const [showBoard, setShowBoard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const mapRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastDraw = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < 66) return;
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
      const o = useGame.getState().order;
      const ph = useGame.getState().phase;
      if (o && (ph === "toPickup" || ph === "toDropoff" || ph === "offer")) {
        const tx = ph === "toDropoff" ? o.dropX : o.pickupX;
        const tz = ph === "toDropoff" ? o.dropZ : o.pickupZ;
        g.strokeStyle = "#f2c94c";
        g.lineWidth = 2.5;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(X(tx), Z(tz));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = ph === "toDropoff" ? "#51cf66" : "#f2c94c";
        g.beginPath();
        g.arc(X(tx), Z(tz), 6, 0, Math.PI * 2);
        g.fill();
      }
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
      g.save();
      g.translate(cx, cy);
      g.fillStyle = "#f2c94c";
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
      eng.input.left = dx < -0.25;
      eng.input.right = dx > 0.25;
    };
    const down = (e: PointerEvent) => {
      joyActive.current = e.pointerId;
      joyRect.current = el.getBoundingClientRect();
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
  }, [ready]);

  const hold = (key: "up" | "down" | "boost") => ({
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
      <div className="hud-layer nm-loading-screen" role="status" aria-live="polite" aria-busy="true">
        <div className="card nm-loading-card pop">
          <div className="nm-logo-wrap floaty">
            <img src="/brand/night-market-logo.png" alt="" className="nm-logo" />
          </div>
          <p className="nm-loading-title nm-display">Night Market Rider</p>
          <p className="nm-loading-step">{loadingLabel}</p>
          <div className="loading-bar" aria-hidden>
            <div style={{ width: `${progress}%` }} />
          </div>
          <p className="nm-loading-pct">{Math.round(progress)}%</p>
        </div>
      </div>
    );
  }

  const eng = engineRef.current;
  const inGame = ["offer", "toPickup", "pickup", "toDropoff", "deliver", "delivered", "countdown"].includes(
    s.phase,
  );
  const timerUrgent =
    s.timeLeft < 15 && (s.phase === "toDropoff" || s.phase === "toPickup");

  return (
    <div className="hud-layer">
      {s.phase === "menu" && (
        <div className="modal-backdrop modal-backdrop--menu">
          <div className="card card-narrow nm-title-screen pop">
            <div className="nm-logo-wrap floaty">
              <img src="/brand/night-market-logo.png" alt="Night Market Rider logo" className="nm-logo" />
            </div>
            <p className="nm-eyebrow nm-display">Accra night shift</p>
            <h1 className="nm-hero-title">Rider</h1>
            <p className="nm-tagline">Deliver Accra. Beat the clock.</p>
            <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={() => eng?.startRun()} aria-label="Start riding">
              <Play size={18} aria-hidden />
              Start riding
            </button>
            <div className="btn-row btn-row--title">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowBoard(true)} aria-label="Leaderboard">
                <Trophy size={18} aria-hidden />
                <span className="btn-label">Leaderboard</span>
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowHelp(true)} aria-label="How to play">
                <HelpCircle size={18} aria-hidden />
                <span className="btn-label">How to play</span>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-pressed={s.sound}
                aria-label={s.sound ? "Sound on" : "Sound off"}
                onClick={() => {
                  const v = !s.sound;
                  s.set({ sound: v });
                  if (eng) eng.audio.setEnabled(v);
                }}
              >
                {s.sound ? <Volume2 size={18} aria-hidden /> : <VolumeX size={18} aria-hidden />}
                <span className="btn-label">{s.sound ? "Sound on" : "Sound off"}</span>
              </button>
            </div>
            <p className="nm-controls-hint">
              W/↑ accelerate · S/↓ brake/reverse · A/D steer · Space boost · F dismount · H horn · Esc pause
            </p>
          </div>
        </div>
      )}

      {s.paused && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className="card pop" style={{ padding: 28, textAlign: "center", width: "min(380px, 90vw)" }}>
            <div id="pause-title" className="nm-display" style={{ fontSize: "1.5rem", fontWeight: 800 }}>
              <Pause size={22} style={{ verticalAlign: "middle", marginRight: 8 }} aria-hidden />
              Paused
            </div>
            <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: 8 }}>Take a breather, rider.</p>
            <button type="button" className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => eng?.resumeGame()}>
              <Play size={18} aria-hidden />
              Resume
            </button>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => eng?.startRun()}>
                <RotateCcw size={16} aria-hidden />
                Restart
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => eng?.quitToMenu()}>
                <LogOut size={16} aria-hidden />
                Quit
              </button>
            </div>
            <p style={{ fontSize: "0.72rem", opacity: 0.6, marginTop: 12 }}>Esc or P to resume</p>
            <p className="nm-pause-osm">
              Map data{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
                © OpenStreetMap contributors
              </a>
            </p>
          </div>
        </div>
      )}

      {s.phase === "countdown" && !s.paused && (
        <div className="modal-backdrop" style={{ background: "transparent", zIndex: 12 }}>
          <div className="nm-countdown pop" aria-live="assertive">
            {s.countdown > 0 ? s.countdown : "Go!"}
          </div>
        </div>
      )}

      {inGame && s.phase !== "countdown" && (
        <>
          <div className="hud-top">
            <div className="hud-top-left">
              <div className="hud-top-left-cluster">
                <span className="pill">
                  <Flame size={14} aria-hidden />
                  {s.streak} streak
                </span>
                {s.strikes > 0 && (
                  <span className="pill pill--urgent">
                    <AlertTriangle size={14} aria-hidden />
                    {s.strikes}/3
                  </span>
                )}
                {!s.paused && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => eng?.pauseGame()} aria-label="Pause game">
                    <Pause size={14} aria-hidden />
                    Pause
                  </button>
                )}
              </div>
              <button type="button" className="btn btn-ghost btn-sm hud-top-foot-btn" onClick={() => eng?.toggleFoot()} aria-label={s.onFoot ? "Mount bike" : "Dismount bike"}>
                <UserRound size={14} aria-hidden />
                {s.onFoot ? (s.nearBike ? "F mount" : "On foot") : "F off"}
              </button>
            </div>
            <div className="hud-top-center">
              <span className={`pill pill--timer ${timerUrgent ? "pill--urgent" : ""}`}>
                <Clock size={15} aria-hidden />
                {(s.phase === "toDropoff" || s.phase === "toPickup")
                  ? fmtTime(s.timeLeft)
                  : s.order
                    ? fmtTime(s.order.timeTotal)
                    : "--:--"}
              </span>
              {s.runStats.shiftTimeLeft > 0 && (
                <span className="pill" style={{ fontSize: "0.68rem", opacity: 0.9 }}>
                  Shift {fmtTime(s.runStats.shiftTimeLeft)}
                </span>
              )}
            </div>
            <div className="hud-top-right">
              <span className="pill pill--money">
                <Banknote size={14} aria-hidden />
                GHS {s.earnings.toFixed(2)}
              </span>
              <span className="pill pill--rating">
                <Star size={14} aria-hidden />
                {s.rating.toFixed(1)}
              </span>
            </div>
            <div className="hud-top-phone">
              <DeliveryPhone onAccept={() => eng?.acceptOrder()} />
            </div>
          </div>
          {s.turnHint && (s.phase === "toPickup" || s.phase === "toDropoff") && (
            <div className="hud-turn-hint">
              <span className="pill pill--hint pop">{s.turnHint}</span>
            </div>
          )}
          {s.banner && (
            <div className="hud-banner">
              <span className="pop pill">{s.banner}</span>
            </div>
          )}
          <div className="hud-toasts" aria-live="polite">
            {s.toasts.map((t) => (
              <span key={t.id} className="pill pop">
                {t.text}
              </span>
            ))}
          </div>
          <div className="hud-stats-panel">
            <div className={`hud-stat-label ${s.fuel < 20 ? "pill--urgent" : ""}`} style={{ color: s.fuel < 20 ? undefined : "inherit" }}>
              <Fuel size={13} aria-hidden />
              Fuel {Math.round(s.fuel)}%
            </div>
            <div className={`loading-bar loading-bar--fuel ${s.fuel >= 20 ? "" : ""}`}>
              <div
                style={{
                  width: `${Math.round(s.fuel)}%`,
                  background:
                    s.fuel < 20
                      ? undefined
                      : s.fuel < 40
                        ? "linear-gradient(90deg,#ff922b,#ffb347)"
                        : "linear-gradient(90deg,#006b3f,#6ee7a8)",
                }}
              />
            </div>
            <div className="hud-stat-label" style={{ marginTop: 8 }}>
              <Zap size={13} aria-hidden />
              {s.boost > 15 ? "Boost ready" : "Boost…"}
            </div>
            <div className="loading-bar loading-bar--boost">
              <div style={{ width: `${Math.round(s.boost)}%` }} />
            </div>
            <div className="hud-stat-meta">
              <Gauge size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} aria-hidden />
              {s.speedKmh} km/h · {s.deliveries} drops · {s.score.toLocaleString()} pts
            </div>
          </div>
          <div className="hud-bottom-cluster">
            <canvas ref={mapRef} id="minimap" width={150} height={150} aria-label="Minimap" />
            <div className="nm-touch-layer">
              <div ref={joyRef} className="touch-joy" aria-label="Steering joystick">
                <div className="touch-joy-inner" />
              </div>
              <div className="touch-pad">
                <div className="touch-btn" role="button" tabIndex={0} {...hold("down")}>
                  {s.onFoot ? "Back" : "Brake"}
                </div>
                <div className="touch-btn" role="button" tabIndex={0} {...hold("up")}>
                  {s.onFoot ? "Walk" : "Gas"}
                </div>
                <div className="touch-btn touch-btn--boost" role="button" tabIndex={0} {...hold("boost")}>
                  Boost
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {s.phase === "gameover" &&
        (() => {
          const summary = s.runSummary;
          const onTimePct = summary
            ? Math.round(summary.onTimeRate * 100)
            : Math.round((s.runStats.deliveriesOnTime / Math.max(1, s.runStats.deliveryAttempts)) * 100);
          const distKm = summary ? summary.distanceMetres / 1000 : s.runStats.distanceMetres / 1000;
          const stars = summary?.stars ?? 3;
          const starText = summary?.starLabel ?? "Solid shift";
          return (
            <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="results-title">
              <div className="card card-narrow nm-results pop">
                <div className="nm-logo-wrap" style={{ margin: "0 auto" }}>
                  <img src="/brand/night-market-logo.png" alt="" className="nm-logo" style={{ width: 72 }} />
                </div>
                <h2 id="results-title">Shift results</h2>
                <p style={{ margin: "0 0 8px", opacity: 0.75, fontSize: "0.85rem" }}>{summary?.reason.label ?? "Shift ended"}</p>
                <StarRating stars={stars} />
                <div style={{ fontSize: "0.82rem", fontWeight: 700, opacity: 0.88, marginBottom: 4 }}>
                  {starText} · {s.rating.toFixed(1)} rider rating
                </div>
                <div className="nm-stat-grid">
                  <div className="nm-stat-row">
                    <span>Deliveries</span>
                    <span>{s.deliveries}</span>
                  </div>
                  <div className="nm-stat-row">
                    <span>Earnings</span>
                    <span>GHS {s.earnings.toFixed(2)}</span>
                  </div>
                  <div className="nm-stat-row">
                    <span>Tips</span>
                    <span>GHS {(summary?.tipsGhs ?? s.runStats.tipsGhs).toFixed(2)}</span>
                  </div>
                  <div className="nm-stat-row">
                    <span>On-time rate</span>
                    <span>{onTimePct}%</span>
                  </div>
                  <div className="nm-stat-row">
                    <span>Distance ridden</span>
                    <span>{distKm.toFixed(1)} km</span>
                  </div>
                  <div className="nm-stat-row">
                    <span>Crashes</span>
                    <span>{summary?.crashCount ?? s.runStats.crashCount}</span>
                  </div>
                  <div className="nm-stat-row">
                    <span>Best streak</span>
                    <span>{s.bestStreak}</span>
                  </div>
                  <div className="nm-stat-row nm-stat-row--total">
                    <span>Score</span>
                    <span>{s.score.toLocaleString()}</span>
                  </div>
                </div>
                <label className="sr-only" htmlFor="nm-nickname">
                  Nickname for leaderboard
                </label>
                <input
                  id="nm-nickname"
                  className="nm-input"
                  value={s.nickname}
                  onChange={(e) => {
                    s.set({ nickname: e.target.value.slice(0, 14) });
                    try {
                      localStorage.setItem("nm_name", e.target.value.slice(0, 14));
                    } catch {}
                  }}
                  placeholder="Your nickname"
                  autoComplete="nickname"
                />
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      saveBoard(s.nickname || "Rider", s.score);
                      eng?.startRun();
                    }}
                  >
                    <Play size={16} aria-hidden />
                    Play again
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowBoard(true)}>
                    <Trophy size={16} aria-hidden />
                    Leaderboard
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: "100%", marginTop: 8 }}
                  onClick={() => {
                    const txt = `Night Market Rider: GHS ${s.earnings.toFixed(2)} · ${s.deliveries} deliveries · ${s.score.toLocaleString()} pts`;
                    if (navigator.share) navigator.share({ title: "Night Market Rider", text: txt }).catch(() => {});
                    else {
                      try {
                        navigator.clipboard.writeText(txt);
                      } catch {}
                      s.pushToast("Score copied — share am!");
                    }
                  }}
                >
                  <Share2 size={16} aria-hidden />
                  Share score
                </button>
              </div>
            </div>
          );
        })()}

      {(showBoard || showHelp) && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={showBoard ? "board-title" : "help-title"}
          onClick={() => {
            setShowBoard(false);
            setShowHelp(false);
          }}
        >
          <div className="card nm-modal pop" style={{ padding: 24, width: "min(440px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
            {showBoard ? (
              <>
                <h3 id="board-title">Accra top riders</h3>
                {s.leaderboard.length === 0 && <p style={{ opacity: 0.7 }}>No shifts yet — be the first!</p>}
                {s.leaderboard.map((r, i) => (
                  <div key={i} className="nm-leaderboard-row">
                    <span>
                      {i + 1}. {r.name}
                    </span>
                    <span>{r.score.toLocaleString()}</span>
                  </div>
                ))}
                <p className="nm-modal-note">Local leaderboard · Supabase sync coming soon.</p>
              </>
            ) : (
              <>
                <h3 id="help-title">How to play</h3>
                <div className="nm-help-body">
                  <ol>
                    <li>Accept an order and follow the road to the vendor.</li>
                    <li>Pick up, then follow the route to the customer before time runs out.</li>
                    <li>Watch for cars, taxis, trotros, pedestrians, potholes, speed ramps, and goats. Near misses score +100.</li>
                    <li>Three strikes — crashes or late orders — end the shift early. Your shift also clocks out after 12 minutes.</li>
                    <li>Watch the phone for night events: chop rush surge pay, police checkpoints, and rain.</li>
                    <li>Stop beside a fuel station to refill. Boost with Space; hold S/↓ to brake or reverse from a stop.</li>
                    <li>Press F to walk; return to the parked bike and press F to remount.</li>
                    <li>Tap the phone header to tuck it while riding. Fast deliveries can earn tips.</li>
                  </ol>
                </div>
              </>
            )}
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 14 }}
              onClick={() => {
                setShowBoard(false);
                setShowHelp(false);
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
