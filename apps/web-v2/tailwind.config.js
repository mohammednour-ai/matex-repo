/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fafb",
          100: "#e0f4f7",
          200: "#b8e8ef",
          300: "#82d5e0",
          400: "#46bace",
          500: "#1e9eb5",
          600: "#147e98",
          700: "#136578",
          800: "#155363",
          900: "#164554",
        },
        success: { 50: "#f0fdf4", 500: "#22c55e", 700: "#15803d" },
        warning: { 50: "#fffbeb", 500: "#f59e0b", 700: "#b45309" },
        danger: { 50: "#fef2f2", 500: "#ef4444", 700: "#b91c1c" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
