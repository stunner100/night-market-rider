import { create } from "zustand";
import {
  buildOrder,
  separateOrderFromRider as separateOrderFromRiderImpl,
  MIN_PICKUP_METRES,
  type OrderDraft,
} from "./orders";
import type { ActiveNightEvent } from "./night-events";
import type { RunSummary } from "./run-stats";

export type Phase =
  | "loading"
  | "menu"
  | "countdown"
  | "offer"
  | "toPickup"
  | "pickup"
  | "toDropoff"
  | "deliver"
  | "delivered"
  | "gameover";

export type Order = OrderDraft;

interface Toast { id: number; text: string; }

export interface RunLiveStats {
  tipsGhs: number;
  distanceMetres: number;
  crashCount: number;
  deliveriesOnTime: number;
  deliveryAttempts: number;
  shiftTimeLeft: number;
}

interface GameState {
  phase: Phase;
  paused: boolean;
  countdown: number;
  order: Order | null;
  orderIndex: number;
  timeLeft: number;
  earnings: number;
  xp: number;
  deliveries: number;
  streak: number;
  bestStreak: number;
  rating: number;
  ratingsCount: number;
  score: number;
  strikes: number;
  boost: number;
  fuel: number;
  speedKmh: number;
  distM: number;
  turnHint: string;
  onFoot: boolean;
  nearBike: boolean;
  banner: string | null;
  toasts: Toast[];
  sound: boolean;
  nickname: string;
  lastDelivery: { reward: number; xp: number; rating: number; streak: number; tip: number } | null;
  leaderboard: { name: string; score: number }[];
  activeEvent: ActiveNightEvent | null;
  eventHud: string | null;
  runStats: RunLiveStats;
  runSummary: RunSummary | null;
  set: (p: Partial<GameState>) => void;
  pushToast: (text: string) => void;
  clearBanner: () => void;
}

let toastId = 1;

const defaultRunStats = (): RunLiveStats => ({
  tipsGhs: 0,
  distanceMetres: 0,
  crashCount: 0,
  deliveriesOnTime: 0,
  deliveryAttempts: 0,
  shiftTimeLeft: 0,
});

if (typeof window !== "undefined") {
  try {
    const nm = window.localStorage.getItem("nm_name");
    const lb = JSON.parse(window.localStorage.getItem("nm_board") || "[]");
    if (nm || Array.isArray(lb)) {
      (globalThis as unknown as { __nm_hydrate?: { nm: string | null; lb: unknown } }).__nm_hydrate = { nm, lb };
    }
  } catch { /* ignore */ }
}

export const useGame = create<GameState>((set, get) => ({
  phase: "loading",
  paused: false,
  countdown: 3,
  order: null,
  orderIndex: 0,
  timeLeft: 0,
  earnings: 0,
  xp: 0,
  deliveries: 0,
  streak: 0,
  bestStreak: 0,
  rating: 5.0,
  ratingsCount: 0,
  score: 0,
  strikes: 0,
  boost: 100,
  fuel: 100,
  speedKmh: 0,
  distM: 0,
  turnHint: "",
  onFoot: false,
  nearBike: false,
  banner: null,
  toasts: [],
  sound: true,
  nickname: "Rider",
  lastDelivery: null,
  leaderboard: [],
  activeEvent: null,
  eventHud: null,
  runStats: defaultRunStats(),
  runSummary: null,
  set: (p) => set(p),
  pushToast: (text) => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-3), { id, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 2200);
  },
  clearBanner: () => set({ banner: null }),
}));

export function saveBoard(name: string, score: number) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem("nm_board") || "[]";
    const arr = JSON.parse(raw) as { name: string; score: number }[];
    arr.push({ name, score });
    arr.sort((a, b) => b.score - a.score);
    const top = arr.slice(0, 8);
    window.localStorage.setItem("nm_board", JSON.stringify(top));
    useGame.getState().set({ leaderboard: top });
  } catch { /* ignore */ }
}

export { MIN_PICKUP_METRES };

export function makeOrder(index: number, payoutMult = 1): Order {
  return buildOrder(index, payoutMult);
}

export function separateOrderFromRider(order: Order, riderX: number, riderZ: number, index: number): Order {
  return separateOrderFromRiderImpl(order, riderX, riderZ, index);
}

if (typeof window !== "undefined") {
  try {
    const h = (globalThis as unknown as { __nm_hydrate?: { nm: string | null; lb: { name: string; score: number }[] } }).__nm_hydrate;
    if (h) useGame.getState().set({ nickname: h.nm || "Rider", leaderboard: Array.isArray(h.lb) ? h.lb : [] });
  } catch { /* ignore */ }
}
