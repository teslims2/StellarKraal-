/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brown: "#4A2C0A",
        gold: "#D4A017",
        cream: "#FDF6EC",
      },
    },
  },
  plugins: [],
};
