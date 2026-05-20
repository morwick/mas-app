import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1C9600",
          primary: "#1C9600",
          light: "#E8F7E0",
          dark: "#145B00"
        },
        page: "#F5F5F0",
        card: "#FFFFFF",
        border: {
          DEFAULT: "rgba(0,0,0,0.15)",
          hover: "rgba(0,0,0,0.3)"
        },
        text: {
          DEFAULT: "#1A1A1A",
          muted: "#6B6B66",
          subtle: "#9A9A95"
        },
        status: {
          "standby-bg": "#F1EFE8",
          "standby-fg": "#5F5E5A",
          "bertugas-bg": "#E8F7E0",
          "bertugas-fg": "#145B00",
          "perbaikan-bg": "#FAEEDA",
          "perbaikan-fg": "#854F0B",
          "cancelled-bg": "#FCEBEB",
          "cancelled-fg": "#791F1F",
          "info-bg": "#E6F0FF",
          "info-fg": "#1E3A8A"
        },
        danger: {
          DEFAULT: "#E24B4A",
          dark: "#B33837"
        }
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif"
        ]
      },
      fontSize: {
        h1: ["22px", { lineHeight: "1.4", fontWeight: "500" }],
        h2: ["18px", { lineHeight: "1.4", fontWeight: "500" }],
        h3: ["16px", { lineHeight: "1.4", fontWeight: "500" }],
        body: ["14px", { lineHeight: "1.6" }],
        caption: ["11px", { lineHeight: "1.4" }]
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px"
      },
      boxShadow: {
        focus: "0 0 0 3px rgba(28, 150, 0, 0.2)"
      },
      maxWidth: {
        page: "1200px"
      }
    }
  },
  plugins: []
};

export default config;
