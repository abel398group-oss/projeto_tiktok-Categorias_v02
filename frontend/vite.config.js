import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Proxy: o browser pede ao Vite (/analytics/*); o Vite reencaminha para a API.
 * Evita CORS porque o fetch vai para o mesmo origin do dev server.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/analytics": { target: "http://127.0.0.1:3333", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:3333", changeOrigin: true }
    }
  }
});
