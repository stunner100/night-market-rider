import { create } from "zustand";
import { sanitizeLeaderboard, sanitizeNickname } from "./storage.mjs";

export type Phase =
  | "loading"
  | "menu"
  | "countdown"
  | "offer" // order offered, must accept
  | "toPickup"
  | "pickup"
  | "toDropoff"
  | "deliver"
  | "delivered" // brief celebration
  | "gameover";

export interface Order {
  id: number;
  vendor: string;
  food: string;
  emoji: string;
  customer: string;
  dropoff: string;
  reward: number;
  xp: number;
  timeTotal: number;
  pickupX: number;
  pickupZ: number;
  dropX: number;
  dropZ: number;
}

interface Toast { id: number; text: string; }

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
  boost: number; // 0..100
  fuel: number; // 0..100
  speedKmh: number;
  distM: number;
  turnHint: string;
  banner: string | null;
  toasts: Toast[];
  sound: boolean;
  nickname: string;
  lastDelivery: { reward: number; xp: number; rating: number; streak: number } | null;
  leaderboard: { name: string; score: number }[];
  set: (p: Partial<GameState>) => void;
  pushToast: (text: string) => void;
  clearBanner: () => void;
}

let toastId = 1;

// Client-side hydration (page is statically prerendered; never touch storage during SSR).
if (typeof window !== "undefined") {
  try {
    const nm = window.localStorage.getItem("nm_name");
    const lb = JSON.parse(window.localStorage.getItem("nm_board") || "[]");
    if (nm || Array.isArray(lb)) {
      // applied after store creation below; see hydrate below
      (globalThis as unknown as { __nm_hydrate?: { nm: string | null; lb: unknown } }).__nm_hydrate = { nm: sanitizeNickname(nm), lb: sanitizeLeaderboard(lb) };
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
  banner: null,
  toasts: [],
  sound: true,
  nickname: "Rider",
  lastDelivery: null,
  leaderboard: [],
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
    const arr = sanitizeLeaderboard(JSON.parse(raw));
    const safeName = sanitizeNickname(name) || "Rider";
    const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    arr.push({ name: safeName, score: safeScore });
    arr.sort((a, b) => b.score - a.score);
    const top = arr.slice(0, 8);
    window.localStorage.setItem("nm_board", JSON.stringify(top));
    useGame.getState().set({ leaderboard: top });
  } catch { /* ignore */ }
}

const VENDORS = [
  { vendor: "Papaye", food: "Fried Chicken & Chips", emoji: "🍗" },
  { vendor: "Waakye Special", food: "Waakye", emoji: "🍛" },
  { vendor: "Jollof Available", food: "Party Jollof", emoji: "🍚" },
  { vendor: "Chicken Republic", food: "Chicken Wings", emoji: "🍗" },
  { vendor: "Osikan Chop Bar", food: "Fufu & Light Soup", emoji: "🍲" },
  { vendor: "Burger Spot", food: "Beef Burger", emoji: "🍔" },
  { vendor: "Pizza Inn Legon", food: "Pepperoni Pizza", emoji: "🍕" },
  { vendor: "Cold Store", food: "Chilled Drinks", emoji: "🥤" },
];
const CUSTOMERS = ["Nana", "Ama", "Kwame", "Yaw", "Kojo", "Efya", "Kofi", "Abena"];
const DROPOFFS = ["East Legon", "Legon Hall", "UPSA Hostel", "Madina Market", "Commonwealth Hall", "Okponglo", "Shiashie"];

// Fixed, reachable pickup/dropoff pads spread across the map quadrants.
const PADS = [
  { x: -52, z: -48 }, // Legon vendor row
  { x: 48, z: -52 }, // UPSA shops
  { x: 56, z: 48 }, // East Legon restaurants
  { x: -52, z: 52 }, // Madina stalls
  { x: 0, z: -70 }, // campus gate
  { x: 70, z: 0 }, // east road
  { x: 0, z: 70 }, // madina road
  { x: -70, z: 0 }, // legon road
];

export function makeOrder(index: number): Order {
  const v = VENDORS[index % VENDORS.length];
  const padA = PADS[index % PADS.length];
  const padB = PADS[(index + 3) % PADS.length];
  const distKm = 0.8 + ((index * 0.37) % 1.6);
  const generous = index < 3 ? 1.5 : index < 7 ? 1.2 : 1.0;
  const timeTotal = Math.round((70 + distKm * 55) * generous);
  return {
    id: index + 1,
    vendor: v.vendor,
    food: v.food,
    emoji: v.emoji,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    dropoff: DROPOFFS[index % DROPOFFS.length],
    reward: Math.round((5.5 + distKm * 2.4) * 100) / 100,
    xp: Math.round(500 + distKm * 250),
    timeTotal,
    pickupX: padA.x,
    pickupZ: padA.z,
    dropX: padB.x,
    dropZ: padB.z,
  };
}

// Apply client hydration captured above (client only).
if (typeof window !== "undefined") {
  try {
    const h = (globalThis as unknown as { __nm_hydrate?: { nm: string | null; lb: unknown } }).__nm_hydrate;
    if (h) useGame.getState().set({ nickname: sanitizeNickname(h.nm) || "Rider", leaderboard: sanitizeLeaderboard(h.lb) });
  } catch { /* ignore */ }
}
