/** @type {import('tailwindcss').Config} */
export default {
  content: ["./public/index.html", "./public/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        cream: { 50: "#F7F2E7", 100: "#F1ECDE", 200: "#E8E1CE", 300: "#DCD3BB", 400: "#C8BD9F" },
        ink: { 900: "#26221C", 700: "#46403A", 500: "#736C63", 300: "#A8A199" },
        terracotta: "#C26A4C", honey: "#D5A55B", cobalt: "#4D6A8B", sage: "#8A9A78",
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
};
