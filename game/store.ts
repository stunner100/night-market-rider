import { create } from "zustand";
import { latLonToWorld } from "./world/coordinates";

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
  boost: number;
  fuel: number;
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
    const arr = JSON.parse(raw) as { name: string; score: number }[];
    arr.push({ name, score });
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

const ACCRA_ORIGIN = { lat: 5.6425, lon: -0.18628 };
const GEO_PADS = [
  { name: "Night Market", lat: 5.6425, lon: -0.18628 },
  { name: "Okponglo", lat: 5.64077, lon: -0.18375 },
  { name: "Legon Traffic Light", lat: 5.64055, lon: -0.17925 },
  { name: "Legon Post Office", lat: 5.65090, lon: -0.18763 },
  { name: "UPSA", lat: 5.66155, lon: -0.16638 },
].map(p => ({ ...p, ...latLonToWorld(p.lat, p.lon, ACCRA_ORIGIN) }));

export const MIN_PICKUP_METRES = 280;

function priceOrder(index: number, pickup: { x: number; z: number }, drop: { x: number; z: number }) {
  const directMetres = Math.hypot(drop.x - pickup.x, drop.z - pickup.z);
  const distKm = Math.max(0.35, directMetres / 1000);
  const generous = index < 3 ? 1.45 : index < 7 ? 1.2 : 1.0;
  return {
    reward: Math.round((5.5 + distKm * 2.4) * 100) / 100,
    xp: Math.round(500 + distKm * 250),
    timeTotal: Math.round((75 + distKm * 70) * generous),
  };
}

/** Move a pickup that sits on the rider out to the nearest real pad a few hundred metres away. */
export function separateOrderFromRider(order: Order, riderX: number, riderZ: number, index: number): Order {
  if (Math.hypot(order.pickupX - riderX, order.pickupZ - riderZ) >= MIN_PICKUP_METRES) return order;
  const pickup = GEO_PADS
    .map(pad => ({ pad, distance: Math.hypot(pad.x - riderX, pad.z - riderZ) }))
    .filter(item => item.distance >= MIN_PICKUP_METRES)
    .sort((a, b) => a.distance - b.distance)[0]?.pad;
  if (!pickup) return order;
  const sameDrop = GEO_PADS.find(pad => pad.name === order.dropoff);
  const dropStillWorks = sameDrop
    && sameDrop.name !== pickup.name
    && Math.hypot(sameDrop.x - pickup.x, sameDrop.z - pickup.z) >= MIN_PICKUP_METRES;
  const drop = dropStillWorks ? sameDrop : GEO_PADS
    .filter(pad => pad.name !== pickup.name && Math.hypot(pad.x - pickup.x, pad.z - pickup.z) >= MIN_PICKUP_METRES)
    .sort((a, b) => Math.hypot(a.x - pickup.x, a.z - pickup.z) - Math.hypot(b.x - pickup.x, b.z - pickup.z))[0];
  if (!drop) return order;
  return {
    ...order,
    dropoff: drop.name,
    ...priceOrder(index, pickup, drop),
    pickupX: pickup.x,
    pickupZ: pickup.z,
    dropX: drop.x,
    dropZ: drop.z,
  };
}

export function makeOrder(index: number): Order {
  const v = VENDORS[index % VENDORS.length];
  const padA = GEO_PADS[index % GEO_PADS.length];
  let padB = GEO_PADS[(index + 2) % GEO_PADS.length];
  if (padA === padB) padB = GEO_PADS[(index + 3) % GEO_PADS.length];

  return {
    id: index + 1,
    vendor: v.vendor,
    food: v.food,
    emoji: v.emoji,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    dropoff: padB.name,
    ...priceOrder(index, padA, padB),
    pickupX: padA.x,
    pickupZ: padA.z,
    dropX: padB.x,
    dropZ: padB.z,
  };
}

if (typeof window !== "undefined") {
  try {
    const h = (globalThis as unknown as { __nm_hydrate?: { nm: string | null; lb: { name: string; score: number }[] } }).__nm_hydrate;
    if (h) useGame.getState().set({ nickname: h.nm || "Rider", leaderboard: Array.isArray(h.lb) ? h.lb : [] });
  } catch { /* ignore */ }
}
