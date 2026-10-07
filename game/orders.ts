import { latLonToWorld } from "./world/coordinates";

export interface OrderStop {
  id: string;
  name: string;
  x: number;
  z: number;
  role: "vendor" | "customer" | "both";
}

export interface VendorTemplate {
  vendor: string;
  food: string;
  emoji: string;
}

/** Baked from OSM POIs + landmark pads — see public/world/accra/order-stops.json */
export const ORDER_STOPS: OrderStop[] = [
  { id: "night-market", name: "Night Market", x: 0, z: 0, role: "both" },
  { id: "okponglo", name: "Okponglo Roundabout", x: 280.27, z: 192.58, role: "both" },
  { id: "legon-traffic-light", name: "Legon Traffic Light", x: 778.78, z: 217.07, role: "both" },
  { id: "legon-post-office", name: "Legon Post Office", x: -149.55, z: -935.08, role: "both" },
  { id: "upsa", name: "UPSA", x: 2204.52, z: -2120.64, role: "both" },
  { id: "legon-hall-bbq", name: "Legon Hall Barbeque Joint", x: -359.89, z: -694.12, role: "vendor" },
  { id: "bush-canteen", name: "Bush Canteen", x: 593.54, z: -620.02, role: "vendor" },
  { id: "koko-joint", name: "Koko Joint", x: 735.31, z: -977.6, role: "vendor" },
  { id: "pent-food-court", name: "Pent Food Court", x: 621.14, z: -1525.52, role: "vendor" },
  { id: "baba-kebab", name: "Baba's Special Kebab", x: 62, z: 43.41, role: "vendor" },
  { id: "benzola", name: "Benzola Mini Restaurant", x: 92.92, z: -599.85, role: "vendor" },
  { id: "street-vendor-legon", name: "Legon Road Chop Spot", x: 91.9, z: -657.26, role: "vendor" },
  { id: "maxi-catering", name: "Maxi Catering Services", x: 410.21, z: 353.7, role: "vendor" },
  { id: "food-addict", name: "Food Addict Gh", x: 1322.03, z: -697.81, role: "vendor" },
  { id: "obaapa-food", name: "Obaapa Special Food", x: 1351.51, z: 134.18, role: "vendor" },
  { id: "kfc-east-legon", name: "KFC East Legon", x: 1870.01, z: 352.63, role: "vendor" },
  { id: "mc-joy", name: "Mc Joy Restaurant", x: 1922.18, z: 325.89, role: "vendor" },
  { id: "kikibees", name: "KikiBee's", x: 1823.88, z: 398.35, role: "vendor" },
  { id: "crave-xpress", name: "Crave Xpress", x: 2108.35, z: -1639.66, role: "vendor" },
  { id: "balme-library", name: "Balme Library", x: -82.54, z: -960.6, role: "customer" },
  { id: "ug-business-school", name: "UG Business School", x: -260, z: -1147.56, role: "customer" },
  { id: "volta-cafe", name: "Volta Café", x: -351.58, z: -1019.83, role: "customer" },
  { id: "mobile-money-legon", name: "Mobile Money · Legon", x: -305.25, z: -1020.76, role: "customer" },
  { id: "physics-dept", name: "Department of Physics", x: 25.24, z: -994.85, role: "customer" },
  { id: "math-dept", name: "Department of Mathematics", x: 206.83, z: -1266.39, role: "customer" },
  { id: "radio-univers", name: "Radio Univers", x: 585.36, z: -1034.35, role: "customer" },
  { id: "comm-studies", name: "School of Communication Studies", x: 552.72, z: -1029.84, role: "customer" },
  { id: "legon-police", name: "Legon Police Station", x: 741.67, z: -909.64, role: "customer" },
  { id: "max-mart", name: "Max Mart", x: 801.96, z: -1206.48, role: "customer" },
  { id: "upsa-taxi-rank", name: "UPSA Taxi Rank", x: 918.53, z: -1969.24, role: "customer" },
  { id: "legon-taxi-rank", name: "Legon Taxi Rank", x: 810.56, z: 178.53, role: "customer" },
  { id: "library-pub", name: "Library Pub", x: 1022.5, z: 199.26, role: "customer" },
  { id: "diana-spot", name: "Diana Spot", x: 1125.61, z: 165.83, role: "customer" },
  { id: "royal-emperor", name: "Royal Emperor", x: 1141.61, z: 281.71, role: "customer" },
  { id: "delish", name: "De'lish", x: 1408.46, z: 121.25, role: "customer" },
  { id: "ecobank-east-legon", name: "Ecobank · East Legon", x: 1246.74, z: 141.25, role: "customer" },
  { id: "ghana-languages", name: "Ghana Institute of Languages", x: 1753.33, z: -1751.08, role: "customer" },
  { id: "ideal-college", name: "Ideal College", x: 1939.78, z: -1776.86, role: "customer" },
  { id: "first-love-centre", name: "First Love Centre", x: 2108.99, z: -1608.62, role: "customer" },
  { id: "design-tech-inst", name: "Design & Technology Institute", x: 2540.72, z: -1143.43, role: "customer" },
  { id: "casa-bellini", name: "Casa Bellini", x: 2548.83, z: -1872.42, role: "customer" },
  { id: "calbank-okponglo", name: "CalBank · Okponglo", x: 55.57, z: -10.53, role: "customer" },
  { id: "republic-bank", name: "Republic Bank", x: 144.27, z: -81.41, role: "customer" },
];

