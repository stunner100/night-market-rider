"use client";

import { useGame } from "@/game/store";

export default function SiteFooter() {
  const phase = useGame((s) => s.phase);
  const inGame = ["offer", "toPickup", "pickup", "toDropoff", "deliver", "delivered", "countdown"].includes(phase);

  return (
    <footer className={`nm-footer ${inGame ? "nm-footer--in-game" : ""}`} aria-label="Credits">
      <span>Night Market Rider</span>
      <span className="nm-footer-sep" aria-hidden>
        ·
      </span>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
      >
        © OpenStreetMap contributors
      </a>
    </footer>
  );
}
