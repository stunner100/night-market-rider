/**
 * Street text that makes the city read as Accra: shopfronts with faith-and-hustle
 * names, roadside billboards, trotro slogans and the mates' destination calls.
 * All names are invented; no real businesses or brands.
 */
export const pickSeeded = <T>(list: readonly T[], seed: number): T => list[Math.abs(seed) % list.length];

/** [name, sign colour] */
export const SHOP_SIGNS: readonly (readonly [string, string])[] = [
  ["GOD IS ABLE ENTERPRISE", "#245847"],
  ["SWEET MOTHER CHOP BAR", "#753e2e"],
  ["NYAME NE HENE VENTURES", "#335167"],
  ["NO WEAPON FORMED SPARE PARTS", "#5c2d2d"],
  ["BLESSED HANDS BEAUTY SALON", "#8a2f6b"],
  ["GYE NYAME MOBILE MONEY", "#b49a25"],
  ["ALL IS WELL BARBERING SHOP", "#633e34"],
  ["PSALM 23 VULCANIZING", "#3d3d3d"],
  ["FATHER'S LOVE PHARMACY", "#1f6f50"],
  ["THY WILL BE DONE TAILORING", "#335167"],
  ["ONYAME BEKYERE ELECTRICALS", "#2d4f7a"],
  ["EXCEL CYBER CAFE · PRINTING", "#2b3a55"],
  ["AUNTIE AKOS WAAKYE", "#7a4a1f"],
  ["ADOM PHARMACY", "#245847"],
  ["AKOSUA PROVISIONS", "#9c7330"],
  ["SHIASHIE TAILOR", "#335167"],
  ["CHOP BAR · BANKU · TILAPIA", "#753e2e"],
  ["SANKOFA HARDWARE", "#4d4d33"],
  ["FEAR WOMEN HAIR SALON", "#8a2f6b"],
  ["OSU KENKEY HOUSE", "#6b5a2a"],
  ["MOBILE MONEY · CASH IN / OUT", "#b49a25"],
  ["EBENEZER PHONE REPAIRS", "#2b3a55"],
];

/** Small stand-alone kiosks. */
export const KIOSK_SIGNS = [
  "MoMo · CASH IN/OUT", "PROVISIONS", "CREDIT · AIRTIME", "PURE WATER", "PHONE REPAIRS", "BOFROT · TEA",
] as const;

/** Roadside food stands, with the colour of their sign board. */
export const STREET_FOOD: readonly (readonly [string, string])[] = [
  ["KENKEY · FISH · PEPPER", "#f1e3b6"],
  ["KELEWELE", "#ffd43b"],
  ["WAAKYE", "#e9d8a6"],
  ["COCONUT ₵5", "#c3e88d"],
  ["ICE KENKEY", "#a5d8ff"],
  ["BOFROT", "#ffc078"],
  ["ROASTED PLANTAIN · NKATE", "#ffd8a8"],
  ["TEA BREAD · EGG", "#fff3bf"],
];

/** [headline, footer, background, text, accent] */
export const BILLBOARDS: readonly (readonly [string, string, string, string, string])[] = [
  ["MIRACLE NIGHT ALL-NIGHT CRUSADE", "FRIDAY 9PM · LEGON BOUNDARY · COME & SEE", "#3b1f6b", "#ffd43b", "#ffd43b"],
  ["ARE YOU SAVED?", "JESUS IS COMING SOON · REPENT", "#f8f9fa", "#c92a2a", "#c92a2a"],
  ["LAND FOR SALE · EAST LEGON", "DOCUMENTS READY · CALL 024 000 0000", "#1d4f2c", "#fff", "#f2e35c"],
  ["AKWAABA SACHET WATER", "PURE · COLD · ₵1", "#1c7ed6", "#fff", "#f8f9fa"],
  ["SANKOFA CEMENT", "BUILD WITH STRENGTH", "#495057", "#ffd43b", "#ffd43b"],
  ["NIGHT MARKET · CHOP DEY COME", "ORDER NOW · RIDERS DEY LEGON SIDE", "#0b0b0c", "#f2e35c", "#f2e35c"],
  ["WATCH YOUR SPEED", "ARRIVE ALIVE · NATIONAL ROAD SAFETY", "#ffd43b", "#111", "#111"],
  ["BIG MAN FUNERAL · SAT", "CELEBRATION OF LIFE · ALL ARE WELCOME", "#111", "#f8f9fa", "#c92a2a"],
];

/** Hand-painted rear-window slogans. */
export const TROTRO_SLOGANS = [
  "GOD'S TIME IS THE BEST", "NO TIME TO CHECK TIME", "SEE ME AND GO", "FEAR WOMEN",
  "ENEMIES ARE NOT GOD", "NSA BI KO", "SUNSUM", "OBIA WO NE DA", "THE LORD IS MY SHEPHERD", "AWURADE KASA",
] as const;

/** Where each trotro is heading, and what the mate shouts. */
export const TROTRO_ROUTES = [
  { board: "MADINA", call: "MADINA! MADINA! MADINA!" },
  { board: "CIRCLE", call: "CIRCLE! CIRCLE! KWAME NKRUMAH!" },
  { board: "ACCRA", call: "ACCRA! ACCRA! TUDU! ACCRA!" },
  { board: "37", call: "37! 37! 37 STATION!" },
  { board: "KANESHIE", call: "KANESHIE! KANESHIE MARKET!" },
  { board: "LAPAZ", call: "LAPAZ! LAPAZ! ACHIMOTA!" },
  { board: "ATOMIC", call: "ATOMIC! ATOMIC JUNCTION!" },
  { board: "SPINTEX", call: "SPINTEX! SPINTEX! COCA-COLA!" },
] as const;