export const VENDORS: VendorTemplate[] = [
  { vendor: "Waakye Special · Okponglo", food: "Waakye + wele", emoji: "🍛" },
  { vendor: "Auntie Esi Kelewele", food: "Kelewele & groundnuts", emoji: "🍌" },
  { vendor: "Party Jollof Joint", food: "Smoky party jollof", emoji: "🍚" },
  { vendor: "Fried Rice Corner", food: "Fried rice & chicken", emoji: "🍗" },
  { vendor: "Banku & Tilapia Spot", food: "Banku with tilapia", emoji: "🐟" },
  { vendor: "Indomie Boss", food: "Indomie special", emoji: "🍜" },
  { vendor: "Osikan Chop Bar", food: "Fufu & light soup", emoji: "🍲" },
  { vendor: "Papaye", food: "Fried chicken & chips", emoji: "🍗" },
  { vendor: "Chicken Republic", food: "Spicy wings", emoji: "🍗" },
  { vendor: "Red Red Stand", food: "Red red & plantain", emoji: "🫘" },
  { vendor: "Koko & Bread Morning", food: "Koko with bread", emoji: "🥣" },
  { vendor: "Grilled Tilapia Hub", food: "Grilled tilapia", emoji: "🐟" },
  { vendor: "Yam Chips Express", food: "Yam chips & shito", emoji: "🍟" },
  { vendor: "Pizza Inn Legon", food: "Pepperoni pizza", emoji: "🍕" },
  { vendor: "Cold Store 24/7", food: "Chilled drinks pack", emoji: "🥤" },
  { vendor: "Night Market Waakye", food: "Waakye deluxe", emoji: "🍛" },
];

export const CUSTOMERS = [
  "Nana", "Ama", "Kwame", "Yaw", "Kojo", "Efya", "Kofi", "Abena", "Akua", "Kwesi",
  "Maame", "Fiifi", "Adwoa", "Kweku", "Akosua", "Yaa", "Kobby", "Esi",
];

const ACCRA_ORIGIN = { lat: 5.6425, lon: -0.18628 };

/** Legacy pads for procedural fallback — synced with locations.json */
export const GEO_PADS = [
  { name: "Night Market", lat: 5.6425, lon: -0.18628 },
  { name: "Okponglo", lat: 5.64077, lon: -0.18375 },
  { name: "Legon Traffic Light", lat: 5.64055, lon: -0.17925 },
  { name: "Legon Post Office", lat: 5.65090, lon: -0.18763 },
  { name: "UPSA", lat: 5.66155, lon: -0.16638 },
].map(p => ({ ...p, ...latLonToWorld(p.lat, p.lon, ACCRA_ORIGIN) }));

export const MIN_PICKUP_METRES = 280;

export function pickupStops(): OrderStop[] {
  return ORDER_STOPS.filter(s => s.role === "vendor" || s.role === "both");
}

