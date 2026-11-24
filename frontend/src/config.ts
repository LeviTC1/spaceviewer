export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export const EARTH_VIEWER_URL =
  import.meta.env.VITE_EARTH_VIEWER_URL?.trim() || (import.meta.env.DEV ? "http://localhost:5175/" : "");

if (!import.meta.env.VITE_API_URL && import.meta.env.PROD) {
  console.warn("VITE_API_URL is not defined. Falling back to /api.");
}
