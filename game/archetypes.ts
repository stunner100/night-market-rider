/**
 * "Who you be for Accra?" — a four-question quiz picks the rider's archetype,
 * which sets a small upside and a wahala for the whole career.
 */
export type ArchetypeId = "okada" | "campus" | "burger" | "chopbar";

export interface Archetype {
  id: ArchetypeId;
  name: string;
  emoji: string;
  tagline: string;
  /** Where you live — shown on the reveal card and by Dede. */
  home: string;
  upside: string;
  wahala: string;
  perks: Perks;
}

export interface Perks {
  /** Top-speed multiplier. */
  speed: number;
  /** Chance that an order (from the second) routes past a police checkpoint. */
  checkpointChance: number;
  /** Customer tip multiplier. */
  tips: number;
  /** Multiplier on food damage from bumps and braking. */
  spill: number;
  /** Multiplier on vendor preparation time. */
  prep: number;
  /** One-time GH₵ when the archetype is first chosen. */
  startCash: number;
}

const BASE: Perks = { speed: 1, checkpointChance: 0.45, tips: 1, spill: 1, prep: 1, startCash: 0 };

export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  okada: {
    id: "okada", name: "Okada Boy", emoji: "🏍️",
    tagline: "Born on two wheels. You sabi every shortcut for Okponglo.",
    home: "Single room for Okponglo, behind the kelewele spot",
    upside: "Top speed +8% — you dey fly",
    wahala: "Police like you too much — more checkpoints",
    perks: { ...BASE, speed: 1.08, checkpointChance: 0.65 },
  },
  campus: {
    id: "campus", name: "Campus Hustler", emoji: "🎓",
    tagline: "Legon student by day, Night Market rider by night. School fees no go pay itself.",
    home: "Bunk for Commonwealth Hall annex, Legon",
    upside: "Customers like students — tips +15%",
    wahala: "Exams dey your head — food damage +15%",
    perks: { ...BASE, tips: 1.15, spill: 1.15 },
  },
  burger: {
    id: "burger", name: "Burger", emoji: "✈️",
    tagline: "You just land from abroad. Accent small small, dollars for pocket.",
    home: "Uncle's boys' quarters, East Legon",
    upside: "GH₵100 to start — the dollars go far",
    wahala: "You no sabi the potholes — food damage +25%",
    perks: { ...BASE, startCash: 100, spill: 1.25 },
  },
  chopbar: {
    id: "chopbar", name: "Chop Bar Pikin", emoji: "🍲",
    tagline: "You grow inside your mama's chop bar. Every vendor know your face.",
    home: "Family house for Shiashie, near Mama's chop bar",
    upside: "Vendors know your mama — food ready 2× faster",
    wahala: "Maame dey call you every time 😅",
    perks: { ...BASE, prep: 0.5 },
  },
};

export const perksFor = (id: ArchetypeId | null): Perks => (id ? ARCHETYPES[id].perks : BASE);

export interface Question {
  q: string;
  answers: { text: string; to: ArchetypeId }[];
}

export const QUIZ: Question[] = [
  {
    q: "Na Saturday morning. Where you dey?",
    answers: [
      { text: "On the road — money no dey sleep", to: "okada" },
      { text: "Balme Library, exam dey come", to: "campus" },
      { text: "Brunch for Osu with the squad", to: "burger" },
      { text: "Funeral grounds, ready to chop", to: "chopbar" },
    ],
  },
  {
    q: "How you dey move for Accra?",
    answers: [
      { text: "Okada, obviously", to: "okada" },
      { text: "Trotro — “Circle! Circle!”", to: "campus" },
      { text: "Uber, I no fit sweat", to: "burger" },
      { text: "Waka — my legs strong", to: "chopbar" },
    ],
  },
  {
    q: "Your favourite chop?",
    answers: [
      { text: "Jollof — Ghana own pass Naija own", to: "okada" },
      { text: "Waakye with everything", to: "campus" },
      { text: "Pizza and milkshake", to: "burger" },
      { text: "Banku and tilapia, plenty pepper", to: "chopbar" },
    ],
  },
  {
    q: "Police stop you. You go…",
    answers: [
      { text: "Settle am small, make I go", to: "okada" },
      { text: "Show papers — I get everything", to: "campus" },
      { text: "Call my uncle for Jubilee House", to: "burger" },
      { text: "“Officer, mepa wo kyɛw…”", to: "chopbar" },
    ],
  },
];

/** Most-picked archetype; ties go to the earliest answer given. */
export function scoreQuiz(picks: ArchetypeId[]): ArchetypeId {
  const counts = new Map<ArchetypeId, number>();
  for (const p of picks) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best: ArchetypeId = picks[0] ?? "okada";
  for (const p of picks) if ((counts.get(p) ?? 0) > (counts.get(best) ?? 0)) best = p;
  return best;
}
