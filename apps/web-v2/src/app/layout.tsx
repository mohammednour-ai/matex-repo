import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/system/ToastProvider";
import { PostHogProvider } from "@/components/system/PostHogProvider";
import { ThemeProvider, themeBootstrapScript } from "@/components/system/ThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

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
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/logo-mark.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon-32.png"],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Matex | B2B Recycled Materials Marketplace",
    description:
      "Canada's leading B2B marketplace for recycled materials. Buy and sell scrap metal, plastics, paper, and more with full compliance, escrow protection, and real-time auctions.",
    type: "website",
    siteName: "Matex",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Matex — B2B Recycled Materials Marketplace",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Matex | B2B Recycled Materials Marketplace",
    description:
      "Canada's leading B2B marketplace for recycled materials.",
    images: ["/twitter-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          {children}
          <ToastProvider />
          <PostHogProvider />
        </ThemeProvider>
      </body>
    </html>
  );
}
