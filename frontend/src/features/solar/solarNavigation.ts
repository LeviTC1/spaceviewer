export type SolarNavigationMode = "overview" | "planetary" | "ecliptic";

export const SOLAR_NAVIGATION_LABELS: Record<SolarNavigationMode, string> = {
  overview: "Overview",
  planetary: "Planetary system",
  ecliptic: "Top-down ecliptic",
};
