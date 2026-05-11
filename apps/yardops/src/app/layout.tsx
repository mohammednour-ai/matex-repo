import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "YardOps | Scrap Yard Management",
  description: "Ontario scrap yard operations — intake, compliance, and Matex Exchange Hub integration.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="bg-[var(--clr-bg)] text-[var(--clr-text-1)] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
