/**
 * People who call and text the rider. Game events raise triggers; the director
 * queues scripts and paces them so calls never land on top of a delivery task.
 * Pure: the engine supplies time, stage and context.
 */
export type ContactId = "dede" | "kofi" | "maame" | "yaw" | "momo" | "ecg" | "customer";

export const CONTACTS: Record<ContactId, { name: string; role: string; avatar: string }> = {
  dede: { name: "Auntie Dede", role: "Night Market dispatch", avatar: "👩🏾‍💼" },
  kofi: { name: "Kofi Mechanic", role: "Abossey Okai", avatar: "👨🏾‍🔧" },
  maame: { name: "Maame", role: "Mum", avatar: "👵🏾" },
  yaw: { name: "Bra Yaw", role: "Okada rider · Okponglo", avatar: "🧑🏾" },
  momo: { name: "MoMo", role: "Mobile money", avatar: "📲" },
  ecg: { name: "ECG Alert", role: "Electricity Company of Ghana", avatar: "⚡" },
  customer: { name: "Customer", role: "Night Market order", avatar: "🙋🏾" },
};

export type Trigger =
  | "shiftStart" | "shiftReturn" | "online" | "fuelLow" | "crash"
  | "delivered" | "perfect" | "streak3" | "night" | "late"
  | "rain" | "dumsor" | "fined";

export interface CallContext {
  nickname: string;
  customer?: string;
  payout?: number;
  earnings?: number;
  deliveries?: number;
  crashes?: number;
}

export interface Script {
  id: string;
  from: ContactId;
  trigger: Trigger;
  kind: "call" | "text";
  /** Call: lines spoken one by one. Text: one message per line. */
  lines: (c: CallContext) => string[];
  /** Left as a text when a call is declined or missed. */
  missed?: (c: CallContext) => string;
  /** May fire again (default: once per session). */
  repeat?: boolean;
  when?: (c: CallContext) => boolean;
  /** Display name override, e.g. the order's customer. */
  name?: (c: CallContext) => string;
}

