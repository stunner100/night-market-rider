import type { Metadata } from "next";
import { Anton } from "next/font/google";
import "./globals.css";

// Condensed display face for big HUD numbers and titles (hand-painted signboard feel).
const display = Anton({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Night Market Rider — Your city. Your bike. Your shift.",
  description: "Explore Accra and work a Night Market delivery shift: ride, collect food, call customers and hand over orders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={display.variable}>
      <body>{children}</body>
    </html>
  );
}
