/**
 * The game's Accra voice: Ghanaian Pidgin with Twi, kept in one place so the
 * tone stays consistent. Lines are short — they show as toasts while riding.
 */
export const pick = <T>(lines: readonly T[], seed?: number): T =>
  lines[seed === undefined ? Math.floor(Math.random() * lines.length) : Math.abs(Math.floor(seed)) % lines.length];

export const LOADING_LINES = [
  "Trotro dey load for Madina 🚐",
  "Mate dey shout “Circle! Circle!”",
  "Waakye auntie dey open shop 🍛",
  "ECG don bring light back 💡",
  "Okada boys dey line up for Okponglo 🏍️",
  "Kelewele man dey fry for the junction 🔥",
] as const;

export const CRASH = {
  okada: ["🏍️ Okada clash! Chale, watch am.", "🏍️ Herh! You and okada boy dey fight?"],
  trotro: ["🚐 Trotro bump! Mate go curse you paa.", "🚐 Ei! You wan enter trotro free?"],
  bus: ["🚌 Bus bump! Easy oo.", "🚌 Massa, the bus big pass you o!"],
  taxi: ["🚕 Taxi crash! Driver say “Ah, you dey see?”", "🚕 Chale, the taxi man vex paa."],
  car: ["🚗 Crash! Chale, easy oo.", "🚗 Ei! Small small, boss."],
  wall: ["💥 You jam {name}! Easy oo.", "💥 Herh! {name} no dey move o."],
} as const;

export const STREET = {
  pothole: ["🕳️ Pothole! Chale, the road spoil.", "🕳️ Ei, this gutter road!", "🕳️ Pothole — the food dey shake o!"],
  ramp: ["⛰️ Speed ramp! Ɛyɛ!", "⛰️ Fly small!"],
  nearMiss: ["😱 Near miss! Agoo! +100", "😱 Close one! God dey! +100"],
  pedestrian: ["💥 Agoo! You knock person down. Easy oo!", "💥 Herh! Watch the people, boss!"],
  goat: ["🐐 Ei! The goat no get sense, but you too!", "🐐 Goat down! Owner go find you o."],
  coin: ["🪙 Chop money! +50 XP", "🪙 Small change dey road +50 XP"],
  horn: ["📯 Poooop!", "📯 Pim pim!", "📯 Agoo!"],
  fuelLow: ["⛽ Fuel dey go down. Find GOIL quick!", "⛽ Tank dey dry o — find station!"],
  fuelOut: ["⛽ Fuel finish! Push am go station 😩", "⛽ Empty tank! Call the base."],
  refuelDone: ["⛽ Tank full! Make we go!", "⛽ Full tank — ɛyɛ!"],
  start: ["LET'S RIDE! 🛵", "MAKE WE GO! 🛵"],
  calm: "Easy oo. Your shift still dey on.",
} as const;

export const DELIVERY = {
  accept: (vendor: string) => `Order don land — go ${vendor} sharp sharp!`,
  perfect: "✨ PERFECT! FOOD STILL HOT · ƐYƐ PAA",
  clean: "✨ NO COLLISION · YOU BE CORRECT RIDER",
  bagSecured: "🛵 Bag dey box. Make we go!",
  mapLoaded: "🗺️ Accra map don load",
} as const;

export const RIDER_HINTS = {
  stopFirst: "Brake first, then get down.",
  clearSpace: "Find clear space to park.",
  walkToBike: "Walk go your bike.",
  finishFirst: "Finish the delivery or go offline first.",
  serviced: "Bike don service. Fuel full. Accra dey wait!",
  rescued: "Base people bring you come with small fuel.",
} as const;

/** Spoken by the vendor or the customer during the delivery state machine. */
export const LINES = {
  offline: "You dey offline. Roam Accra small.",
  online: "Dey look for orders around…",
  offer: "New order dey!",
  declined: "You pass am. Next one dey come.",
  expired: "Order expire. Another one go come soon.",
  parkAtVendor: "Park well, get down and walk go the vendor.",
  vendorBusy: "Vendor: Small time please — the food never ready.",
  vendorReady: "Vendor: Night Market? I dey pack am for you now.",
  vendorHands: (who: string) => `${who}: Here. Check am against your ticket o.`,
  vendorSorry: (who: string) => `${who}: Ei, sorry paa! Make I add am.`,
  vendorAllThere: (who: string) => `${who}: Everything dey inside o — check the ticket again.`,
  itemAdded: "Item don add. Check the bag one more time.",
  foodReady: "Vendor: Your food ready. Come take am.",
  calling: (who: string) => `Dey call ${who}…`,
  noAnswer: "E dey ring, nobody pick. Call again or text am.",
  missedCall: (who: string, reply: string) => `${who}: Sorry, I miss your call. ${reply}`,
  onMyWay: (who: string, note: string) => `You: I dey come. ${who}: Medaase — ${note}`,
  thanks: (who: string) => `${who}: Medaase paa!`,
  payCash: (who: string) => `${who}: Medaase. I go pay cash — take.`,
  handing: "Dey hand over the food…",
  done: "Delivery done. Medaase!",
  nextReady: "You ready for the next one.",
} as const;

export const OBJECTIVES = {
  offline: "Roam Accra · go online when you ready",
  waiting: "Dey wait for order…",
  offer: "Check the new order",
  ridePickup: "Ride go the vendor",
  vendorMounted: "Park and get down",
  vendorWalk: "Walk go the vendor · confirm order",
  preparing: "Vendor dey prepare the food",
  collect: "Collect the order",
  checkBag: "Check the bag against the ticket",
  fixingBag: "Vendor dey add the missing item",
  returnBike: "Go back to your bike",
  rideCustomer: "Carry am go the customer",
  contact: "Stop and call the customer",
  calling: "E dey connect…",
  findMounted: "Park · find the customer for foot",
  findWalk: "Walk go the customer · hand over",
  payment: "Collect cash · give correct change",
  handoff: "Dey hand over the food",
  completed: "Delivery done",
} as const;
