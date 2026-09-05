import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        arabic: ["var(--font-arabic)", "Tahoma", "sans-serif"],
      },
      keyframes: {
        blink: {
          "0%, 49%": { opacity: "1" },
          "50%, 100%": { opacity: "0" },
        },
        scan: {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "0 100%" },
        },
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGreen: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0,255,157,0.35)" },
          "50%": { boxShadow: "0 0 0 6px rgba(0,255,157,0)" },
        },
      },
      animation: {
        blink: "blink 1s step-start infinite",
        fadeIn: "fadeIn 0.2s ease-out",
        pulseGreen: "pulseGreen 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
