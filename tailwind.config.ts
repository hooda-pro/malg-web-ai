import type { Config } from "tailwindcss";

/**
 * mlag AI design tokens.
 * Every colour resolves to a CSS variable declared in app/globals.css so light
 * and dark share one single source of truth (no `dark:` variant soup).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          inset: "var(--surface-inset)",
        },
        canvas: "var(--canvas)",
        hair: {
          DEFAULT: "var(--hairline)",
          2: "var(--hairline-2)",
          3: "var(--hairline-3)",
        },
        ink: {
          DEFAULT: "var(--ink)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          ink: "var(--accent-ink)",
          soft: "var(--accent-soft)",
          line: "var(--accent-line)",
        },
        live: "var(--live)",
        warn: "var(--warn)",
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },
        glass: "var(--glass)",
      },
      fontFamily: {
        sans: ["var(--font-latin)"],
        arabic: ["var(--font-arabic)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        xs: "8px",
        sm: "10px",
        DEFAULT: "12px",
        md: "14px",
        lg: "18px",
        xl: "24px",
        "2xl": "28px",
        "3xl": "34px",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
        3: "var(--shadow-3)",
        edge: "var(--highlight)",
        accent: "0 6px 20px -8px var(--accent-line)",
      },
      transitionTimingFunction: {
        soft: "var(--ease-soft)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        1: "var(--dur-1)",
        2: "var(--dur-2)",
        3: "var(--dur-3)",
      },
      zIndex: {
        nav: "var(--z-nav)",
        sticky: "var(--z-sticky)",
        overlay: "var(--z-overlay)",
        sheet: "45",
        modal: "var(--z-modal)",
        toast: "var(--z-toast)",
      },
      screens: {
        xs: "420px",
      },
    },
  },
  plugins: [],
};
export default config;
