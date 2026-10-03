/**
 * @typedef {{ x: number, z: number, halfX: number, halfZ: number, rotationY?: number }} OrientedBox
 */

/**
 * Return the first segment parameter that enters an oriented box, or null if the
 * segment misses. The returned value is in [0, 1], where 0 is the start point.
 * @param {number} x0
 * @param {number} z0
 * @param {number} x1
 * @param {number} z1
 * @param {OrientedBox} box
 * @returns {number | null}
 */
export function segmentOrientedBoxEntryT(x0, z0, x1, z1, box) {
  const angle = box.rotationY ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const toLocal = (x, z) => {
    const dx = x - box.x;
    const dz = z - box.z;
    return { x: cos * dx - sin * dz, z: sin * dx + cos * dz };
  };
  const start = toLocal(x0, z0);
  const end = toLocal(x1, z1);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  let enter = 0;
  let exit = 1;

  for (const [origin, delta, min, max] of [
    [start.x, dx, -box.halfX, box.halfX],
    [start.z, dz, -box.halfZ, box.halfZ],
  ]) {
    if (delta === 0) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let near = (min - origin) / delta;
    let far = (max - origin) / delta;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }

  return exit < 0 || enter > 1 ? null : Math.max(0, enter);
}

/**
 * Push a point that starts inside an oriented box just beyond its nearest face.
 * Points already outside are returned unchanged.
 * @param {number} x
 * @param {number} z
 * @param {OrientedBox} box
 * @param {number} [padding]
 * @returns {{ x: number, z: number }}
 */
export function movePointOutsideOrientedBox(x, z, box, padding = 0.15) {
  const angle = box.rotationY ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - box.x;
  const dz = z - box.z;
  let localX = cos * dx - sin * dz;
  let localZ = sin * dx + cos * dz;
  if (Math.abs(localX) > box.halfX || Math.abs(localZ) > box.halfZ) return { x, z };

  const xDistance = box.halfX - Math.abs(localX);
  const zDistance = box.halfZ - Math.abs(localZ);
  if (xDistance <= zDistance) localX = Math.sign(localX || 1) * (box.halfX + padding);
  else localZ = Math.sign(localZ || 1) * (box.halfZ + padding);

  return {
    x: box.x + cos * localX + sin * localZ,
    z: box.z - sin * localX + cos * localZ,
  };
}
