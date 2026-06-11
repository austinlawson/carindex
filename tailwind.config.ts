import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        phone: "0 28px 90px rgba(0, 0, 0, 0.55)"
      },
      keyframes: {
        "reel-pan": {
          "0%": { transform: "scale(1.05) translate3d(-1.8%, -1%, 0)" },
          "50%": { transform: "scale(1.12) translate3d(1.6%, 1.4%, 0)" },
          "100%": { transform: "scale(1.08) translate3d(-0.5%, 0.5%, 0)" }
        },
        "hero-float": {
          "0%": { transform: "translate3d(-1.2%, 0.8%, 0)" },
          "50%": { transform: "translate3d(1%, -0.8%, 0)" },
          "100%": { transform: "translate3d(-0.4%, 0.4%, 0)" }
        },
        "sheet-up": {
          "0%": { transform: "translateY(100%) scale(0.98)", opacity: "0.4" },
          "70%": { transform: "translateY(-6px) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "story-progress": {
          "0%": { transform: "scaleX(0)" },
          "100%": { transform: "scaleX(1)" }
        }
      },
      animation: {
        "reel-pan": "reel-pan 14s ease-in-out infinite alternate",
        "hero-float": "hero-float 9s ease-in-out infinite alternate",
        "sheet-up": "sheet-up 360ms cubic-bezier(0.2, 0.9, 0.2, 1)",
        "fade-in": "fade-in 160ms ease-out",
        "story-progress": "story-progress 2600ms linear"
      }
    }
  },
  plugins: []
};

export default config;
