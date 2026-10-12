import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Night Market Rider — Your city. Your bike. Your shift.",
  description: "Explore Accra and work a Night Market delivery shift: ride, collect food, call customers and hand over orders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
