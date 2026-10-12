"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { customerDetails } from "@/game/delivery/customer";
import { deliveryObjective } from "@/game/delivery/machine";
import { engineRef } from "./GameClient";
const tabs = [
  "Home",
  "Orders",
  "Map",
  "Messages",
  "Calls",
  "Earnings",
  "Profile",
  "Performance",
] as const;
export default function RiderPhone() {
  const s = useGame();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Home");

  useEffect(() => {
    if (s.delivery.stage === "calling") setTab("Calls");
  }, [s.delivery.stage]);
  if (!s.phoneOpen) return null;
  const online = s.delivery.stage !== "offline";
  const canCall =
    !!s.order &&
    ["rideCustomer", "contact"].includes(s.delivery.stage) &&
    (s.delivery.stage === "contact" || s.distM < 85) &&
    s.delivery.remaining <= 0 && s.speedKmh < 3.6;
  const awaitingReply = s.delivery.stage === "contact" && s.delivery.callAttempts > 0;
  const canMessage = !!s.order && !s.delivery.messageSent && s.speedKmh < 3.6 &&
    ["returnBike", "rideCustomer", "contact", "findCustomer"].includes(s.delivery.stage);
  return (
    <section className="rider-phone" aria-label="Night Market rider phone">
      <header>
        <img src="/brand/night-market-logo.png" alt="Night Market" />
        <button
          aria-label="Close phone"
          onClick={() => s.set({ phoneOpen: false })}
        >
          ✕
        </button>
      </header>
      <div className="phone-status">
        {online ? "● ONLINE" : "○ OFFLINE"}{" "}
        <span>
          ACCRA · {Math.floor(s.hour).toString().padStart(2, "0")}:
          {Math.floor((s.hour % 1) * 60)
            .toString()
            .padStart(2, "0")}
        </span>
      </div>
      <nav aria-label="Phone sections">
        {tabs.map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="phone-content">
        <h2>
          {s.delivery.stage === "calling"
            ? `Calling ${s.order?.customer}…`
            : tab}
        </h2>
        {s.delivery.stage === "calling" ? (
          <>
            <div className="call-avatar">{s.order?.customer[0]}</div>
            <p>
              00:0{Math.max(0, 3 - Math.ceil(s.delivery.remaining))} ·
              Connecting
            </p>
          </>
        ) : (
          <>
            {(tab === "Home" || tab === "Orders") && (
              <>
                <p className="eyebrow">CURRENT DELIVERY</p>
                <h3>{deliveryObjective(s.delivery.stage, s.mounted)}</h3>
                <p>
                  {s.order
                    ? `${s.order.vendor} → ${s.order.customer} · ${s.order.dropoff}`
                    : "No active order. Take a ride or go online."}
                </p>
                <p>{s.order?.food}</p>
                {s.delivery.message && !awaitingReply && <p className="phone-message">{s.delivery.message}</p>}
                <button
                  className="btn btn-primary"
                  onClick={() => engineRef.current?.toggleOnline()}
                >
                  {online ? "GO OFFLINE" : "GO ONLINE"}
                </button>
                {s.order && (
                  <p className="muted">
                    Going offline cancels the current delivery.
                  </p>
                )}
              </>
            )}
            {tab === "Map" && (
              <>
                <p>{s.turnHint || "Explore the Legon corridor"}</p>
                <button
                  className="btn btn-ghost"
                  disabled={!!s.order}
                  onClick={() => engineRef.current?.navigateTo("base")}
                >
                  ROUTE TO RIDER BASE
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!!s.order}
                  onClick={() => engineRef.current?.navigateTo("fuel")}
                >
                  FIND FUEL STATION
                </button>
                <h3>{Math.round(s.distM)} m to destination</h3>
                <p>
                  Yellow: vendor · Green: customer
                  <br />
                  Orange: fuel · Blue: landmarks
                </p>
                <p>
                  Follow the road chevrons and the live minimap. Miss a turn?
                  Your route recalculates automatically.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => s.set({ phoneOpen: false })}
                >
                  RETURN TO GPS
                </button>
              </>
            )}
            {(tab === "Messages" || tab === "Calls" || ((tab === "Home" || tab === "Orders") && awaitingReply)) && (
              <>
                <p className="phone-message">
                  {s.order
                    ? s.delivery.message ||
                      `${s.order.customer}: ${customerDetails(s.order.id).note}`
                    : "Your customer conversations will appear here."}
                </p>
                <button
                  className="btn btn-primary"
                  disabled={!canCall}
                  onClick={() => engineRef.current?.callCustomer()}
                >
                  {awaitingReply ? "RETRY CALL" : "CALL CUSTOMER"}
                </button>
                <p className="muted">
                  {awaitingReply && s.delivery.remaining > 0
                    ? `Retry in ${Math.ceil(s.delivery.remaining)} s, or send an arrival message.`
                    : "Stop within 85 m of the destination to call."}
                </p>
                <button
                  className="btn btn-ghost"
                  disabled={!canMessage}
                  onClick={() => engineRef.current?.messageCustomer()}
                >
                  {awaitingReply ? "MESSAGE: I’VE ARRIVED" : "MESSAGE: ON MY WAY"}
                </button>
                {s.delivery.messageSent && <p role="status">Sent ✓</p>}
                {s.order && <p className="muted">Delivery note: {customerDetails(s.order.id).note}</p>}
              </>
            )}
            {tab === "Earnings" && (
              <>
                <p className="eyebrow">TOTAL EARNINGS · SAVED ON THIS DEVICE</p>
                <div className="phone-money">GH₵{s.earnings.toFixed(2)}</div>
                <p>{s.deliveries} completed deliveries</p>
                <p>
                  Last delivery: GH₵
                  {s.lastDelivery?.reward.toFixed(2) ?? "0.00"}
                </p>
              </>
            )}
            {tab === "Profile" && (
              <>
                <div className="call-avatar">{s.nickname[0]}</div>
                <h3>{s.nickname} · Night Market Rider</h3>
                <p>
                  Level {1 + Math.floor(s.xp / 2000)} · {s.xp} XP
                </p>
                <p>{(s.distanceRidden / 1000).toFixed(1)} km ridden</p>
                <p>Legon / Okponglo / Shiashie corridor</p>
              </>
            )}
            {tab === "Performance" && (
              <dl>
                <dt>Customer rating</dt>
                <dd>{s.rating.toFixed(1)} / 5</dd>
                <dt>Acceptance · this shift</dt>
                <dd>
                  {s.delivery.offered
                    ? Math.round(
                        (s.delivery.accepted / s.delivery.offered) * 100,
                      )
                    : 0}
                  %
                </dd>
                <dt>On time</dt>
                <dd>
                  {s.deliveries
                    ? Math.round((s.onTime / s.deliveries) * 100)
                    : 100}
                  %
                </dd>
                <dt>Completed orders</dt>
                <dd>{s.deliveries}</dd>
              </dl>
            )}
          </>
        )}
      </div>
      <button
        className="btn btn-ghost"
        disabled={s.fuel > 0}
        onClick={() => engineRef.current?.roadsideAssist()}
      >
        OUT OF FUEL? CALL ASSISTANCE
      </button>
      <footer>Night Market Rider · Simulated rider app</footer>
    </section>
  );
}
