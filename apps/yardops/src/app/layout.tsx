import type { Metadata } from "next";
import "./globals.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "YardOps | Scrap Yard Management",
  description: "Ontario scrap yard operations — intake, compliance, and Matex Exchange Hub integration.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-night-950 text-night-100 antialiased">
        {children}
      </body>
    </html>
  );
}
