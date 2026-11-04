import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Project E-Noise — admin dashboard build config.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" }
});
