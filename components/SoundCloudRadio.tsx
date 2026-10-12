"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/store";
import { STATIONS } from "@/game/radio";

/** Minimal surface of SoundCloud's Widget API (https://developers.soundcloud.com/docs/api/html5-widget). */
interface ScSound { title?: string; user?: { username?: string } }
interface ScWidget {
  bind(event: string, cb: (e?: unknown) => void): void;
  play(): void;
  pause(): void;
  next(): void;
  skip(index: number): void;
  setVolume(v: number): void;
  getSounds(cb: (sounds: ScSound[]) => void): void;
  getCurrentSound(cb: (sound: ScSound | null) => void): void;
}
declare global {
  interface Window {
    SC?: { Widget: ((el: HTMLIFrameElement) => ScWidget) & { Events: Record<string, string> } };
  }
}

const API = "https://w.soundcloud.com/player/api.js";
let apiLoad: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.SC) return Promise.resolve();
  apiLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = API;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { apiLoad = null; reject(new Error("SoundCloud widget failed to load")); };
    document.head.appendChild(script);
  });
  return apiLoad;
}

const embedUrl = (playlist: string) =>
  "https://w.soundcloud.com/player/?" +
  new URLSearchParams({
    url: playlist,
    auto_play: "false",
    visual: "false",
    show_artwork: "false",
    show_comments: "false",
    show_user: "true",
    show_reposts: "false",
    show_teaser: "false",
    buying: "false",
    sharing: "false",
    download: "false",
    color: "#f2e35c",
  }).toString();

/**
 * Real Ghanaian music while riding: SoundCloud's own mini player streams the
 * playlist (with its attribution) and plays only while the rider is on the bike.
 */
export default function SoundCloudRadio() {
  const frame = useRef<HTMLIFrameElement>(null);
  const widget = useRef<ScWidget | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const radio = useGame((s) => s.radio);
  const mounted = useGame((s) => s.mounted);
  const paused = useGame((s) => s.paused);
  const sound = useGame((s) => s.sound);
  const ringing = useGame((s) => !!s.incomingCall);
  const station = STATIONS[radio];
  const playlist = station?.soundcloud;
  const live = !!playlist && mounted && !paused && sound;

  useEffect(() => {
    if (!playlist || widget.current || !frame.current) return;
    let cancelled = false;
    loadApi()
      .then(() => {
        if (cancelled || !frame.current || !window.SC) return;
        const w = window.SC.Widget(frame.current);
        const E = window.SC.Widget.Events;
        widget.current = w;
        w.bind(E.READY, () => {
          // Start somewhere different each shift.
          w.getSounds((sounds) => { if (sounds.length > 1) w.skip(Math.floor(Math.random() * sounds.length)); });
          setReady(true);
        });
        w.bind(E.PLAY, () => {
          w.getCurrentSound((s) => {
            if (!s?.title) return;
            useGame.getState().set({ radioCaption: `♪ ${s.title}${s.user?.username ? ` — ${s.user.username}` : ""}` });
          });
        });
        // Region-blocked or removed tracks: move on instead of going silent.
        w.bind(E.ERROR, () => w.next());
      })
      .catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [playlist]);

  useEffect(() => {
    const w = widget.current;
    if (!w || !ready) return;
    if (!live) { w.pause(); return; }
    w.play();
    // Browsers block audio until the player interacts; try again on their next input.
    const retry = () => w.play();
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [live, ready]);

  useEffect(() => {
    if (ready) widget.current?.setVolume(ringing ? 20 : 70);
  }, [ringing, ready]);

  useEffect(() => {
    if (failed && playlist) useGame.getState().set({ radioCaption: "SoundCloud no dey load — press R for live radio" });
  }, [failed, playlist]);

  // Keep the iframe mounted (so the playlist keeps its place) but only show it on this station.
  if (!playlist && !widget.current) return null;
  return (
    <div className="soundcloud-radio" hidden={!playlist}>
      <iframe
        ref={frame}
        title="Ghana Top 2025 on SoundCloud"
        src={embedUrl(playlist ?? STATIONS.find((s) => s.soundcloud)!.soundcloud!)}
        allow="autoplay; encrypted-media"
        loading="eager"
      />
      <a href={playlist ?? undefined} target="_blank" rel="noopener noreferrer">
        Playlist by 21charts on SoundCloud
      </a>
      {!mounted && playlist && <span>Music go play when you climb the bike 🏍️</span>}
    </div>
  );
}
