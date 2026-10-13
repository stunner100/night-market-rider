"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { customerDetails } from "@/game/delivery/customer";
import { CONTACTS } from "@/game/calls";
import { ARCHETYPES } from "@/game/archetypes";
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
  const reading = s.phoneOpen && tab === "Messages" && s.unread > 0;
  useEffect(() => {
    if (reading) useGame.getState().set({ unread: 0 });
  }, [reading]);
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
            {t === "Messages" && s.unread > 0 && <span className="unread-badge">{s.unread}</span>}
          </button>
        ))}
      </nav>
      <div className="phone-content">
        <h2>
          {s.delivery.stage === "calling"
            ? `Dey call ${s.order?.customer}…`
            : tab}
        </h2>
        {s.delivery.stage === "calling" ? (
          <>
            <div className="call-avatar">{s.order?.customer[0]}</div>
            <p>
              00:0{Math.max(0, 3 - Math.ceil(s.delivery.remaining))} ·
              E dey ring
            </p>
          </>
        ) : (
          <>
            {(tab === "Home" || tab === "Orders") && (
              <>
                <p className="eyebrow">THE ORDER WEY DEY</p>
                <h3>{deliveryObjective(s.delivery.stage, s.mounted)}</h3>
                <p>
                  {s.order
                    ? `${s.order.vendor} → ${s.order.customer} · ${s.order.dropoff}`
                    : "No order now. Roam small or go online."}
                </p>
                <p>{s.order?.food}</p>
                {s.order?.address && <p className="muted">📍 {s.order.address}</p>}
                {s.delivery.message && !awaitingReply && <p className="phone-message">{s.delivery.message}</p>}
                <button
                  className="btn btn-primary"
                  onClick={() => engineRef.current?.toggleOnline()}
                >
                  {online ? "GO OFFLINE" : "GO ONLINE"}
                </button>
                {s.order && (
                  <p className="muted">
                    If you go offline, the order go cancel o.
                  </p>
                )}
              </>
            )}
            {tab === "Map" && (
              <>
                <p>{s.turnHint || "Roam the Legon side"}</p>
                <button
                  className="btn btn-ghost"
                  disabled={!!s.order}
                  onClick={() => engineRef.current?.navigateTo("base")}
                >
                  SHOW ME THE BASE
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={!!s.order}
                  onClick={() => engineRef.current?.navigateTo("fuel")}
                >
                  WHERE FUEL DEY?
                </button>
                <h3>{Math.round(s.distM)} m more</h3>
                <p>
                  Yellow: vendor · Green: customer
                  <br />
                  Orange: fuel · Blue: landmarks
                </p>
                <p>
                  Follow the arrows for the road and the minimap. You miss
                  turn? No wahala, the route go change itself.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => s.set({ phoneOpen: false })}
                >
                  BACK TO GPS
                </button>
              </>
            )}
            {s.order && (tab === "Messages" || tab === "Calls" || ((tab === "Home" || tab === "Orders") && awaitingReply)) && (
              <>
                <p className="phone-message">
                  {s.order
                    ? s.delivery.message ||
                      `${s.order.customer}: ${customerDetails(s.order.id, s.order.meeting).note}`
                    : "Customer chats go show here."}
                </p>
                <button
                  className="btn btn-primary"
                  disabled={!canCall}
                  onClick={() => engineRef.current?.callCustomer()}
                >
                  {awaitingReply ? "CALL AGAIN" : "CALL CUSTOMER"}
                </button>
                <p className="muted">
                  {awaitingReply && s.delivery.remaining > 0
                    ? `Call again in ${Math.ceil(s.delivery.remaining)} s, or text am say you don reach.`
                    : "Stop within 85 m of the place before you call."}
                </p>
                <button
                  className="btn btn-ghost"
                  disabled={!canMessage}
                  onClick={() => engineRef.current?.messageCustomer()}
                >
                  {awaitingReply ? "TEXT: “I DON REACH”" : "TEXT: “I DEY COME”"}
                </button>
                {s.delivery.messageSent && <p role="status">Sent ✓</p>}
                {s.order && <p className="muted">Customer note: {customerDetails(s.order.id, s.order.meeting).note}</p>}
              </>
            )}
            {tab === "Messages" && (
              <ul className="inbox" aria-label="Messages">
                {s.inbox.map((m) => (
                  <li key={m.id}>
                    <span className="inbox-face" aria-hidden="true">{CONTACTS[m.from].avatar}</span>
                    <div>
                      <b>{m.name}</b> <time>{m.time}</time>
                      <p>{m.text}</p>
                    </div>
                  </li>
                ))}
                {!s.inbox.length && <li className="muted">No message yet.</li>}
              </ul>
            )}
            {tab === "Calls" && s.callLog.length > 0 && (
              <ul className="inbox" aria-label="Recent calls">
                {s.callLog.map((c) => (
                  <li key={c.id} className={c.missed ? "is-missed" : ""}>
                    <span className="inbox-face" aria-hidden="true">{CONTACTS[c.from].avatar}</span>
                    <div>
                      <b>{c.name}</b> <time>{c.time}</time>
                      <p>{c.missed ? "Missed call ↙" : "Answered ↘"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {tab === "Earnings" && (
              <>
                <p className="eyebrow">YOUR CHOP MONEY · SAVED ON THIS PHONE</p>
                <div className="phone-money">GH₵{s.earnings.toFixed(2)}</div>
                <p>{s.deliveries} deliveries done</p>
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
                {s.archetype && (
                  <p>
                    {ARCHETYPES[s.archetype].emoji} {ARCHETYPES[s.archetype].name} · {ARCHETYPES[s.archetype].upside}
                  </p>
                )}
                <p>
                  Level {1 + Math.floor(s.xp / 2000)} · {s.xp} XP
                </p>
                <p>{(s.distanceRidden / 1000).toFixed(1)} km ridden</p>
                <p>Legon · Okponglo · Shiashie side</p>
                <button className="btn btn-ghost" disabled={!!s.order} onClick={() => s.set({ garageOpen: true, phoneOpen: false })}>
                  🏍️ GARAGE{s.order ? " · finish the order first" : ""}
                </button>
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
        FUEL FINISH? CALL THE BASE
      </button>
      <footer>Night Market Rider · Simulated rider app</footer>
    </section>
  );
}
