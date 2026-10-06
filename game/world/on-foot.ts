/** Walk and remount math for getting off the delivery bike. */

export const WALK_SPEED = 3.6;
export const WALK_TURN = 2.5;
export const REMOUNT_REACH = 2.4;
export const DISMOUNT_STEP = 1.5;
export const BIKE_BODY_RADIUS = 1.05;

export interface WalkCommand {
  forward: -1 | 0 | 1;
  turn: -1 | 0 | 1;
}

export interface WalkPose {
  x: number;
  z: number;
  heading: number;
  moving: boolean;
}

const SIDES = [1, -1] as const;

export function dismountOffset(heading: number, side: 1 | -1): { x: number; z: number } {
  const yaw = heading + side * (Math.PI / 2);
  return { x: Math.sin(yaw) * DISMOUNT_STEP, z: Math.cos(yaw) * DISMOUNT_STEP };
}

export function chooseDismountPoint(
  x: number,
  z: number,
  heading: number,
  blocked: (x: number, z: number) => boolean,
): { x: number; z: number } {
  for (const side of SIDES) {
    const off = dismountOffset(heading, side);
    const next = { x: x + off.x, z: z + off.z };
    if (!blocked(next.x, next.z)) return next;
  }
  const behind = {
    x: x - Math.sin(heading) * DISMOUNT_STEP,
    z: z - Math.cos(heading) * DISMOUNT_STEP,
  };
  if (!blocked(behind.x, behind.z)) return behind;
  const fallback = dismountOffset(heading, 1);
  return { x: x + fallback.x, z: z + fallback.z };
}

export function canRemount(x: number, z: number, bikeX: number, bikeZ: number): boolean {
  return Math.hypot(x - bikeX, z - bikeZ) <= REMOUNT_REACH;
}

export function stepWalk(
  pose: { x: number; z: number; heading: number },
  command: WalkCommand,
  dt: number,
  blocked: (x: number, z: number) => boolean,
): WalkPose {
  const heading = pose.heading + command.turn * WALK_TURN * dt;
  const dist = command.forward * WALK_SPEED * dt;
  const dx = Math.sin(heading) * dist;
  const dz = Math.cos(heading) * dist;
  let x = pose.x + dx;
  let z = pose.z + dz;
  if (command.forward !== 0 && blocked(x, z)) {
    if (!blocked(pose.x + dx, pose.z)) {
      x = pose.x + dx;
      z = pose.z;
    } else if (!blocked(pose.x, pose.z + dz)) {
      x = pose.x;
      z = pose.z + dz;
    } else {
      x = pose.x;
      z = pose.z;
    }
  }
  const moving = command.forward !== 0 && (x !== pose.x || z !== pose.z);
  return { x, z, heading, moving };
}
