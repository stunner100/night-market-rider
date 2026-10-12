/** Pure delivery state machine. World proximity and rider state are supplied by the engine. */
export type DeliveryStage =
  | "offline"
  | "waiting"
  | "offer"
  | "ridePickup"
  | "vendor"
  | "preparing"
  | "collect"
  | "checkBag"
  | "fixingBag"
  | "returnBike"
  | "rideCustomer"
  | "contact"
  | "calling"
  | "findCustomer"
  | "payment"
  | "handoff"
  | "completed";
export interface DeliveryState {
  stage: DeliveryStage;
  remaining: number;
  elapsed: number;
  offered: number;
  accepted: number;
  message: string;
  callAttempts: number;
  messageSent: boolean;
  /** Rider caught a missing item and the vendor added it. */
  itemFixed: boolean;
  /** Rider left the vendor with an incomplete bag. */
  missingAccepted: boolean;
  /** Times the rider wrongly claimed something was missing. */
  falseReports: number;
  /** Change given minus change owed on cash orders (0 when exact). */
  changeError: number;
}
export interface DeliveryContext {
  mounted: boolean;
  speed: number;
  vendorDistance: number;
  customerDistance: number;
  destinationDistance: number;
  bikeDistance: number;
  delay: number;
  customer: string;
  customerNote?: string;
  customerReply?: string;
  missesFirstCall?: boolean;
  /** The vendor packed this order without one item. */
  bagMissing?: boolean;
  vendorPerson?: string;
  cashOrder?: boolean;
  correctChange?: number;
}
export type DeliveryEvent =
  | {
      type:
        | "online"
        | "offline"
        | "offer"
        | "accept"
        | "decline"
        | "confirm"
        | "collect"
        | "message"
        | "call"
        | "handoff"
        | "approveBag"
        | "reportMissing";
    }
  | { type: "giveChange"; amount: number }
  | { type: "tick"; dt: number };
