import type { Metadata, Viewport } from "next";
import { DM_Sans, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
  weight: ["600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
  weight: ["500", "600", "700"],
});

const siteUrl = "https://night-market-rider.vercel.app";
const title = "Night Market Rider — Deliver Accra. Beat the clock.";
const description =
  "Ride through real Accra streets at night. Pick up chop orders, dodge traffic, and beat the clock in this browser delivery game.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "Night Market Rider",
  manifest: "/site.webmanifest",
  keywords: ["Accra", "delivery game", "Ghana", "night market", "motorbike", "OpenStreetMap"],
  authors: [{ name: "stunner100", url: "https://github.com/stunner100/night-market-rider" }],
  openGraph: {
    type: "website",
    url: siteUrl,
    title,
    description,
    siteName: "Night Market Rider",
    images: [
      {
        url: "/brand/rider-site.png",
        width: 1200,
        height: 630,
        alt: "Night Market Rider — motorbike delivery game in Accra",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/brand/rider-site.png"],
  },
  icons: {
    icon: [{ url: "/brand/night-market-logo.png", type: "image/png" }],
    apple: [{ url: "/brand/night-market-logo.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f1a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
