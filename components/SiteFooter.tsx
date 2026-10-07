"use client";

export default function SiteFooter() {
  return (
    <footer className="nm-footer" aria-label="Credits">
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
