/** Pure payout/rating settlement for a finished delivery. */
export interface SettlementInput {
  fare: number;
  streakMultiplier: number;
  /** 0–100 food condition on arrival. */
  condition: number;
  onTime: boolean;
  /** Seconds left on the order clock (negative is never passed; 0 when late). */
  timeLeft: number;
  collisions: number;
  missingAccepted: boolean;
  missingItem?: string;
  itemFixed: boolean;
  /** Change given minus change owed (cash orders). */
  changeError: number;
}

export interface SettlementLine {
  label: string;
  amount: number;
}

export interface Settlement {
  payout: number;
  tip: number;
  rating: number;
  xpBonus: number;
  comment: string;
  lines: SettlementLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function settleDelivery(i: SettlementInput): Settlement {
  const quality = Math.max(0, Math.min(1, i.condition / 100));
  const shortChanged = i.changeError < -0.001;
  const overpaid = i.changeError > 0.001;
  // Customers tip for warm, intact, complete food delivered on time.
  let tip = Math.round(i.fare * 0.4 * quality * quality * (i.onTime ? 1 : 0.3) * 2) / 2;
  if (i.missingAccepted || shortChanged) tip = 0;

  const lines: SettlementLine[] = [{ label: "Delivery fare", amount: round2(i.fare) }];
  if (i.streakMultiplier > 1) lines.push({ label: `Streak ×${i.streakMultiplier}`, amount: round2(i.fare * (i.streakMultiplier - 1)) });
  if (tip > 0) lines.push({ label: "Customer tip", amount: tip });
  // Extra change handed over comes out of the rider's pocket.
  if (overpaid) lines.push({ label: "Extra change given", amount: -round2(i.changeError) });
  const payout = round2(Math.max(0, lines.reduce((sum, line) => sum + line.amount, 0)));

  let rating = 5 - i.collisions * 0.3 - (1 - quality) * 1.6 - (i.timeLeft < 10 ? 0.3 : 0);
  if (i.missingAccepted) rating -= 1.2;
  if (shortChanged) rating -= 1;
  rating = Math.round(Math.min(5, Math.max(1, rating)) * 10) / 10;

  const xpBonus = i.itemFixed ? 150 : 0;

  let comment = "Thank you, rider!";
  if (i.missingAccepted) comment = `${i.missingItem ?? "Part of my order"} was missing from my bag 😕`;
  else if (shortChanged) comment = "My change was short. Please count well next time.";
  else if (i.condition < 60) comment = "The food was all shaken up.";
  else if (!i.onTime) comment = "Came a bit late, but thanks.";
  else if (i.condition >= 95 && i.collisions === 0) comment = "Still hot! Medaase paa 🔥";
  else if (i.itemFixed) comment = "Everything was there. Thanks for checking!";

  return { payout, tip, rating, xpBonus, comment, lines };
}
