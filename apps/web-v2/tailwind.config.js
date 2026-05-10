/** @type {import('tailwindcss').Config} */
//
// Phase 1 — semantic-token wiring.
//
// `night-*` is now driven by CSS variables defined in globals.css under
// `:root` (light) and `.dark` (dark). The numeric step indicates a logical
// role (100 = primary fg, 850 = surface, 900 = canvas) — actual color flips
// with theme. Brand/accent/info/success/warning/danger scales remain literal.
// New semantic aliases (canvas, surface, elevated, fg, fg-muted, line, …) are
// added on top — Phase 4 migrates components onto them.
//
// See docs/redesign/01-tokens.md for the full spec.

const cssVarRgb = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
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
        /* ── Steel — industrial neutral scale (literal, mode-stable) ── */
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
        /*
         * ── Night — semantic neutral scale, themed via CSS variables.
         *
         * Numeric step = logical role:
         *   100 = primary text          850 = surface (cards)
         *   200 = secondary text        900 = canvas (page)
         *   300 = tertiary / muted      950 = sunken (extreme)
         *   600 = border strong         800 = surface raised (hover, inputs)
         *   700 = border default        750 = dropdowns / popovers
         *
         * Light values: warm off-white canvas, white surfaces, deep steel-black text.
         * Dark values: cool steel-black canvas, dark steel surfaces, near-white text.
         * Definitions in globals.css.
         */
        night: {
          100: cssVarRgb("night-100"),
          200: cssVarRgb("night-200"),
          300: cssVarRgb("night-300"),
          400: cssVarRgb("night-400"),
          500: cssVarRgb("night-500"),
          600: cssVarRgb("night-600"),
          700: cssVarRgb("night-700"),
          750: cssVarRgb("night-750"),
          800: cssVarRgb("night-800"),
          850: cssVarRgb("night-850"),
          900: cssVarRgb("night-900"),
          950: cssVarRgb("night-950"),
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
        /* ── Semantic aliases (Phase 4 will migrate components onto these) ── */
        canvas:        cssVarRgb("night-900"),
        surfaceBg:     cssVarRgb("night-850"),
        elevated:      cssVarRgb("night-800"),
        sunken:        cssVarRgb("night-950"),
        fg:            cssVarRgb("night-100"),
        "fg-muted":    cssVarRgb("night-200"),
        "fg-subtle":   cssVarRgb("night-300"),
        "fg-disabled": cssVarRgb("night-400"),
        line:          cssVarRgb("night-700"),
        "line-strong": cssVarRgb("night-600"),
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui"],
      },
      borderRadius: {
        card:    "1.25rem",
        hero:    "1.75rem",
        display: "2rem",
      },
      transitionTimingFunction: {
        standard:   "cubic-bezier(0.22, 1, 0.36, 1)",
        decelerate: "cubic-bezier(0, 0, 0.2, 1)",
        accelerate: "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        instant: "100ms",
        fast:    "150ms",
        normal:  "220ms",
        slow:    "350ms",
      },
      backgroundImage: {
        /* Subtle industrial cross-hatch grain */
        "industrial-grain": "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23B45309' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        /* Card shadows — themed via CSS vars (light + dark variants in globals.css) */
        "card":                    "var(--shadow-card)",
        "card-hover":              "var(--shadow-card-hover)",
        "industrial-panel":        "var(--shadow-industrial-panel)",
        "industrial-panel-raised": "var(--shadow-industrial-panel-raised)",
        /* Brand glow / focus ring — same in both modes */
        "glow-brand":  "0 0 24px -6px rgba(232,119,34,0.28)",
        "glow-accent": "0 0 20px -6px rgba(245,158,11,0.22)",
        "brand-ring":  "0 0 0 3px rgba(232,119,34,0.20)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