export const SCRIPTS: Script[] = [
  {
    id: "dede-intro", from: "dede", trigger: "shiftStart", kind: "call",
    lines: c => [
      `Hello? Is this ${c.nickname}? Akwaaba to Night Market o! Na me be Auntie Dede, dispatch.`,
      "When you ready, go online. Orders go show — accept quick, customers no dey like wait.",
      "Check every bag before you comot from the vendor. Last week one boy forget shito — the customer insult me paa 😂",
      "Ride safe, you hear? Medaase!",
    ],
    missed: () => "Akwaaba! Go online when you ready. Check every bag well before you comot 🙏🏾",
  },
  {
    id: "dede-back", from: "dede", trigger: "shiftReturn", kind: "text",
    lines: c => [`${c.nickname}! You don come back 👋🏾 Go online, orders dey plenty for Legon tonight.`],
  },
  {
    id: "dede-online", from: "dede", trigger: "online", kind: "text",
    lines: () => ["Orders dey come. If you no accept for 25 seconds, e go pass to another rider o ⏱️"],
  },
  {
    id: "momo-payout", from: "momo", trigger: "delivered", kind: "text", repeat: true,
    lines: c => [
      `Payment received for GHS ${(c.payout ?? 0).toFixed(2)} from NIGHT MARKET GH. Current Balance: GHS ${(c.earnings ?? 0).toFixed(2)}. Transaction ID: ${(4207 + (c.deliveries ?? 0) * 7919) % 100000}.`,
    ],
  },
  {
    id: "dede-first", from: "dede", trigger: "delivered", kind: "text",
    when: c => (c.deliveries ?? 0) === 1,
    lines: () => ["Your first delivery don land! Customer happy. Keep am up 💪🏾"],
  },
  {
    id: "dede-perfect", from: "dede", trigger: "perfect", kind: "text",
    lines: () => ["Customer call me say the food still dey hot 🔥 You be correct rider! ⭐"],
  },
  {
    id: "yaw-streak", from: "yaw", trigger: "streak3", kind: "text",
    lines: () => ["Chale you dey hot today! Three for row 🔥", "Pass Okponglo junction later, we go chop kelewele."],
  },
  {
    id: "kofi-fuel", from: "kofi", trigger: "fuelLow", kind: "call",
    lines: c => [
      `Chale ${c.nickname}! Bra Yaw say he see you — your fuel dey go down.`,
      "No let am finish o. Engine go suck air, then you go push am come my shop for Abossey Okai 😂",
      "GOIL, Total, Allied — check the orange dots for your map. Go now now.",
    ],
    missed: () => "Your fuel low o. Orange dots for map = fuel station. No push am come my shop 😂",
  },
  {
    id: "kofi-crash", from: "kofi", trigger: "crash", kind: "call",
    when: c => (c.crashes ?? 0) >= 2,
    lines: () => [
      "Herh! Who you dey fight with for road? People dey talk for the station 😂",
      "Every knock, the food dey scatter — and the customer no go dash you.",
      "Small small. Accra road no be Formula 1, you hear?",
    ],
    missed: () => "Small small for road o. Every knock, the food dey scatter and no tip 😩",
  },
  {
    id: "maame-night", from: "maame", trigger: "night", kind: "call",
    lines: c => [
      `${c.nickname}, na Maame. You don chop?`,
      "I hear say you dey ride for night. Wear your helmet and reflector, you hear?",
      "And bring waakye come house when you close. Your father dey complain 😄",
    ],
    missed: () => "You don chop? Wear your helmet. Call me back 🙏🏾",
  },
  {
    id: "ecg-night", from: "ecg", trigger: "night", kind: "text",
    lines: () => ["Dear Customer, there will be a power interruption in parts of East Legon & Okponglo tonight. We regret any inconvenience."],
  },
  {
    id: "ecg-dumsor", from: "ecg", trigger: "dumsor", kind: "text", repeat: true,
    lines: () => ["Dear Customer, power in your area is temporarily off due to load management. Supply will be restored shortly. ECG regrets."],
  },
  {
    id: "yaw-dumsor", from: "yaw", trigger: "dumsor", kind: "text",
    lines: () => ["Chale dumsor again 😩 Use your headlight, the gutters dey hide for dark."],
  },
  {
    id: "maame-rain", from: "maame", trigger: "rain", kind: "text",
    lines: c => [`${c.nickname}, rain dey fall! Find shelter, no ride inside heavy rain o 🙏🏾`],
  },
  {
    id: "dede-rain", from: "dede", trigger: "rain", kind: "text", repeat: true,
    lines: () => ["Rain don start — customers go wait small. Ride careful, no rush 🌧️"],
  },
  {
    id: "dede-fined", from: "dede", trigger: "fined", kind: "call",
    lines: c => [
      `${c.nickname}! Police call the office say you run their checkpoint?!`,
      "Next time stop, show your licence. Two minutes no go kill you.",
      "The fine come from your pocket o, no be Night Market own.",
    ],
    missed: () => "Police say you run checkpoint 😤 Next time stop and show licence!",
  },
  {
    id: "customer-late", from: "customer", trigger: "late", kind: "text", repeat: true,
    name: c => c.customer ?? "Customer",
    lines: () => ["Charley, where you dey? The food go cool o 😩"],
  },
];

export interface Incoming {
  script: Script;
  name: string;
  lines: string[];
  missed?: string;
}

/** Stages where a ringing phone would get in the way. */
const BUSY = new Set(["offer", "calling", "checkBag", "fixingBag", "payment", "handoff"]);
export const CALL_GAP = 20;

export class CallDirector {
  private used = new Set<string>();
  private queue: Incoming[] = [];
  private lastCallAt = -Infinity;

  constructor(private scripts: Script[] = SCRIPTS) {}

  /** Raises a trigger. Texts are returned immediately; calls wait in the queue. */
  notify(trigger: Trigger, c: CallContext): Incoming[] {
    const texts: Incoming[] = [];
    for (const script of this.scripts) {
      if (script.trigger !== trigger || (!script.repeat && this.used.has(script.id))) continue;
      if (script.when && !script.when(c)) continue;
      if (this.queue.some(q => q.script.id === script.id)) continue;
      this.used.add(script.id);
      const item: Incoming = {
        script,
        name: script.name?.(c) ?? CONTACTS[script.from].name,
        lines: script.lines(c),
        missed: script.missed?.(c),
      };
      if (script.kind === "text") texts.push(item);
      else this.queue.push(item);
    }
    return texts;
  }

  /** The next call to ring, if the rider is free and the last call was a while ago. */
  next(now: number, stage: string, ringing: boolean): Incoming | null {
    if (ringing || BUSY.has(stage) || !this.queue.length || now - this.lastCallAt < CALL_GAP) return null;
    this.lastCallAt = now;
    return this.queue.shift() ?? null;
  }

  reset() {
    this.used.clear();
    this.queue = [];
    this.lastCallAt = -Infinity;
  }
}
