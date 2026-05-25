/** @type {import('tailwindcss').Config} */
export default {
  content: ["./public/index.html", "./public/src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // CSS-Var-getrieben → Klassen flippen mit data-theme="dark" und unterstützen /opacity-Modifier.
        cream: {
          50:  "rgb(var(--c-cream-50)  / <alpha-value>)",
          100: "rgb(var(--c-cream-100) / <alpha-value>)",
          200: "rgb(var(--c-cream-200) / <alpha-value>)",
          300: "rgb(var(--c-cream-300) / <alpha-value>)",
          400: "rgb(var(--c-cream-400) / <alpha-value>)",
        },
        ink: {
          900: "rgb(var(--c-ink-900) / <alpha-value>)",
          700: "rgb(var(--c-ink-700) / <alpha-value>)",
          500: "rgb(var(--c-ink-500) / <alpha-value>)",
          300: "rgb(var(--c-ink-300) / <alpha-value>)",
        },
        terracotta: "rgb(var(--c-terracotta) / <alpha-value>)",
        honey:      "rgb(var(--c-honey)      / <alpha-value>)",
        cobalt:     "rgb(var(--c-cobalt)     / <alpha-value>)",
        sage:       "rgb(var(--c-sage)       / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
    },
  },
};
