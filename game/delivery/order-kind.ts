/**
 * Order types give each offer a real trade-off, so accepting or passing is a
 * decision rather than a reflex. Pure and deterministic per order id.
 */
export type OrderKind = "standard" | "rush" | "soup" | "party";

export interface OrderKindInfo {
  kind: OrderKind;
  label: string;
  emoji: string;
  /** One line for the offer sheet: the catch and the reward. */
  blurb: string;
  fareMult: number;
  timeMult: number;
  /** Multiplier on food-condition loss while carrying. */
  spillMult: number;
  /** Multiplier on top speed while carrying. */
  speedMult: number;
}

export const ORDER_KINDS: Record<OrderKind, OrderKindInfo> = {
  standard: { kind: "standard", label: "Normal", emoji: "🛵", blurb: "", fareMult: 1, timeMult: 1, spillMult: 1, speedMult: 1 },
  rush: {
    kind: "rush", label: "Rush", emoji: "⚡", blurb: "Customer dey hungry — less time, bigger pay.",
    fareMult: 1.6, timeMult: 0.65, spillMult: 1, speedMult: 1,
  },
  soup: {
    kind: "soup", label: "Soup & drinks", emoji: "🍲", blurb: "E go spill fast — ride smooth, pay better.",
    fareMult: 1.3, timeMult: 1.05, spillMult: 1.9, speedMult: 1,
  },
  party: {
    kind: "party", label: "Party order", emoji: "🎉", blurb: "Big heavy box — bike slow small, extra time and pay.",
    fareMult: 1.55, timeMult: 1.3, spillMult: 1.2, speedMult: 0.86,
  },
};

/** First two orders teach the basics; after that roughly half the offers carry a twist. */
export function orderKind(id: number): OrderKind {
  if (id <= 2) return "standard";
  const h = (Math.imul(id, 2654435761) >>> 0) % 100;
  if (h < 18) return "rush";
  if (h < 36) return "soup";
  if (h < 50) return "party";
  return "standard";
}

export function applyOrderKind<T extends { id: number; reward: number; timeTotal: number }>(order: T): T & { kind: OrderKind } {
  const kind = orderKind(order.id);
  const info = ORDER_KINDS[kind];
  return {
    ...order,
    kind,
    reward: Math.round(order.reward * info.fareMult * 100) / 100,
    timeTotal: Math.round(order.timeTotal * info.timeMult),
  };
}
