/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81"
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
