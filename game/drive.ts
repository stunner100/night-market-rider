export interface DriveSpeedInput {
  speed: number;
  up: boolean;
  down: boolean;
  canDrive: boolean;
  boostOn: boolean;
  maxSpeed: number;
  boostMax: number;
  fuel: number;
  dt: number;
}

const REVERSE_MAX = -5.5;
const OUT_OF_FUEL_REVERSE_MAX = -3.5;
const FORWARD_BRAKE_THRESHOLD = 0.25;

/** Signed cruise / reverse target from throttle and brake inputs. */
export function driveTarget(input: Pick<DriveSpeedInput, "up" | "down" | "canDrive" | "boostOn" | "maxSpeed" | "boostMax"> & { speed: number }): number {
  if (!input.canDrive) return 0;
  if (input.up) return input.boostOn ? input.boostMax : input.maxSpeed;
  if (!input.down) return 0;
  if (input.speed > FORWARD_BRAKE_THRESHOLD) return 0;
  return REVERSE_MAX;
}

/** Empty tank still allows a slow reverse creep; forward acceleration is blocked. */
export function effectiveDriveTarget(target: number, fuel: number): number {
  if (fuel > 0) return target;
  if (target > 0) return 0;
  if (target < 0) return Math.max(target, OUT_OF_FUEL_REVERSE_MAX);
  return 0;
}

/**
 * Apply one frame of signed speed control. Brake from forward rolls through zero
 * into reverse; releasing brake returns the target to neutral. With an empty tank
 * the bike can coast in either direction and creep backward, but cannot accelerate forward.
 */
export function updateDriveSpeed(state: DriveSpeedInput): number {
  let { speed, up, down, canDrive, boostOn, maxSpeed, boostMax, fuel, dt } = state;
  const target = driveTarget({ speed, up, down, canDrive, boostOn, maxSpeed, boostMax });
  const effectiveTarget = effectiveDriveTarget(target, fuel);
  const acceleration = down ? 34 : 20;

  if (speed < effectiveTarget) speed = Math.min(effectiveTarget, speed + acceleration * dt);
  else if (speed > effectiveTarget) speed = Math.max(effectiveTarget, speed - (up ? 4 : 26) * dt);

  if (fuel <= 0) {
    const coast = 12 * dt;
    if (speed > 0) speed = Math.max(0, speed - coast);
    else if (speed < 0) speed = Math.min(0, speed + coast);
  }

  return speed;
}
