/** Braking becomes continuous reverse after forward momentum has stopped. */
export function movementTarget(
  up: boolean,
  down: boolean,
  speed: number,
  forward: number,
  reverse: number,
): number {
  if (down) return speed <= 0.3 ? -reverse : 0;
  return up ? forward : 0;
}
