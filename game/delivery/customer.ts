/** Stable per-order details keep dialogue and the visible customer consistent. */
export function customerDetails(orderId: number) {
  const outfits = [
    { color: 0xe9ecef, name: 'white shirt' },
    { color: 0x1971c2, name: 'blue shirt' },
    { color: 0xd6336c, name: 'pink shirt' },
  ];
  const outfit = outfits[Math.abs(orderId - 1) % outfits.length];
  const approaches = orderId > 1 && orderId % 3 === 0;
  return {
    shirt: outfit.color,
    meeting: `Beside the yellow MoMo kiosk · ${outfit.name}`,
    missesFirstCall: orderId > 1 && orderId % 5 === 0,
    approaches,
    note: `Call when you reach the junction. I’m wearing a ${outfit.name}, beside the yellow MoMo kiosk.`,
    reply: approaches
      ? `I can see you. Stop by the pavement; I’ll walk over if the way is clear. Look for my ${outfit.name}.`
      : `Hello! I’m beside the yellow MoMo kiosk, wearing a ${outfit.name}. Please meet me outside.`,
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
