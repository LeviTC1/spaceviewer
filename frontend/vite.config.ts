import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite configuration that enables React fast refresh and sets a friendly dev port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
