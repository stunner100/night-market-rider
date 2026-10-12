"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/store";
import { STATIONS } from "@/game/radio";

/** Look up a station's current stream in the open Radio Browser directory (stream keys can rotate). */
async function freshStream(name: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(name)}?countrycode=GH&hidebroken=true&order=clickcount&reverse=true&limit=5`,
    );
    if (!res.ok) return null;
    const list = (await res.json()) as { url_resolved?: string }[];
    return list.map((s) => s.url_resolved).find((u): u is string => !!u && u.startsWith("https://")) ?? null;
  } catch {
    return null;
  }
}

/**
 * Real Ghanaian radio while riding: plays the station's public live stream in
 * an <audio> element, only while the rider is on the bike.
 */
export default function LiveRadio() {
  const audio = useRef<HTMLAudioElement>(null);
  const pausedAt = useRef(0);
  const retried = useRef<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const radio = useGame((s) => s.radio);
  const mounted = useGame((s) => s.mounted);
  const paused = useGame((s) => s.paused);
  const sound = useGame((s) => s.sound);
  const ringing = useGame((s) => !!s.incomingCall);
  const station = STATIONS[radio];
  const live = !!station?.stream && mounted && !paused && sound;

  // Switching station resets to its listed stream.
  useEffect(() => {
    setSrc(station?.stream ?? null);
    retried.current = null;
  }, [station]);

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    if (!live || !src) {
      if (!el.paused) { el.pause(); pausedAt.current = performance.now(); }
      return;
    }
    // Rejoin the live edge after a long pause instead of playing stale buffer.
    if (el.src !== src || performance.now() - pausedAt.current > 20000) el.src = src;
    const play = () => el.play().catch(() => { /* blocked until the player interacts; retried below */ });
    play();
    window.addEventListener("pointerdown", play, { once: true });
    window.addEventListener("keydown", play, { once: true });
    const onError = async () => {
      if (!station || retried.current === station.name) {
        useGame.getState().set({ radioCaption: `${station?.name ?? "Station"} no dey answer — press R for another` });
        return;
      }
      retried.current = station.name;
      const fresh = await freshStream(station.name);
      if (fresh && fresh !== src) setSrc(fresh);
      else useGame.getState().set({ radioCaption: `${station.name} no dey answer — press R for another` });
    };
    el.addEventListener("error", onError);
    return () => {
      window.removeEventListener("pointerdown", play);
      window.removeEventListener("keydown", play);
      el.removeEventListener("error", onError);
    };
  }, [live, src, station]);

  useEffect(() => {
    if (audio.current) audio.current.volume = ringing ? 0.2 : 0.85;
  }, [ringing, src]);

  // Stop the stream entirely when the game UI goes away.
  useEffect(() => () => { audio.current?.pause(); audio.current?.removeAttribute("src"); }, []);

  // The <audio> element stays mounted so switching stations never loses it.
  return (
    <div className="soundcloud-radio" hidden={!station?.stream}>
      <audio ref={audio} preload="none" />
      {!mounted && <span>Radio go play when you climb the bike 🏍️</span>}
      {station?.stream && (
        <span>Live stream from {station.name} {station.freq !== "Online" ? `${station.freq} FM` : ""}</span>
      )}
    </div>
  );
}
