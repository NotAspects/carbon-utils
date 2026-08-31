import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        carbon: {
          dark: "#0c0e0f",
          darker: "#0a0c0d",
          card: "#111415",
          border: "#1c2023",
          "border-subtle": "#161a1c",
          text: "#e8eaed",
          "text-muted": "#5f6368",
          "text-subtle": "#9aa0a6",
          primary: "#e8eaed",
          "primary-dark": "#b0b3b8",
          accent: "#9aa0a6",
        },
        page: "#0c0e0f",
        card: "#111415",
        edge: "#1c2023",
        soft: "#181b1d",
        ink: "#e8eaed",
        slate: "#9aa0a6",
        fog: "#9aa0a6",
        mist: "#5f6368",
        violet: "#e8eaed",
        violetdark: "#c5c8cc",
        violetbg: "#181b1d",
        amber: "#f39c12",
        amberbg: "#1a1510",
      },
    },
  },
  plugins: [],
};
export default config;
