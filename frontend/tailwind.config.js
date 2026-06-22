/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7ffe0",
          100: "#edffb0",
          200: "#dfff78",
          300: "#d9ff5a",
          400: "#c8ff2e",
          500: "#aaff3e",
          600: "#7dff4a",
          700: "#5edb31",
          800: "#3e9e20",
          900: "#1e5a0e"
        },
        ink: "#0a0a0a",
        canvas: "#fafafa",
        surface: "#ffffff",
        hairline: "#ececec"
      },
      fontFamily: {
        sans: ['"App Body Inter"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"SFMono-Regular"', "Consolas", '"Liberation Mono"', "Menlo", "monospace"]
      },
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.625rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(10,10,10,.04), 0 1px 3px rgba(10,10,10,.06)",
        pop: "0 8px 24px rgba(10,10,10,.08)"
      },
      borderRadius: {
        xl: "0.625rem",
        "2xl": "0.875rem"
      }
    }
  },
  plugins: []
};
