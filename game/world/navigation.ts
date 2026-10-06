import { formatMetres, remainingPolylineMetres } from "./distance";
import type { WorldPoint } from "./types";

export interface RouteCue {
  text: string;
  remaining: number;
}

function wrap(angle: number): number {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function turnText(delta: number, metres: number): string {
  const left = delta > 0;
  const arrow = left ? "←" : "→";
  const word = left ? "LEFT" : "RIGHT";
  if (metres < 18) return `${arrow} TURN ${word}`;
  return `${arrow} TURN ${word} IN ${formatMetres(metres)}`;
}

/**
 * Turn instructions follow the routed polyline.
 * Positive heading change matches the bike: left increases heading.
 */
export function cueFromRoute(route: WorldPoint[], x: number, z: number, heading: number): RouteCue {
  if (route.length < 2) return { text: "", remaining: 0 };
  let bestI = 0;
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 <= 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2));
    const qx = a.x + abx * t;
    const qz = a.z + abz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < bestD) { bestD = d; bestI = i; bestT = t; }
  }

  const remaining = remainingPolylineMetres(route, x, z);
  if (remaining < 28) return { text: "DESTINATION AHEAD", remaining };

  const a = route[bestI];
  const b = route[bestI + 1];
  const routeHeading = Math.atan2(b.x - a.x, b.z - a.z);
  let prevHeading = routeHeading;
  let distToCorner = Math.hypot(b.x - a.x, b.z - a.z) * (1 - bestT);

  for (let i = bestI + 1; i < route.length - 1; i++) {
    const prev = route[i];
    const next = route[i + 1];
    const step = Math.hypot(next.x - prev.x, next.z - prev.z);
    if (step < 6) {
      distToCorner += step;
      continue;
    }
    const nextHeading = Math.atan2(next.x - prev.x, next.z - prev.z);
    const delta = wrap(nextHeading - prevHeading);
    if (Math.abs(delta) > 0.5 && distToCorner < 180) {
      return { text: turnText(delta, distToCorner), remaining };
    }
    prevHeading = nextHeading;
    distToCorner += step;
    if (distToCorner > 220) break;
  }

  const align = wrap(routeHeading - heading);
  if (Math.abs(align) > 0.75) return { text: turnText(align, Math.min(40, remaining)), remaining };
  return { text: `CONTINUE ${formatMetres(remaining)}`, remaining };
}