export const initialDelivery = (): DeliveryState => ({
  stage: "offline",
  remaining: 0,
  elapsed: 0,
  offered: 0,
  accepted: 0,
  message: "",
  callAttempts: 0,
  messageSent: false,
  itemFixed: false,
  missingAccepted: false,
  falseReports: 0,
  changeError: 0,
});
const move = (
  s: DeliveryState,
  stage: DeliveryStage,
  remaining = 0,
  message = s.message,
): DeliveryState => ({ ...s, stage, remaining, message });
export function reduceDelivery(
  s: DeliveryState,
  e: DeliveryEvent,
  c: DeliveryContext,
): DeliveryState {
  if (e.type === "offline")
    return move(s, "offline", 0, "You are offline. Explore at your own pace.");
  if (e.type === "online" && s.stage === "offline")
    return move(s, "waiting", 4, "Looking for nearby orders…");
  if (e.type === "offer" && s.stage === "waiting")
    return {
      ...move(s, "offer", 25, "A new delivery is available."),
      offered: s.offered + 1,
      elapsed: 0,
      callAttempts: 0,
      messageSent: false,
      itemFixed: false,
      missingAccepted: false,
      falseReports: 0,
      changeError: 0,
    };
  if (e.type === "accept" && s.stage === "offer" && s.remaining > 0)
    return { ...move(s, "ridePickup"), accepted: s.accepted + 1 };
  if (e.type === "decline" && s.stage === "offer")
    return move(
      s,
      "waiting",
      7,
      "Offer declined. Waiting for the next request.",
    );
  if (
    e.type === "confirm" &&
    s.stage === "vendor" &&
    !c.mounted &&
    c.vendorDistance < 3
  )
    return move(
      s,
      "preparing",
      c.delay,
      c.delay > 5
        ? "Vendor: One minute please — we’re finishing your food."
        : "Vendor: Night Market pickup? Let me pack that for you.",
    );
  if (
    e.type === "collect" &&
    s.stage === "collect" &&
    !c.mounted &&
    c.vendorDistance < 3
  )
    return move(s, "checkBag", 0, `${c.vendorPerson ?? "Vendor"}: Here you go. Check it against your ticket.`);
  if (e.type === "approveBag" && s.stage === "checkBag")
    return {
      ...move(
        s,
        "returnBike",
        0,
        `${c.customer}: ${c.customerNote ?? "Call when you reach the junction. I’m beside the yellow MoMo kiosk."}`,
      ),
      missingAccepted: !!c.bagMissing && !s.itemFixed,
    };
  if (e.type === "reportMissing" && s.stage === "checkBag") {
    if (c.bagMissing && !s.itemFixed)
      return move(s, "fixingBag", 3, `${c.vendorPerson ?? "Vendor"}: Ei, sorry! Let me add it now.`);
    return {
      ...move(s, "checkBag", 0, `${c.vendorPerson ?? "Vendor"}: Everything is there o — check the ticket again.`),
      falseReports: s.falseReports + 1,
    };
  }
  if (e.type === "giveChange" && s.stage === "payment")
    return {
      ...move(s, "handoff", 2, `${c.customer}: Thank you!`),
      changeError: Math.round((e.amount - (c.correctChange ?? 0)) * 100) / 100,
    };
  if (
    e.type === "call" &&
    (s.stage === "contact" || s.stage === "rideCustomer") &&
    s.remaining <= 0 &&
    c.destinationDistance < 85 &&
    Math.abs(c.speed) < 1
  )
    return { ...move(s, "calling", 3, `Calling ${c.customer}…`), callAttempts: s.callAttempts + 1 };
  if (e.type === "message" && !s.messageSent &&
      ["returnBike", "rideCustomer", "contact", "findCustomer"].includes(s.stage) && Math.abs(c.speed) < 1) {
    const canConfirm = s.stage === "contact" && s.callAttempts > 0 && c.destinationDistance < 85;
    return { ...move(s, canConfirm ? "findCustomer" : s.stage, canConfirm ? 0 : s.remaining,
      canConfirm ? `${c.customer}: Sorry, I missed your call. ${c.customerReply ?? "Meet me beside the yellow MoMo kiosk."}`
        : `You: I’m on my way. ${c.customer}: Thank you — ${c.customerNote ?? "call when you arrive."}`),
      messageSent: true };
  }
  if (
    e.type === "handoff" &&
    s.stage === "findCustomer" &&
    !c.mounted &&
    c.customerDistance < 3
  )
    return c.cashOrder
      ? move(s, "payment", 0, `${c.customer}: Medaase. I’m paying cash — here.`)
      : move(s, "handoff", 2, "Handing over your order…");
  if (e.type !== "tick") return s;
  const dt = Math.max(0, Math.min(e.dt, 1));
  const next = {
    ...s,
    remaining: Math.max(0, s.remaining - dt),
    elapsed:
      s.elapsed +
      (["offline", "waiting", "offer", "completed"].includes(s.stage) ? 0 : dt),
  };
  switch (s.stage) {
    case "offer":
      return next.remaining <= 0
        ? move(
            next,
            "waiting",
            7,
            "Offer expired. Another request will arrive shortly.",
          )
        : next;
    case "ridePickup":
      return c.vendorDistance < 22
        ? move(
            next,
            "vendor",
            0,
            "Park safely, get off and walk to the vendor.",
          )
        : next;
    case "vendor":
      return c.vendorDistance > 35 ? move(next, "ridePickup") : next;
    case "contact":
      return c.destinationDistance > 100 ? move(next, "rideCustomer") : next;
    case "fixingBag":
      return next.remaining <= 0
        ? { ...move(next, "checkBag", 0, "Item added. Check the bag once more."), itemFixed: true }
        : next;
    case "preparing":
      return next.remaining <= 0
        ? move(
            next,
            "collect",
            0,
            "Vendor: Your food is ready. Collect your order.",
          )
        : next;
    case "returnBike":
      return c.mounted ? move(next, "rideCustomer") : next;
    case "rideCustomer":
      return c.destinationDistance < 65 ? move(next, "contact") : next;
    case "calling":
      if (next.remaining <= 0 && c.missesFirstCall && s.callAttempts === 1)
        return move({ ...next, messageSent: false }, "contact", 5, "No answer. Try calling again, or send an arrival message.");
      return next.remaining <= 0
        ? move(
            next,
            "findCustomer",
            0,
            `${c.customer}: ${c.customerReply ?? "Hello! I’m beside the yellow MoMo kiosk. Look for my green marker."}`,
          )
        : next;
    case "handoff":
      return next.remaining <= 0
        ? move(next, "completed", 5, "Delivery complete. Medaase!")
        : next;
    case "completed":
      return next.remaining <= 0
        ? move(next, "waiting", 5, "Ready for another delivery.")
        : next;
    default:
      return next;
  }
}
export function deliveryPhase(stage: DeliveryStage) {
  if (stage === "offline" || stage === "waiting") return stage;
  if (stage === "offer") return "offer";
  if (["ridePickup", "vendor"].includes(stage)) return "toPickup";
  if (["preparing", "collect", "checkBag", "fixingBag"].includes(stage)) return "pickup";
  if (stage === "handoff" || stage === "payment") return "deliver";
  if (stage === "completed") return "delivered";
  return "toDropoff";
}
export function deliveryObjective(
  stage: DeliveryStage,
  mounted: boolean,
): string {
  const labels: Record<DeliveryStage, string> = {
    offline: "Explore Accra · go online when ready",
    waiting: "Waiting for a delivery request",
    offer: "Review your delivery offer",
    ridePickup: "Ride to the vendor",
    vendor: mounted
      ? "Park and get off your bike"
      : "Walk to the vendor · confirm order",
    preparing: "Vendor is preparing your food",
    collect: "Collect your order",
    checkBag: "Check the bag against the ticket",
    fixingBag: "Vendor is adding the missing item",
    returnBike: "Return to your parked bike",
    rideCustomer: "Deliver to the customer",
    contact: "Stop and call the customer",
    calling: "Connecting your call…",
    findCustomer: mounted
      ? "Park · find the customer on foot"
      : "Walk to the customer · hand over order",
    payment: "Collect cash · give the right change",
    handoff: "Handing over the food",
    completed: "Delivery complete",
  };
  return labels[stage];
}
