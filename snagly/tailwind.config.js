/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Funnel palette extracted from the logo
        funnel: {
          50: "#e8f3ff",
          100: "#cfe6ff",
          200: "#9ccaff",
          300: "#6ab0ff", // top blue
          400: "#43a1ff",
          500: "#2a8fff", // primary blue
          600: "#1f78e0",
          700: "#1861ba",
          800: "#134d92",
          900: "#0d3769",
        },
        aqua: {
          400: "#2ed3e6", // cyan layer
          500: "#1fbfd4",
        },
        mint: {
          400: "#16c784", // green layer
          600: "#0fa66c",
        },
        forest: {
          800: "#0a3d2e", // bottom dark green
        },
        brand: {
          primary: "#2a8fff",
          secondary: "#16c784",
          accent: "#2ed3e6",
        },
      },
    },
  },
  plugins: [],
}

