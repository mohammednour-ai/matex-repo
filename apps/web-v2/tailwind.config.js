/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* ── Matex Orange — primary brand colour pulled from the logo ── */
        brand: {
          50:  "#fff4e6",
          100: "#ffe4be",
          200: "#ffc97a",
          300: "#ffa83c",
          400: "#f58d1a",
          500: "#e87722",   /* logo orange */
          600: "#d4650f",
          700: "#aa4e0a",
          800: "#813b07",
          900: "#5c2904",
          950: "#341500",
        },
        /* ── Accent amber — auction / live / highlight ── */
        accent: {
          50:  "#fffbea",
          100: "#fff3c4",
          200: "#ffe485",
          300: "#ffd04b",
          400: "#ffb820",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
        /* ── Steel — industrial neutral scale ── */
        steel: {
          50:  "#f6f7f8",
          100: "#edeef1",
          200: "#d8dadf",
          300: "#b4b9c4",
          400: "#8b93a4",
          500: "#6b7385",
          600: "#555c6d",
          700: "#454b59",
          800: "#3b404c",
          900: "#343841",
          950: "#1d2028",
        },
        /* ── Surface — warm off-white / stone work surfaces (kept for illustrations) ── */
        surface: {
          50:  "#faf8f5",
          100: "#f3efe8",
          200: "#e6dfd4",
          300: "#d4c9b8",
        },
        /* ── Night — cool steel-black scale (industrial machine shop) ── */
        night: {
          950: "#0a0a0b",   /* body base, true near-black */
          900: "#0f1115",   /* page canvas */
          850: "#14171c",   /* surface 1 — cards, panels */
          800: "#1a1e25",   /* surface 2 — inputs, hover */
          750: "#232830",   /* surface 3 — dropdowns, modals */
          700: "#2b313b",   /* border default (cool steel) */
          600: "#383f4b",   /* border strong / hover */
          500: "#4b5260",   /* muted icon stroke */
          400: "#6b7280",   /* secondary muted */
          300: "#8b92a0",   /* hint / caption text */
          200: "#b8bec9",   /* secondary text (cool grey) */
          100: "#f2f4f7",   /* primary body text (cool white) */
        },
        /* ── Info — small dose of blue accent (links, hints, info badges) ── */
        info: {
          50:  "#eff6ff",
          100: "#dbeafe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        /* ── Semantic ── */
        success: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },
        warning: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        danger: {
          50:  "#fef2f2",
          100: "#fee2e2",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      backgroundImage: {
        /* Subtle industrial cross-hatch grain */
        "industrial-grain": "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23B45309' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        /* Card shadows — deep but not loud */
        "card":               "0 1px 2px 0 rgba(0,0,0,.45), 0 4px 12px -2px rgba(0,0,0,.50)",
        "card-hover":         "0 8px 24px -6px rgba(0,0,0,.65), 0 0 0 1px rgba(150,165,190,0.10)",
        /* Restrained orange glow / focus ring (was 0.55 / 0.32) */
        "glow-brand":         "0 0 24px -6px rgba(232,119,34,0.28)",
        "glow-accent":        "0 0 20px -6px rgba(245,158,11,0.22)",
        /* Industrial panel — neutral inset highlight; only a whisper of brand */
        "industrial-panel":
          "0 1px 0 0 rgba(0,0,0,0.55), 0 24px 48px -28px rgba(0,0,0,0.85), inset 0 1px 0 0 rgba(255,255,255,0.04)",
        "industrial-panel-raised":
          "0 1px 0 0 rgba(0,0,0,0.55), 0 30px 64px -30px rgba(0,0,0,0.92), inset 0 1px 0 0 rgba(255,255,255,0.05)",
        /* Focus ring — softer */
        "brand-ring":
          "0 0 0 3px rgba(232,119,34,0.20)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
