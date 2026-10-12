/**
 * In-game radio: real Ghanaian stations' public live streams, plus a Ghana
 * playlist streamed through SoundCloud's embedded player.
 */
export interface Station {
  name: string;
  freq: string;
  /** On-air tagline shown under the station name. */
  dj: string;
  /** Public SoundCloud playlist streamed through the official widget. */
  soundcloud?: string;
  /** A real station's public live stream, played in an <audio> element. */
  stream?: string;
}

/** Real Accra stations' public streams (checked 12 Oct 2026). */
export const STATIONS: Station[] = [
  { name: "Hitz FM", freq: "103.9", dj: "Urban hits from Accra", stream: "https://mmg.streamguys1.com/HitzFM-mp3" },
  { name: "Joy FM", freq: "99.7", dj: "Accra's news & music", stream: "https://mmg.streamguys1.com/JoyFM-mp3?key=8689cc761932e3151f94ddbdbfdf4aa0f4000234b5caeaaa" },
  { name: "Citi FM", freq: "97.3", dj: "Citi, Accra", stream: "https://citi973fm.radioca.st/stream" },
  { name: "Ghana Music Radio", freq: "Online", dj: "Only Ghana music", stream: "https://streaming.radio.co/s92f890821/listen" },
  { name: "Adom FM", freq: "106.3", dj: "Twi radio, Accra", stream: "https://mmg.streamguys1.com/AdomFM-mp3?key=9099965b0e49394af3be11b42a71f0faa90378311d2d85f" },
  { name: "Peace FM", freq: "104.3", dj: "Twi talk & highlife", stream: "https://peacefm-atunwadigital.streamguys1.com/peacefm" },
  { name: "Ghana Top 2025", freq: "SoundCloud", dj: "21Charts", soundcloud: "https://soundcloud.com/21charts/sets/ghana-songs-2025-todays-top" },
];

/** Caption for live stations; the SoundCloud widget reports its own "now playing". */
export function radioCaption(stationIndex: number): string {
  const st = STATIONS[stationIndex];
  return st?.stream ? `📡 LIVE · ${st.dj}` : "";
}
