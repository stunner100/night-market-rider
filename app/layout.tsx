import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Night Market Rider — Deliver Accra. Beat the clock.",
  description: "A Ghanaian night-market motorbike delivery arcade game set on stylized Accra streets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
