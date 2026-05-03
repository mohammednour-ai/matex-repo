/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
        accent: {
          50: "#fff8ed",
          100: "#ffeed4",
          200: "#ffd9a8",
          300: "#ffbe71",
          400: "#ff9838",
          500: "#fe7c11",
          600: "#ef6107",
          700: "#c64908",
          800: "#9d3a0f",
          900: "#7e3110",
          950: "#441606",
        },
        steel: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#b0b8c9",
          400: "#8692ab",
          500: "#677591",
          600: "#525e78",
          700: "#434d62",
          800: "#3a4253",
          900: "#343a47",
          950: "#1e222b",
        },
        surface: {
          50: "#faf9f7",
          100: "#f4f1ed",
          200: "#e8e3db",
        },
        success: { 50: "#ecfdf5", 100: "#d1fae5", 500: "#10b981", 600: "#059669", 700: "#047857" },
        warning: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f" },
        danger: { 50: "#fef2f2", 100: "#fee2e2", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
      backgroundImage: {
        "industrial-grain": "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        "card": "0 1px 3px 0 rgba(0,0,0,.06), 0 1px 2px -1px rgba(0,0,0,.06)",
        "card-hover": "0 4px 12px -2px rgba(0,0,0,.1), 0 2px 4px -2px rgba(0,0,0,.06)",
        "glow-brand": "0 0 20px -4px rgba(234,88,12,.28)",
        "glow-accent": "0 0 20px -4px rgba(254,124,17,.25)",
        /** Industrial control-room panels */
        "industrial-panel":
          "0 1px 0 0 rgba(30,34,43,0.06), 0 18px 48px -28px rgba(15,23,42,0.35), inset 0 1px 0 0 rgba(255,255,255,0.65)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
