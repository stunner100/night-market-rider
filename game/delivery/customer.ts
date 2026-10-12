/** How a customer talks — picked per order so the same person sounds the same on every line. */
const PERSONAS = [
  {
    note: (o: string) => `Call me when you reach the junction. I dey wear ${o}, near the yellow MoMo kiosk.`,
    reply: (o: string) => `Hello! I dey near the yellow MoMo kiosk, I wear ${o}. Meet me outside o.`,
    approach: (o: string) => `I fit see you! Stop by the gutter side, I go waka come. Look for my ${o}.`,
  },
  {
    note: (o: string) => `Charley, I hungry paa 😩 Call me when you reach. ${o}, by the MoMo kiosk.`,
    reply: (o: string) => `Ah finally! I dey by the MoMo kiosk — ${o}. Hurry small!`,
    approach: (o: string) => `I see your box! Hold on, I dey come. I wear ${o}.`,
  },
  {
    note: (o: string) => `Hi rider 👋🏾 Please call when you get close. I'll be in a ${o} by the yellow MoMo kiosk.`,
    reply: (o: string) => `Hiii! I'm standing by the yellow MoMo kiosk, ${o}. Medaase!`,
    approach: (o: string) => `Oh I can see you! Stay there, I'm coming. ${o}.`,
  },
  {
    note: (o: string) => `Boss, call me for the junction. ${o}, MoMo kiosk side. No come late o 😂`,
    reply: (o: string) => `Chale you reach? I dey MoMo kiosk side, ${o}. Come come.`,
    approach: (o: string) => `Ei, na you be that? Wait, I dey waka come. ${o}.`,
  },
];

/** Stable per-order details keep dialogue and the visible customer consistent. */
export function customerDetails(orderId: number) {
  const outfits = [
    { color: 0xe9ecef, name: 'white shirt' },
    { color: 0x1971c2, name: 'blue shirt' },
    { color: 0xd6336c, name: 'pink shirt' },
  ];
  const outfit = outfits[Math.abs(orderId - 1) % outfits.length];
  const persona = PERSONAS[Math.abs(orderId * 7 + 3) % PERSONAS.length];
  const approaches = orderId > 1 && orderId % 3 === 0;
  return {
    shirt: outfit.color,
    meeting: `Near the yellow MoMo kiosk · ${outfit.name}`,
    missesFirstCall: orderId > 1 && orderId % 5 === 0,
    approaches,
    note: persona.note(outfit.name),
    reply: approaches ? persona.approach(outfit.name) : persona.reply(outfit.name),
  };
}

/** Small bounded steps; the engine rejects lane/building intersections. */
export function customerApproachStep(
  position: { x: number; z: number },
  rider: { x: number; z: number },
  home: { x: number; z: number },
  dt: number,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } | null {
  const distance = Math.hypot(rider.x - position.x, rider.z - position.z);
  if (distance <= 2 || distance > 12) return null;
  const step = Math.min(1.1 * Math.max(0, Math.min(dt, .1)), distance - 2);
  const next = {
    x: position.x + (rider.x - position.x) / distance * step,
    z: position.z + (rider.z - position.z) / distance * step,
  };
  if (Math.hypot(next.x - home.x, next.z - home.z) > 6 || blocked(next.x, next.z)) return null;
  return next;
}
