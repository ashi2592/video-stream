import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/upload":  "http://localhost:8000",
      "/status":  "http://localhost:8000",
      "/video":   "http://localhost:8000",
      "/stream":  "http://localhost:8000",
    }
  }
});
