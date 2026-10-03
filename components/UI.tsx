"use client";
import { useEffect, useRef, useState } from "react";
import { useGame, saveBoard } from "@/game/store";
import { engineRef } from "./GameClient";

function fmtTime(s: number) {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtKm(distUnits: number) { return `${Math.round(distUnits * 8)}m`; }

export default function UI({ ready, progress }: { ready: boolean; progress: number }) {
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
      const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
      g.clearRect(0, 0, W, H);
      g.save();
      g.beginPath(); g.arc(cx, cy, cx - 2, 0, Math.PI * 2); g.clip();
      g.fillStyle = "rgba(10,14,10,0.9)"; g.fillRect(0, 0, W, H);
      const scale = 0.85;
      const px = eng.px, pz = eng.pz, hd = eng.heading;
      g.translate(cx, cy); g.rotate(-hd + Math.PI);
      const X = (x: number) => (x - px) * scale;
      const Z = (z: number) => (z - pz) * scale;
      // roads
      g.strokeStyle = "#555"; g.lineWidth = 7;
      g.beginPath(); g.moveTo(X(-95), Z(0)); g.lineTo(X(95), Z(0)); g.stroke();
      g.beginPath(); g.moveTo(X(0), Z(-95)); g.lineTo(X(0), Z(95)); g.stroke();
      g.strokeStyle = "#444"; g.lineWidth = 4;
      for (const c of [-60, 60]) {
        g.beginPath(); g.moveTo(X(-66), Z(c)); g.lineTo(X(66), Z(c)); g.stroke();
        g.beginPath(); g.moveTo(X(c), Z(-66)); g.lineTo(X(c), Z(66)); g.stroke();
      }
      // route + target
      const o = useGame.getState().order;
      const ph = useGame.getState().phase;
      if (o && (ph === "toPickup" || ph === "toDropoff" || ph === "offer")) {
        const tx = ph === "toDropoff" ? o.dropX : o.pickupX;
        const tz = ph === "toDropoff" ? o.dropZ : o.pickupZ;
        g.strokeStyle = "#f2e35c"; g.lineWidth = 2.5; g.setLineDash([5, 4]);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(X(tx), Z(tz)); g.stroke(); g.setLineDash([]);
        g.fillStyle = ph === "toDropoff" ? "#51cf66" : "#f2e35c";
        g.beginPath(); g.arc(X(tx), Z(tz), 6, 0, Math.PI * 2); g.fill();
      }
      // fuel stations on minimap
      if (eng.world?.fuelStations) {
        for (const fs of eng.world.fuelStations) {
          const fx = X(fs.x), fz = Z(fs.z);
          g.fillStyle = "#ff922b";
          g.beginPath(); g.arc(fx, fz, 3.5, 0, Math.PI * 2); g.fill();
          g.strokeStyle = "#ffffff"; g.lineWidth = 1; g.stroke();
        }
      }
      g.restore();
      // player arrow (screen-aligned)
      g.save(); g.translate(cx, cy);
      g.fillStyle = "#f2e35c";
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3.5); g.lineTo(-6, 7); g.closePath(); g.fill();
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
      const eng = engineRef.current; if (!eng) return;
      // analog steering: use threshold but also provide proportional input
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
      const eng = engineRef.current; if (eng) { eng.input.left = false; eng.input.right = false; }
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
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const eng = engineRef.current; if (eng) { eng.audio.ensure(); eng.input[key] = true; } },
    onPointerUp: () => { const eng = engineRef.current; if (eng) eng.input[key] = false; },
    onPointerCancel: () => { const eng = engineRef.current; if (eng) eng.input[key] = false; },
    onPointerLeave: () => { const eng = engineRef.current; if (eng) eng.input[key] = false; },
  });

  if (!ready) {
    return (
      <div className="hud-layer" style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0c" }}>
        <div className="card pop" style={{ padding: 36, width: 340, textAlign: "center" }}>
          <img src="/brand/night-market-logo.png" alt="Night Market" style={{ width: 120, background: "#000", borderRadius: 14, padding: 8 }} />
          <h2 style={{ margin: "14px 0 6px" }}>Preparing your Night Market shift…</h2>
          <p style={{ opacity: 0.7, fontSize: 13 }}>Loading Accra · rider · traffic</p>
          <div className="loading-bar"><div style={{ width: `${progress}%` }} /></div>
        </div>
      </div>
    );
  }

  const eng = engineRef.current;
  const inGame = ["offer", "toPickup", "pickup", "toDropoff", "deliver", "delivered", "countdown"].includes(s.phase);

  return (
    <div className="hud-layer">
      {s.phase === "menu" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 46, background: "linear-gradient(transparent 40%, rgba(0,0,0,0.72))" }}>
          <div className="card pop" style={{ padding: "26px 30px", width: "min(480px, 92vw)", textAlign: "center", pointerEvents: "auto" }}>
            <img src="/brand/night-market-logo.png" alt="Night Market" style={{ width: 150, background: "#000", borderRadius: 16, padding: 10 }} />
            <div style={{ fontSize: 13, letterSpacing: 6, opacity: 0.8, marginTop: 8 }}>NIGHT MARKET</div>
            <h1 style={{ margin: "2px 0 4px", fontSize: 44, letterSpacing: 2 }}>RIDER</h1>
            <p style={{ margin: "0 0 14px", opacity: 0.85, fontWeight: 700 }}>Deliver Accra. Beat the clock.</p>
            <button className="btn btn-primary" style={{ width: "100%", pointerEvents: "auto" }} onClick={() => eng?.startRun()}>START RIDING 🛵</button>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 14 }} onClick={() => setShowBoard(true)}>Leaderboard</button>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 14 }} onClick={() => setShowHelp(true)}>How to Play</button>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 14 }} onClick={() => { const v = !s.sound; s.set({ sound: v }); if (eng) eng.audio.setEnabled(v); }}>Sound {s.sound ? "ON" : "OFF"}</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.65, marginTop: 12 }}>W/↑ accelerate · S/↓ brake · A D steer · SPACE boost · H horn · ESC pause</p>
          </div>
        </div>
      )}

      {s.paused && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", pointerEvents: "auto" }}>
          <div className="card pop" style={{ padding: 28, textAlign: "center", width: "min(360px, 90vw)", pointerEvents: "auto" }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>⏸ PAUSED</div>
            <p style={{ opacity: 0.7, fontSize: 13 }}>Take a breather, rider.</p>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={() => eng?.resumeGame()}>RESUME ▶</button>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 14 }} onClick={() => eng?.startRun()}>RESTART</button>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: 14 }} onClick={() => eng?.quitToMenu()}>QUIT</button>
            </div>
            <p style={{ fontSize: 12, opacity: 0.6, marginTop: 10 }}>ESC / P to resume</p>
          </div>
        </div>
      )}

      {s.phase === "countdown" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="pop" style={{ fontSize: 110, fontWeight: 900, color: "#f2e35c", textShadow: "0 10px 40px rgba(0,0,0,0.6)" }}>
            {s.countdown > 0 ? s.countdown : "LET'S RIDE!"}
          </div>
        </div>
      )}

      {inGame && s.phase !== "countdown" && (
        <>
          <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <span className="pill">🔥 {s.streak} STREAK</span>
            {s.strikes > 0 && <span className="pill" style={{ borderColor: "#ff6b6b" }}>⚠️ {s.strikes}/3</span>}
            {!s.paused && (
              <button className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => eng?.pauseGame()}>⏸ PAUSE</button>
            )}
          </div>
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)" }}>
            <span className="pill" style={{ fontSize: 16, borderColor: s.timeLeft < 15 && (s.phase === "toDropoff" || s.phase === "toPickup") ? "#ff6b6b" : "rgba(255,255,255,0.16)" }}>
              ⏱ {(s.phase === "toDropoff" || s.phase === "toPickup") ? fmtTime(s.timeLeft) : s.order ? fmtTime(s.order.timeTotal) : "--:--"}
            </span>
          </div>
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
            <span className="pill">GHS {s.earnings.toFixed(2)}</span>
            <span className="pill">⭐ {s.rating.toFixed(1)}</span>
          </div>
          {s.order && (s.phase === "toPickup" || s.phase === "toDropoff") && (
            <div style={{ position: "absolute", top: 56, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
              <span className="pill" style={{ borderColor: "#f2e35c" }}>
                📍 {s.phase === "toPickup" ? `${s.order.vendor}` : `${s.order.customer} — ${s.order.dropoff}`} · {fmtKm(s.distM)}
              </span>
              {s.turnHint ? <div style={{ marginTop: 6 }}><span className="pill" style={{ background: "#f2e35c", color: "#111" }}>{s.turnHint}</span></div> : null}
            </div>
          )}
          {s.banner && (
            <div style={{ position: "absolute", top: "30%", width: "100%", textAlign: "center" }}>
              <span className="pop pill" style={{ fontSize: 20, background: "#ff922b", color: "#111", border: "none", padding: "10px 22px" }}>{s.banner}</span>
            </div>
          )}
          <div style={{ position: "absolute", left: 12, bottom: 110, display: "flex", flexDirection: "column", gap: 6 }}>
            {s.toasts.map((t) => <span key={t.id} className="pill pop" style={{ background: "rgba(0,0,0,0.75)" }}>{t.text}</span>)}
          </div>
          {/* boost + speed */}
          <div style={{ position: "absolute", right: 14, bottom: 110, width: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 3, color: s.fuel < 20 ? '#ff6b6b' : '#fff' }}>⛽ FUEL {Math.round(s.fuel)}%</div>
            <div className="loading-bar" style={{ marginBottom: 6 }}><div style={{ width: `${Math.round(s.fuel)}%`, background: s.fuel < 20 ? '#ff6b6b' : s.fuel < 40 ? '#ff922b' : '#51cf66' }} /></div>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>{s.boost > 15 ? "BOOST — SPACE" : "BOOST…"}</div>
            <div className="loading-bar"><div style={{ width: `${Math.round(s.boost)}%` }} /></div>
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6 }}>{s.speedKmh} km/h · {s.deliveries} deliveries · {s.score.toLocaleString()} pts</div>
          </div>
          <canvas ref={mapRef} id="minimap" width={150} height={150} style={{ position: "absolute", left: 12, bottom: 12, width: 110, height: 110 }} />
          {/* touch controls */}
          <div ref={joyRef}
            style={{ position: "absolute", left: 140, bottom: 12, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.3)", pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>
            ◀ STEER ▶
          </div>
          <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", gap: 8 }}>
            <div className="touch-btn" {...hold("down")}>BRAKE</div>
            <div className="touch-btn" {...hold("up")}>GAS</div>
            <div className="touch-btn" {...hold("boost")}>BOOST</div>
          </div>
        </>
      )}

      {s.phase === "offer" && s.order && (
        <div style={{ position: "absolute", bottom: 140, left: "50%", transform: "translateX(-50%)", width: "min(420px, 92vw)", pointerEvents: "auto" }}>
          <div className="card pop" style={{ padding: 18 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{s.order.emoji} NEW ORDER</div>
            <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
              Vendor: <b>{s.order.vendor}</b><br />
              Customer: <b>{s.order.customer}</b> · Dropoff: <b>{s.order.dropoff}</b><br />
              Reward: <b className="nm-title">GHS {s.order.reward.toFixed(2)}</b> · Time: <b>{fmtTime(s.order.timeTotal)}</b>
            </div>
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} onClick={() => eng?.acceptOrder()}>ACCEPT ORDER</button>
          </div>
        </div>
      )}

      {(s.phase === "pickup" || s.phase === "deliver") && (
        <div style={{ position: "absolute", bottom: 150, left: "50%", transform: "translateX(-50%)" }}>
          <span className="pill pop" style={{ fontSize: 17, background: "#f2e35c", color: "#111", border: "none", padding: "12px 24px" }}>
            {s.phase === "pickup" ? "PICKING UP ORDER… 📦" : "HANDING OVER… 🍱"}
          </span>
        </div>
      )}

      {s.phase === "delivered" && s.lastDelivery && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="card pop" style={{ padding: 26, textAlign: "center", width: "min(400px, 90vw)" }}>
            <div style={{ fontSize: 30, fontWeight: 900 }}>DELIVERED! 🎉</div>
            <div style={{ marginTop: 8, lineHeight: 1.7, fontWeight: 700 }}>
              + GHS {s.lastDelivery.reward.toFixed(2)}<br />
              + {s.lastDelivery.xp} XP<br />
              ⭐ Customer Rating: {s.lastDelivery.rating.toFixed(1)}<br />
              🔥 {s.lastDelivery.streak} Delivery Streak
            </div>
          </div>
        </div>
      )}

      {s.phase === "gameover" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)" }}>
          <div className="card pop" style={{ padding: 28, textAlign: "center", width: "min(440px, 92vw)", pointerEvents: "auto" }}>
            <img src="/brand/night-market-logo.png" alt="Night Market" style={{ width: 90, background: "#000", borderRadius: 12, padding: 6 }} />
            <h2 style={{ margin: "8px 0" }}>SHIFT COMPLETE</h2>
            <div style={{ lineHeight: 1.8, fontWeight: 700 }}>
              Deliveries: {s.deliveries}<br />
              Earnings: GHS {s.earnings.toFixed(2)}<br />
              Average Rating: ⭐ {s.rating.toFixed(1)}<br />
              Score: {s.score.toLocaleString()}<br />
              Best Streak: 🔥 {s.bestStreak}
            </div>
            <input
              value={s.nickname}
              onChange={(e) => { s.set({ nickname: e.target.value.slice(0, 14) }); try { localStorage.setItem("nm_name", e.target.value.slice(0, 14)); } catch {} }}
              placeholder="Your nickname"
              style={{ marginTop: 12, width: "100%", padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", fontWeight: 800, textAlign: "center" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { saveBoard(s.nickname || "Rider", s.score); eng?.startRun(); }}>RIDE AGAIN</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => {
                const txt = `I earned GHS ${s.earnings.toFixed(2)} in Night Market Rider! Score ${s.score.toLocaleString()} 🛵`;
                if (navigator.share) navigator.share({ title: "Night Market Rider", text: txt }).catch(() => {});
                else { try { navigator.clipboard.writeText(txt); } catch {} s.pushToast("Score copied — share am! 📣"); }
              }}>SHARE SCORE</button>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setShowBoard(true)}>LEADERBOARD</button>
          </div>
        </div>
      )}

      {(showBoard || showHelp) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", pointerEvents: "auto" }} onClick={() => { setShowBoard(false); setShowHelp(false); }}>
          <div className="card pop" style={{ padding: 24, width: "min(420px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
            {showBoard ? (
              <>
                <h3 style={{ margin: "0 0 10px" }}>ACCRA TOP RIDERS</h3>
                {s.leaderboard.length === 0 && <p style={{ opacity: 0.7 }}>No shifts yet — be the first!</p>}
                {s.leaderboard.map((r, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 800 }}><span>{i + 1}. {r.name}</span><span>{r.score.toLocaleString()}</span></div>)}
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>Local leaderboard · Supabase sync coming soon.</div>
              </>
            ) : (
              <>
                <h3 style={{ margin: "0 0 10px" }}>How to Play</h3>
                <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                  1. <b>ACCEPT ORDER</b> → ride to the yellow vendor beam.<br />
                  2. <b>PICK UP</b> → then follow chevrons to the green drop beam.<br />
                  3. <b>DELIVER</b> before the timer runs out.<br />
                  4. Dodge trotros, taxis, potholes &amp; goats. Near misses earn +100.<br />
                  5. 3 strikes (crashes / late orders) ends the shift.<br />
                  6. Boost with SPACE — grab coins to recharge.
                </div>
              </>
            )}
            <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={() => { setShowBoard(false); setShowHelp(false); }}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
