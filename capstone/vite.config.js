import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Project E-Noise — admin dashboard build config.
export default defineConfig(({ command, mode }) => {
  // A production build must know where the API is. Without this check the
  // app would silently call http://localhost:5000 (apiClient.js fallback)
  // and show an empty dashboard. Vercel: Project Settings -> Environment
  // Variables -> VITE_API_BASE_URL.
  if (command === "build") {
    const { VITE_API_BASE_URL } = loadEnv(mode, process.cwd(), "VITE_");
    if (!VITE_API_BASE_URL || !VITE_API_BASE_URL.trim()) {
      throw new Error("VITE_API_BASE_URL is not set. Set it to the API address (e.g. https://enoise-api.onrender.com) before building.");
    }
  }

  return {
    plugins: [react()],
    server: { host: "127.0.0.1" },
    preview: { host: "127.0.0.1" }
  };
});
