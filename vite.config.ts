import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Nexdigm LMS frontend.
// In local development the Vite dev server proxies /api to the ASP.NET Core API.
// On Lovable (or any static preview) the app automatically falls back to the
// built-in mock data layer, so it renders fully without the backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5164",
        changeOrigin: true
      }
    }
  }
});
