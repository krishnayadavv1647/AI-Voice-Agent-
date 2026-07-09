import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: {
      // The full-screen error overlay is disruptive during local dev; errors still print to the
      // browser console and terminal. Set to true if you prefer the overlay.
      overlay: false
    }
  },
  // Pre-bundle the heavy, rarely-changing dependencies once so cold dev startup and first page
  // load are fast (Vite otherwise discovers and re-bundles them on demand mid-session).
  // Only real dependencies from package.json are listed here.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "lucide-react",
      "@vapi-ai/web"
    ]
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"]
        }
      }
    }
  }
});
