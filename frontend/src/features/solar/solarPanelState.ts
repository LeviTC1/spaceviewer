export type SolarPanelKey = "features" | "events" | "mission" | "scale" | "timeline" | "performance";
export type SolarPanelVisibility = Record<SolarPanelKey, boolean>;

export const DEFAULT_DESKTOP_PANEL_VISIBILITY: SolarPanelVisibility = {
  features: true,
  events: false,
  mission: false,
  scale: false,
  timeline: false,
  performance: false,
};

export const DEFAULT_MOBILE_PANEL_VISIBILITY: SolarPanelVisibility = {
  features: false,
  events: false,
  mission: false,
  scale: false,
  timeline: false,
  performance: false,
};

export const CLEAN_SOLAR_PANEL_VISIBILITY: SolarPanelVisibility = {
  features: false,
  events: false,
  mission: false,
  scale: false,
  timeline: false,
  performance: false,
};

export const ALL_SOLAR_PANEL_VISIBILITY: SolarPanelVisibility = {
  features: true,
  events: true,
  mission: true,
  scale: true,
  timeline: true,
  performance: true,
};

export const SOLAR_PANEL_CONTROLS: Array<{ key: SolarPanelKey; label: string; shortLabel: string }> = [
  { key: "features", label: "Tools", shortLabel: "Tools" },
  { key: "events", label: "Events", shortLabel: "Events" },
  { key: "mission", label: "Mission", shortLabel: "Mission" },
  { key: "scale", label: "Scale", shortLabel: "Scale" },
  { key: "timeline", label: "Time", shortLabel: "Time" },
  { key: "performance", label: "Performance", shortLabel: "Perf" },
];

export const normalizeSolarPanelVisibility = (
  value: Partial<SolarPanelVisibility> | null,
  mobile: boolean,
): SolarPanelVisibility => {
  const fallback = mobile ? DEFAULT_MOBILE_PANEL_VISIBILITY : DEFAULT_DESKTOP_PANEL_VISIBILITY;
  return {
    features: mobile ? false : typeof value?.features === "boolean" ? value.features : fallback.features,
    events: mobile ? false : typeof value?.events === "boolean" ? value.events : fallback.events,
    mission: typeof value?.mission === "boolean" ? value.mission : fallback.mission,
    scale: mobile ? false : typeof value?.scale === "boolean" ? value.scale : fallback.scale,
    timeline: typeof value?.timeline === "boolean" ? value.timeline : fallback.timeline,
    performance: mobile ? false : typeof value?.performance === "boolean" ? value.performance : fallback.performance,
  };
};

export const getActiveSolarPanelCount = (visibility: SolarPanelVisibility) =>
  SOLAR_PANEL_CONTROLS.filter((item) => visibility[item.key]).length;

export const solarPanelVisibilityMatches = (left: SolarPanelVisibility, right: SolarPanelVisibility) =>
  SOLAR_PANEL_CONTROLS.every((item) => left[item.key] === right[item.key]);

export const getSolarPanelDockStateLabel = (visibility: SolarPanelVisibility, mobile: boolean) => {
  const activePanelCount = getActiveSolarPanelCount(visibility);
  if (activePanelCount === 0) return "Clean map";
  if (activePanelCount === SOLAR_PANEL_CONTROLS.length) return "All visible";
  if (solarPanelVisibilityMatches(visibility, normalizeSolarPanelVisibility(null, mobile))) return "Default";
  return "Custom";
};
