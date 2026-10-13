/**
 * Real pickup and drop-off points baked from OpenStreetMap: food places snapped
 * to a drivable road, and homes/hostels with a gate on the road side.
 */
export interface VendorSite {
  x: number;
  z: number;
  /** Road direction at the snap point. */
  yaw: number;
  /** OSM amenity/shop type, e.g. restaurant, fast_food, bakery. */
  kind: string;
  /** Nearby named place, used only as a landmark hint. */
  near: string | null;
  road: string | null;
}

export interface DropSite {
  /** Point on the road outside. */
  x: number;
  z: number;
  /** Gate position at the property line, facing the road (yaw). */
  gx: number;
  gz: number;
  yaw: number;
  kind: "home" | "hostel";
  name: string | null;
  road: string | null;
  near: string | null;
}

export interface DeliverySites {
  vendors: VendorSite[];
  drops: DropSite[];
}

const GATES = [
  { name: "blue", color: 0x1c5fa8 },
  { name: "green", color: 0x2b7a3d },
  { name: "black", color: 0x1d1f22 },
  { name: "maroon", color: 0x6e1f2b },
  { name: "silver", color: 0xa9adb1 },
  { name: "cream", color: 0xd9cba3 },
] as const;

/** Stable gate colour and house number for an order, so the note, the address and the world agree. */
export function gateFor(orderId: number, site?: DropSite | null) {
  const seed = Math.abs(Math.round((site?.gx ?? 0) * 7 + (site?.gz ?? 0) * 13) + orderId * 31);
  const gate = GATES[seed % GATES.length];
  const number = 3 + (seed % 47);
  return { ...gate, number };
}

/** Ghanaian-style directions: house number, road, and a landmark people actually use. */
export function addressFor(site: DropSite | null | undefined, orderId: number): string {
  if (!site) return "";
  const g = gateFor(orderId, site);
  if (site.kind === "hostel" && site.name) return `${site.name} · porter's lodge`;
  const road = site.road ? `, ${site.road}` : "";
  const near = site.near ? ` · near ${site.near}` : "";
  return `H/No. ${g.number}${road} — ${g.name} gate${near}`;
}

/** Pick sites at sensible distances: a vendor 250–1600 m from the rider, a drop 400–2600 m from the vendor. */
export function pickSites(sites: DeliverySites, rider: { x: number; z: number }, seed: number) {
  if (!sites.vendors.length || !sites.drops.length) return null;
  const rnd = (n: number) => Math.abs(Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1;
  const near = sites.vendors.filter(v => { const d = Math.hypot(v.x - rider.x, v.z - rider.z); return d > 250 && d < 1600; });
  const vendor = (near.length ? near : sites.vendors)[Math.floor(rnd(1) * (near.length || sites.vendors.length))];
  const fits = sites.drops.filter(d => { const k = Math.hypot(d.x - vendor.x, d.z - vendor.z); return k > 400 && k < 2600; });
  const drop = (fits.length ? fits : sites.drops)[Math.floor(rnd(2) * (fits.length || sites.drops.length))];
  return { vendor, drop };
}
