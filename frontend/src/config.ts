export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

if (!import.meta.env.VITE_API_URL) {
  console.warn("VITE_API_URL is not defined. Falling back to /api.");
}