export function dropStops(): OrderStop[] {
  return ORDER_STOPS.filter(s => s.role === "customer" || s.role === "both");
}

export interface OrderPricing {
  reward: number;
  xp: number;
  timeTotal: number;
}

export function priceOrder(
  index: number,
  pickup: { x: number; z: number },
  drop: { x: number; z: number },
  payoutMult = 1,
): OrderPricing {
  const directMetres = Math.hypot(drop.x - pickup.x, drop.z - pickup.z);
  const distKm = Math.max(0.35, directMetres / 1000);
  const generous = index < 3 ? 1.45 : index < 7 ? 1.2 : 1.0;
  return {
    reward: Math.round((5.5 + distKm * 2.4) * payoutMult * 100) / 100,
    xp: Math.round(500 + distKm * 250),
    timeTotal: Math.round((75 + distKm * 70) * generous),
  };
}

function pickStop(stops: OrderStop[], index: number, salt: number, avoid?: OrderStop): OrderStop {
  const pool = avoid ? stops.filter(s => s.id !== avoid.id) : stops;
  return pool[(index + salt) % pool.length] ?? stops[0];
}

function farEnough(a: { x: number; z: number }, b: { x: number; z: number }, min: number): boolean {
  return Math.hypot(b.x - a.x, b.z - a.z) >= min;
}

export interface OrderDraft {
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

export function buildOrder(index: number, payoutMult = 1): OrderDraft {
  const v = VENDORS[index % VENDORS.length];
  const pickups = pickupStops();
  const drops = dropStops();
  let pickup = pickStop(pickups, index, 0);
  let drop = pickStop(drops, index, 5, pickup);
  if (!farEnough(pickup, drop, MIN_PICKUP_METRES)) {
    drop = drops.find(s => s.id !== pickup.id && farEnough(pickup, s, MIN_PICKUP_METRES)) ?? drop;
  }
  const priced = priceOrder(index, pickup, drop, payoutMult);
  return {
    id: index + 1,
    vendor: `${v.vendor} · ${pickup.name}`,
    food: v.food,
    emoji: v.emoji,
    customer: CUSTOMERS[index % CUSTOMERS.length],
    dropoff: drop.name,
    ...priced,
    pickupX: pickup.x,
    pickupZ: pickup.z,
    dropX: drop.x,
    dropZ: drop.z,
  };
}

/** Move a pickup that sits on the rider out to the nearest real pad a few hundred metres away. */
export function separateOrderFromRider(
  order: OrderDraft,
  riderX: number,
  riderZ: number,
  index: number,
): OrderDraft {
  if (Math.hypot(order.pickupX - riderX, order.pickupZ - riderZ) >= MIN_PICKUP_METRES) return order;
  const pickup = ORDER_STOPS
    .map(pad => ({ pad, distance: Math.hypot(pad.x - riderX, pad.z - riderZ) }))
    .filter(item => item.distance >= MIN_PICKUP_METRES && (item.pad.role === "vendor" || item.pad.role === "both"))
    .sort((a, b) => a.distance - b.distance)[0]?.pad;
  if (!pickup) return order;
  const dropStillWorks = order.dropoff
    && order.dropoff !== pickup.name
    && ORDER_STOPS.some(d => d.name === order.dropoff && farEnough(pickup, d, MIN_PICKUP_METRES));
  const drop = dropStillWorks
    ? ORDER_STOPS.find(d => d.name === order.dropoff)!
    : dropStops()
      .filter(pad => pad.name !== pickup.name && farEnough(pickup, pad, MIN_PICKUP_METRES))
      .sort((a, b) => Math.hypot(a.x - pickup.x, a.z - pickup.z) - Math.hypot(b.x - pickup.x, b.z - pickup.z))[0];
  if (!drop) return order;
  return {
    ...order,
    vendor: order.vendor.replace(/ · [^·]+$/, ` · ${pickup.name}`),
    dropoff: drop.name,
    ...priceOrder(index, pickup, drop),
    pickupX: pickup.x,
    pickupZ: pickup.z,
    dropX: drop.x,
    dropZ: drop.z,
  };
}
