export type NightEventKind = "order_surge" | "police_checkpoint" | "rain_shower";

export interface NightEventSpec {
  kind: NightEventKind;
  label: string;
  hud: string;
  emoji: string;
  durationSec: number;
  /** Seconds after run start when the event begins */
  startAtSec: number;
}

export interface NightEventModifiers {
  payoutMult: number;
  maxSpeedCap: number | null;
  steerMult: number;
  fogMult: number;
  checkpoint: { x: number; z: number; radius: number } | null;
}

export interface ActiveNightEvent {
  kind: NightEventKind;
  label: string;
  hud: string;
  emoji: string;
  endsAtSec: number;
  checkpoint: { x: number; z: number; radius: number } | null;
}

const CHECKPOINTS = [
  { x: 280.27, z: 192.58, radius: 95, name: "Okponglo" },
  { x: 778.78, z: 217.07, radius: 90, name: "Legon Traffic Light" },
  { x: 918.53, z: -1969.24, radius: 85, name: "UPSA Taxi Rank" },
];

const EVENT_CATALOG: Record<NightEventKind, Omit<NightEventSpec, "kind" | "startAtSec">> = {
  order_surge: {
    label: "Chop rush!",
    hud: "Surge pricing · +35% pay",
    emoji: "📈",
    durationSec: 75,
  },
  police_checkpoint: {
    label: "Police checkpoint",
    hud: "Checkpoint ahead · ease off",
    emoji: "🚓",
    durationSec: 55,
  },
  rain_shower: {
    label: "Rain shower",
    hud: "Wet roads · grip down",
    emoji: "🌧️",
    durationSec: 65,
  },
};

const DEFAULT_ROTATION: NightEventKind[] = ["order_surge", "police_checkpoint", "rain_shower"];

function parseForcedEvents(raw: string | null | undefined): NightEventKind[] {
  if (!raw) return [];
  const allowed = new Set<NightEventKind>(DEFAULT_ROTATION);
  return raw
    .split(/[,+\s]+/)
    .map(part => part.trim().toLowerCase())
    .filter((part): part is NightEventKind => allowed.has(part as NightEventKind));
}

export function readForcedEventKinds(): NightEventKind[] {
  if (typeof window === "undefined") return [];
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = parseForcedEvents(params.get("events"));
    if (fromQuery.length) return fromQuery;
    return parseForcedEvents(window.localStorage.getItem("nm_debug_events"));
  } catch {
    return [];
  }
}

/** Plan 2–3 events spaced across a ~12 minute shift without overlapping too much. */
export function planNightEvents(runSeed: number, forced: NightEventKind[] = []): NightEventSpec[] {
  if (forced.length) {
    return forced.map((kind, index) => ({
      kind,
      startAtSec: 8 + index * 18,
      ...EVENT_CATALOG[kind],
    }));
  }
  const kinds: NightEventKind[] = [
    DEFAULT_ROTATION[runSeed % 3],
    DEFAULT_ROTATION[(runSeed + 1) % 3],
    DEFAULT_ROTATION[(runSeed + 2) % 3],
  ];
  const unique: NightEventKind[] = [];
  for (const kind of kinds) if (!unique.includes(kind)) unique.push(kind);
  return unique.slice(0, 3).map((kind, index) => ({
    kind,
    startAtSec: 45 + index * 140 + (runSeed % 20),
    ...EVENT_CATALOG[kind],
  }));
}

export function activateEvents(planned: NightEventSpec[], elapsedSec: number, active: ActiveNightEvent[]): ActiveNightEvent[] {
  const next = active.filter(event => event.endsAtSec > elapsedSec);
  for (const spec of planned) {
    if (elapsedSec < spec.startAtSec || elapsedSec > spec.startAtSec + 2.5) continue;
    if (next.some(event => event.kind === spec.kind)) continue;
    const checkpoint = spec.kind === "police_checkpoint"
      ? CHECKPOINTS[Math.floor(spec.startAtSec) % CHECKPOINTS.length]
      : null;
    next.push({
      kind: spec.kind,
      label: spec.label,
      hud: spec.hud,
      emoji: spec.emoji,
      endsAtSec: elapsedSec + spec.durationSec,
      checkpoint,
    });
  }
  return next;
}

export function eventModifiers(active: ActiveNightEvent[], px: number, pz: number): NightEventModifiers {
  let payoutMult = 1;
  let maxSpeedCap: number | null = null;
  let steerMult = 1;
  let fogMult = 1;
  let checkpoint: NightEventModifiers["checkpoint"] = null;

  for (const event of active) {
    switch (event.kind) {
      case "order_surge":
        payoutMult = Math.max(payoutMult, 1.35);
        break;
      case "rain_shower":
        steerMult = Math.min(steerMult, 0.72);
        fogMult = Math.max(fogMult, 1.35);
        break;
      case "police_checkpoint":
        if (event.checkpoint) {
          checkpoint = event.checkpoint;
          const d = Math.hypot(px - event.checkpoint.x, pz - event.checkpoint.z);
          if (d < event.checkpoint.radius) maxSpeedCap = maxSpeedCap === null ? 14 : Math.min(maxSpeedCap, 14);
        }
        break;
      default: {
        const never: never = event.kind;
        return never;
      }
    }
  }
  return { payoutMult, maxSpeedCap, steerMult, fogMult, checkpoint };
}

export function primaryHudEvent(active: ActiveNightEvent[]): ActiveNightEvent | null {
  if (!active.length) return null;
  return active.slice().sort((a, b) => a.endsAtSec - b.endsAtSec)[0];
}
