/**
 * In-game radio. The first station streams a real Ghana playlist through
 * SoundCloud's embedded player; the others are fictional stations whose beat
 * lives in GameAudio. Their DJs react to rain and dumsor.
 */
export interface Station {
  name: string;
  freq: string;
  dj: string;
  /** Public SoundCloud playlist streamed through the official widget. */
  soundcloud?: string;
  /** Synth groove in GameAudio for fictional stations. */
  beat?: "highlife" | "hiplife";
  /** "Artist — Title" for music stations. */
  songs: string[];
  chatter: string[];
}

export const STATIONS: Station[] = [
  {
    name: "Ghana Top 2025", freq: "SoundCloud", dj: "21Charts",
    soundcloud: "https://soundcloud.com/21charts/sets/ghana-songs-2025-todays-top",
    songs: [], chatter: [],
  },
  {
    name: "Akwaaba FM", freq: "101.3", dj: "DJ Kwesi Ampofo", beat: "highlife",
    songs: [
      "Nana Kwame & The Akwaaba Band — Sweet Mother Accra",
      "Ewurama Mensah — Kokoo Nkwan",
      "Agya Koo Brass — Odo Yɛ Dɛ",
      "Papa Yankson Jr — Legon Sunset",
    ],
    chatter: [
      "Good evening Accra! Highlife dey your ear tonight.",
      "Shout-out to all the Night Market riders — ride safe o!",
      "This next one go remind you of your grandfather's wedding 😄",
      "If you dey Okponglo junction, wave for the rider wey dey pass!",
    ],
  },
  {
    name: "Okponglo Hiplife", freq: "96.5", dj: "DJ Showboy Kwame", beat: "hiplife",
    songs: [
      "Young Kweku — Shito Dey",
      "Ama Spark ft. Kofi Strings — Waakye Love",
      "Lil Abena — Chop Money",
      "Kobby Flex — Trotro Mate",
    ],
    chatter: [
      "Okponglo stand up! Hiplife on the move!",
      "Azonto people, make una show me something!",
      "Campus people, exam dey come but tonight we jam 🔥",
      "Request line open — text me, but no be while you dey ride o!",
    ],
  },
  {
    name: "Legon Talk", freq: "88.7", dj: "Auntie Efua (Traffic & Talk)",
    songs: [],
    chatter: [
      "Traffic: Tetteh Quarshie interchange dey heavy. Use Okponglo if you fit.",
      "Madina–Adenta highway dey flow small small tonight.",
      "Caller from Dansoman say ECG take light since six. ECG, una dey hear?",
      "Shiashie: one trotro break down near the flyover. Expect small delay.",
      "Black Stars squad don drop. Accra people, the argument don start 😂",
      "Legon boundary: police checkpoint dey. Carry your licence.",
    ],
  },
];

export const RADIO_REACTIONS = {
  rain: "Ei, rain don start! Riders, slow down, the road dey slippery.",
  rainStop: "Rain don stop. Accra, we move!",
  dumsor: "Dumsor again! Who get gen, on am. Who no get, we dey with you 😩",
  power: "Light don come back! Medaase ECG… this time.",
} as const;

/** Next caption: alternate songs and DJ chatter (talk radio is all chatter). */
export function radioCaption(stationIndex: number, beat: number): string {
  const st = STATIONS[stationIndex];
  // The SoundCloud widget reports its own "now playing".
  if (!st || st.soundcloud) return "";
  if (!st.songs.length) return `${st.dj}: “${st.chatter[beat % st.chatter.length]}”`;
  if (beat % 2 === 1) return `${st.dj}: “${st.chatter[Math.floor(beat / 2) % st.chatter.length]}”`;
  return `♪ ${st.songs[Math.floor(beat / 2) % st.songs.length]}`;
}
