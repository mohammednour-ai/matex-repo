import type { Metadata } from "next";
import "./globals.css";

// The app is entirely auth-gated / data-driven; skip static prerender so that
// Next doesn't evaluate client-only code paths at build time (which was
// surfacing a "useContext of null" error across every route on Railway).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Matex | B2B Recycled Materials Marketplace",
  description:
    "Canada's leading B2B marketplace for recycled materials. Buy and sell scrap metal, plastics, paper, and more with full compliance, escrow protection, and real-time auctions.",
  icons: {
    icon: [
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon-512.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-512.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/favicon-512.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon-512.png"],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
