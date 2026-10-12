"use client";
import { useGame } from "@/game/store";
import { cedis, orderDetails, packedItems, prepSeconds } from "@/game/delivery/order-details";
import { engineRef } from "./GameClient";

const TICKET_STAGES = ["vendor", "preparing", "collect", "checkBag", "fixingBag"];

/** Order ticket at the vendor; becomes the bag check once the food is handed over. */
export function PickupTicket() {
  const s = useGame();
  const stage = s.delivery.stage;
  if (!s.order || !TICKET_STAGES.includes(stage)) return null;
  // Only show once the rider is on foot near the counter.
  if (stage === "vendor" && (s.mounted || s.interactionDistance > 12)) return null;
  const d = orderDetails(s.order);
  const checking = stage === "checkBag" || stage === "fixingBag";
  const inBag = packedItems(d, s.delivery.itemFixed);
  const eng = engineRef.current;
  return (
    <section className={`pickup-ticket${checking ? " is-checking" : ""}`} aria-label="Order ticket">
      <header>
        <span>{d.code}</span>
        <b>{d.payment === "cash" ? `CASH · ${cedis(d.foodTotal)}` : "PAID · MOMO"}</b>
      </header>
      <h3>{s.order.vendor}</h3>
      <p className="ticket-person">{d.vendorPerson} · for {s.order.customer}</p>
      {checking ? (
        <div className="bag-compare">
          <div>
            <p className="eyebrow">TICKET</p>
            <ul>
              {d.items.map(item => (
                <li key={item.name}>
                  <i>{item.qty}×</i> {item.name}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">IN THE BAG</p>
            <ul>
              {inBag.map(item => (
                <li key={item.name}>
                  <i>{item.qty}×</i> {item.name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <ul className="ticket-items">
          {d.items.map(item => (
            <li key={item.name}>
              <i>{item.qty}×</i> {item.name}
            </li>
          ))}
        </ul>
      )}
      {stage === "preparing" && (
        <div className="prep-bar" aria-label="Preparation progress">
          <span>Packing your order · {Math.ceil(s.delivery.remaining)} s</span>
          <i style={{ width: `${Math.max(4, 100 - (s.delivery.remaining / prepSeconds(s.orderIndex)) * 100)}%` }} />
        </div>
      )}
      {stage === "fixingBag" && <p className="ticket-note">{d.vendorPerson} is adding the missing item…</p>}
      {stage === "checkBag" && (
        <>
          <p className="ticket-note">Compare the bag with the ticket before you leave.</p>
          <div className="ticket-actions">
            <button className="btn btn-ghost" onClick={() => eng?.reportMissing()}>
              SOMETHING’S MISSING <kbd>2</kbd>
            </button>
            <button className="btn btn-primary" onClick={() => eng?.approveBag()}>
              ALL THERE · TAKE BAG <kbd>1</kbd>
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** Cash-on-delivery: the customer hands over a note and the rider picks the change. */
export function CashPayment() {
  const s = useGame();
  if (!s.order || s.delivery.stage !== "payment") return null;
  const d = orderDetails(s.order);
  const eng = engineRef.current;
  return (
    <section className="cash-panel" aria-label="Cash payment">
      <p className="eyebrow">CASH ON DELIVERY · {d.code}</p>
      <h3>
        {s.order.customer} hands you <b>{cedis(d.cashNote)}</b>
      </h3>
      <p>
        Food total {cedis(d.foodTotal)}. How much change do you give back?
      </p>
      <div className="change-options">
        {d.changeOptions.map((amount, i) => (
          <button key={amount} className="btn btn-ghost" onClick={() => eng?.giveChange(amount)}>
            {cedis(amount)} <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Contextual "press F" prompt near the bottom of the screen. */
export function InteractionPrompt() {
  const s = useGame();
  const stage = s.delivery.stage;
  if (!s.order || s.phoneOpen) return null;
  const d = orderDetails(s.order);
  const near = s.interactionDistance;
  let key = "";
  let text = "";
  let hint = "";
  if ((stage === "vendor" || stage === "findCustomer") && s.mounted) {
    if (s.speedKmh < 3.6) { key = "E"; text = "Get off your bike"; }
    else hint = "Slow down and park";
  } else if (stage === "vendor" || stage === "collect" || stage === "findCustomer") {
    const who = stage === "findCustomer" ? s.order.customer : d.vendorPerson;
    const verb = stage === "vendor" ? `Confirm order with ${who}` : stage === "collect" ? `Collect the bag from ${who}` : `Hand over to ${who}`;
    if (near < 3) { key = "F"; text = verb; }
    else if (near < 40) hint = `Walk to ${who} · ${Math.round(near)} m`;
  } else if (stage === "returnBike") {
    if (s.bikeDistance < 3) { key = "E"; text = "Mount and secure the bag"; }
    else hint = `Walk back to your bike · ${Math.round(s.bikeDistance)} m`;
  } else if (stage === "contact" && s.delivery.remaining <= 0) {
    if (s.speedKmh < 3.6) { key = "F"; text = `Call ${s.order.customer}`; }
    else hint = "Stop to call the customer";
  }
  if (!text && !hint) return null;
  const eng = engineRef.current;
  // Tappable on touch screens; F/E work on keyboards.
  return (
    <button
      type="button"
      className={`interact-prompt${key ? " is-ready" : ""}`}
      disabled={!key}
      onClick={() => (key === "E" ? eng?.toggleMount() : eng?.interact())}
    >
      {key && <kbd>{key}</kbd>}
      <span>{text || hint}</span>
    </button>
  );
}
