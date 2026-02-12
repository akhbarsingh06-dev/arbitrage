import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d12",
        panel: "#121622",
        border: "rgba(255,255,255,0.08)",
        muted: "#a7afc2",
        accent: "#6ee7ff",
        danger: "#ff6b6b",
      },
    },
  },
  plugins: [],
};

export default config;

