/**
 * Apply one frame of the rider's signed speed controls.
 * Holding down brakes to a stop, then selects reverse; releasing it returns
 * the target to neutral. With an empty tank, the bike can coast but cannot
 * accelerate in either direction.
 *
 * @param {{ speed: number, up: boolean, down: boolean, canDrive: boolean, boostOn: boolean, maxSpeed: number, boostMax: number, fuel: number, dt: number }} state
 * @returns {number}
 */
export function updateDriveSpeed({ speed, up, down, canDrive, boostOn, maxSpeed, boostMax, fuel, dt }) {
  const wantReverse = down && Math.abs(speed) <= 0.3;
  const target = !canDrive ? 0 : up ? (boostOn ? boostMax : maxSpeed) : wantReverse ? -5.5 : 0;
  const effectiveTarget = fuel <= 0 ? 0 : target;
  const acceleration = down ? 34 : 20;

  if (speed < effectiveTarget) speed = Math.min(effectiveTarget, speed + acceleration * dt);
  else if (speed > effectiveTarget) speed = Math.max(effectiveTarget, speed - (up ? 4 : 26) * dt);

  // Preserve the sign while coasting out of fuel; a nonnegative clamp erases
  // reverse momentum and makes the signed-velocity state jump to a full stop.
  if (fuel <= 0) {
    const coast = 12 * dt;
    if (speed > 0) speed = Math.max(0, speed - coast);
    else if (speed < 0) speed = Math.min(0, speed + coast);
  }

  return speed;
}
