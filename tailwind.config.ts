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
        live: {
          DEFAULT: "var(--live)",
          soft: "var(--live-soft)",
        },
        warn: {
          DEFAULT: "var(--warn)",
          soft: "var(--warn-soft)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
        },
        glass: "var(--glass)",

        // ——— ألوان لوحة الأدمن / صفحة API / الشحن (تصميم طرفية داكن منفصل عمدًا
        // عن تصميم الشات الزجاجي، عشان الشاشات دي شاشات "تحكم" مش محادثة) ———
        bg: "#050706",
        panel: "#0a0d0c",
        panel2: "#0f1412",
        panel3: "#141c19",
        line: "#1d2b26",
        line2: "#26382f",
        green: "#00ff9d",
        cyan: "#4fd8ff",
        amber: "#ffcc66",
        rose: "#ff5f6d",
        purple: "#b48cff",
        txt: "#e7f3ee",
        txt2: "#8aa39a",
        txt3: "#526059",
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
      keyframes: {
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        pulseGreen: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0,255,157,0.35)" },
          "50%": { boxShadow: "0 0 0 6px rgba(0,255,157,0)" },
        },
      },
      animation: {
        blink: "blink 1s step-start infinite",
        fadeIn: "fadeIn 0.2s ease-out",
        slideUp: "slideUp 0.3s ease-out",
        float: "float 3.5s ease-in-out infinite",
        pulseGreen: "pulseGreen 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
