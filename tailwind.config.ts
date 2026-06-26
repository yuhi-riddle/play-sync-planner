import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#23262b",
        paper: "#f7f0e4",
        cream: "#fffaf0",
        moss: "#5f7d65",
        pine: "#344f43",
        clay: "#df7d69",
        honey: "#d9aa4f",
        skywash: "#d9e8e7",
        mist: "#eff3ee"
      },
      boxShadow: {
        soft: "0 16px 36px rgba(62, 51, 39, 0.09)",
        lift: "0 22px 55px rgba(62, 51, 39, 0.13)"
      }
    }
  },
  plugins: []
};

export default config;
