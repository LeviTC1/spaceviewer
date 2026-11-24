import { MOONS } from "./moonData";
import { PLANETS, SOLAR_SCALE_MODES, type PlanetId, type SolarScaleMode } from "./solarData";
import { isSmallBodyId, type SmallBodyId } from "./smallBodies/smallBodyData";
import type { SolarNavigationMode } from "./solarNavigation";

export interface SolarLaunchContext {
  dateKey?: string;
  scaleMode?: SolarScaleMode;
}

export type SolarRouteUpdateMode = "push" | "replace";

export type SolarLaunchTarget =
  | ({ kind: "overview"; navigationMode?: SolarNavigationMode } & SolarLaunchContext)
  | ({ kind: "sun"; navigationMode?: SolarNavigationMode } & SolarLaunchContext)
  | ({ kind: "planet"; planetId: PlanetId; navigationMode?: SolarNavigationMode } & SolarLaunchContext)
  | ({ kind: "moon"; moonId: string; navigationMode?: SolarNavigationMode } & SolarLaunchContext)
  | ({ kind: "small-body"; smallBodyId: SmallBodyId; navigationMode?: SolarNavigationMode } & SolarLaunchContext)
  | ({ kind: "belt"; navigationMode?: SolarNavigationMode } & SolarLaunchContext);

export interface SolarRouteSnapshot {
  selectedPlanetId: PlanetId | null;
  selectedMoonId: string | null;
  selectedSmallBodyId: SmallBodyId | null;
  sunSelected: boolean;
  asteroidBeltSelected: boolean;
  navigationMode: SolarNavigationMode;
  scaleMode: SolarScaleMode;
  dateKey: string;
}

export const getSolarLaunchTargetFromSnapshot = (snapshot: SolarRouteSnapshot): SolarLaunchTarget => {
  const context: SolarLaunchContext & { navigationMode: SolarNavigationMode } = {
    navigationMode: snapshot.navigationMode,
    scaleMode: snapshot.scaleMode,
    dateKey: snapshot.dateKey,
  };

  if (snapshot.selectedMoonId) {
    return { kind: "moon", moonId: snapshot.selectedMoonId, ...context };
  }
  if (snapshot.selectedPlanetId) {
    return { kind: "planet", planetId: snapshot.selectedPlanetId, ...context };
  }
  if (snapshot.selectedSmallBodyId) {
    return { kind: "small-body", smallBodyId: snapshot.selectedSmallBodyId, ...context };
  }
  if (snapshot.sunSelected) {
    return { kind: "sun", ...context };
  }
  if (snapshot.asteroidBeltSelected) {
    return { kind: "belt", ...context };
  }
  return { kind: "overview", ...context };
};

const isSolarNavigationMode = (value: string | null): value is SolarNavigationMode =>
  value === "overview" || value === "planetary" || value === "ecliptic";

const isSolarScaleMode = (value: string | null): value is SolarScaleMode =>
  value !== null && SOLAR_SCALE_MODES.some((mode) => mode === value);

export const getSolarTargetPath = (target: SolarLaunchTarget) => {
  const search = new URLSearchParams();
  if (target.kind === "overview") search.set("object", "overview");
  if (target.kind === "planet") search.set("object", `planet:${target.planetId}`);
  if (target.kind === "moon") search.set("object", `moon:${target.moonId}`);
  if (target.kind === "small-body") search.set("object", `small-body:${target.smallBodyId}`);
  if (target.kind === "sun") search.set("object", "sun");
  if (target.kind === "belt") search.set("object", "belt");
  if (target.navigationMode) search.set("mode", target.navigationMode);
  if (target.scaleMode) search.set("scale", target.scaleMode);
  if (target.dateKey) search.set("date", target.dateKey);
  return `/solar?${search.toString()}`;
};

export const readSolarTargetFromSearch = (searchValue: string): SolarLaunchTarget | null => {
  const search = new URLSearchParams(searchValue);
  const object = search.get("object");
  if (!object) return null;
  const mode = search.get("mode");
  const navigationMode = isSolarNavigationMode(mode) ? mode : undefined;
  const scale = search.get("scale");
  const scaleMode = isSolarScaleMode(scale) ? scale : undefined;
  const date = search.get("date");
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const context = { navigationMode, scaleMode, dateKey };

  if (object === "overview") return { kind: "overview", ...context };
  if (object === "sun") return { kind: "sun", ...context };
  if (object === "belt") return { kind: "belt", ...context };
  if (object.startsWith("planet:")) {
    const planetId = object.replace("planet:", "");
    const planet = PLANETS.find((candidate) => candidate.id === planetId);
    return planet ? { kind: "planet", planetId: planet.id, ...context } : null;
  }
  if (object.startsWith("moon:")) {
    const moonId = object.replace("moon:", "");
    return MOONS.some((candidate) => candidate.id === moonId)
      ? { kind: "moon", moonId, ...context }
      : null;
  }
  if (object.startsWith("small-body:")) {
    const smallBodyId = object.replace("small-body:", "");
    return isSmallBodyId(smallBodyId) ? { kind: "small-body", smallBodyId, ...context } : null;
  }
  return null;
};
