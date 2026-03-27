import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matex | B2B Recycled Materials Marketplace",
  description:
    "Canada's leading B2B marketplace for recycled materials. Buy and sell scrap metal, plastics, paper, and more with full compliance, escrow protection, and real-time auctions.",
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
