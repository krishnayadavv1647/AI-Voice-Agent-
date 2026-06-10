/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#b8d8ff",
          500: "#3267ff",
          600: "#254fe6",
          700: "#223fba"
        },
        ink: "#172033"
      },
      boxShadow: {
        soft: "0 12px 32px rgba(23, 32, 51, 0.08)"
      }
    }
  },
  plugins: []
};
