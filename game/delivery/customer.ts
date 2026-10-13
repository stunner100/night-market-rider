/** How a customer talks — picked per order so the same person sounds the same on every line. */
const PERSONAS = [
  {
    note: (o: string, p: string) => `Call me when you reach. Na ${p} — I go come out, I dey wear ${o}.`,
    reply: (o: string, p: string) => `Hello! I dey come out now — ${p}. I wear ${o}.`,
    approach: (o: string, _p: string) => `I fit see you! Stop by the gutter side, I go waka come. Look for my ${o}.`,
  },
  {
    note: (o: string, p: string) => `Charley, I hungry paa 😩 Call me when you reach ${p}. I wear ${o}.`,
    reply: (o: string, p: string) => `Ah finally! I dey come — ${p}. I wear ${o}. Hurry small!`,
    approach: (o: string, _p: string) => `I see your box! Hold on, I dey come. I wear ${o}.`,
  },
  {
    note: (o: string, p: string) => `Hi rider 👋🏾 Please call when you get close. It's ${p}; I'll be in a ${o}.`,
    reply: (o: string, p: string) => `Hiii! Coming out now — ${p}. I'm in a ${o}. Medaase!`,
    approach: (o: string, _p: string) => `Oh I can see you! Stay there, I'm coming — ${o}.`,
  },
  {
    note: (o: string, p: string) => `Boss, call me when you reach ${p}. I wear ${o}. No come late o 😂`,
    reply: (o: string, p: string) => `Chale you reach? I dey come out — ${p}. I wear ${o}. Come come.`,
    approach: (o: string, _p: string) => `Ei, na you be that? Wait, I dey waka come. I wear ${o}.`,
  },
];

/** Stable per-order details keep dialogue and the visible customer consistent. */
export function customerDetails(orderId: number, place = "the yellow MoMo kiosk") {
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
    meeting: `${place[0].toUpperCase()}${place.slice(1)} · ${outfit.name}`,
    missesFirstCall: orderId > 1 && orderId % 5 === 0,
    approaches,
    note: persona.note(outfit.name, place),
    reply: approaches ? persona.approach(outfit.name, place) : persona.reply(outfit.name, place),
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
