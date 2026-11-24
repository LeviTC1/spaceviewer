export type RingedPlanetId = "saturn" | "uranus";

export interface SolarRingBand {
  id: string;
  label: string;
  innerRadiusKm: number;
  outerRadiusKm: number;
  /** Representative normal optical depth used only by the analytic light-transmission model. */
  opticalDepth: number;
}

export interface SolarRingSystem {
  id: string;
  planetId: RingedPlanetId;
  label: string;
  innerRadiusKm: number;
  outerRadiusKm: number;
  bands: SolarRingBand[];
  source: {
    label: string;
    sourceUrl: string;
    credit: string;
  };
  secondarySource?: {
    label: string;
    sourceUrl: string;
    credit: string;
  };
  accuracyNote: string;
}

const SATURN_RING_SYSTEM: SolarRingSystem = {
  id: "saturn-main-rings-nasa-v1",
  planetId: "saturn",
  label: "Saturn main rings through the F ring",
  innerRadiusKm: 66_900,
  outerRadiusKm: 140_270,
  bands: [
    { id: "d", label: "D ring", innerRadiusKm: 66_900, outerRadiusKm: 74_510, opticalDepth: 0.001 },
    { id: "c", label: "C ring", innerRadiusKm: 74_658, outerRadiusKm: 91_975, opticalDepth: 0.2 },
    { id: "b", label: "B ring", innerRadiusKm: 91_975, outerRadiusKm: 117_507, opticalDepth: 1.0 },
    { id: "a", label: "A ring", innerRadiusKm: 122_340, outerRadiusKm: 136_780, opticalDepth: 0.65 },
    { id: "f", label: "F ring", innerRadiusKm: 139_826, outerRadiusKm: 140_270, opticalDepth: 0.1 },
  ],
  source: {
    label: "NASA Saturnian Rings Fact Sheet",
    sourceUrl: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html",
    credit: "NASA Goddard Space Flight Center / NSSDCA",
  },
  secondarySource: {
    label: "NASA Cassini mission FAQ",
    sourceUrl: "https://science.nasa.gov/mission/cassini/faq/",
    credit: "NASA Science / Cassini mission",
  },
  accuracyNote:
    "The main D, C, B and A ring boundaries and representative optical depths come from the NASA fact sheet. The visible F-ring extent is bounded by NASA's Cassini FAQ. Fine ringlets, time-variable structure, vertical thickness and wavelength-dependent transmission are not modeled.",
};

const URANUS_RING_SYSTEM: SolarRingSystem = {
  id: "uranus-classical-rings-pds-v1",
  planetId: "uranus",
  label: "Uranus classical narrow-ring system",
  innerRadiusKm: 41_836.25,
  outerRadiusKm: 51_197,
  bands: [
    { id: "six", label: "6 ring", innerRadiusKm: 41_836.25, outerRadiusKm: 41_837.75, opticalDepth: 0.3 },
    { id: "five", label: "5 ring", innerRadiusKm: 42_233, outerRadiusKm: 42_235, opticalDepth: 0.5 },
    { id: "four", label: "4 ring", innerRadiusKm: 42_570, outerRadiusKm: 42_572, opticalDepth: 0.3 },
    { id: "alpha", label: "Alpha ring", innerRadiusKm: 44_713, outerRadiusKm: 44_723, opticalDepth: 0.4 },
    { id: "beta", label: "Beta ring", innerRadiusKm: 45_655.5, outerRadiusKm: 45_666.5, opticalDepth: 0.3 },
    { id: "eta", label: "Eta ring", innerRadiusKm: 47_175.2, outerRadiusKm: 47_176.8, opticalDepth: 0.4 },
    { id: "gamma", label: "Gamma ring", innerRadiusKm: 47_625, outerRadiusKm: 47_629, opticalDepth: 0.3 },
    { id: "delta", label: "Delta ring", innerRadiusKm: 48_296.5, outerRadiusKm: 48_303.5, opticalDepth: 0.5 },
    { id: "epsilon", label: "Epsilon ring", innerRadiusKm: 51_101, outerRadiusKm: 51_197, opticalDepth: 1.0 },
  ],
  source: {
    label: "NASA PDS Ring-Moon Systems Node: Uranus ring statistics",
    sourceUrl: "https://pds-rings.seti.org/uranus/uranus_rings_table.html",
    credit: "NASA Planetary Data System Ring-Moon Systems Node",
  },
  accuracyNote:
    "The nine classical narrow rings use PDS center radii, widths and representative optical depths. Diffuse Zeta material and the extremely faint Nu and Mu rings are omitted; narrow bands receive screen-space antialiasing but no false physical width.",
};

export const SOLAR_RING_SYSTEMS: Record<RingedPlanetId, SolarRingSystem> = {
  saturn: SATURN_RING_SYSTEM,
  uranus: URANUS_RING_SYSTEM,
};

export const SOLAR_RING_SHADOW_MODEL = {
  id: "finite-sun-ring-transmission-v1",
  label: "Finite-Sun analytic ring transmission",
  accuracyNote:
    "A spherical planet and infinitesimally thin equatorial ring plane are evaluated in the sourced body-fixed frame. Ring opacity is converted to slant-path transmission; finite solar angular radius softens shadow boundaries. Oblateness, multiple scattering and ring thickness are not modeled.",
};

export const getSolarRingSystem = (planetId: string): SolarRingSystem | null =>
  planetId === "saturn" || planetId === "uranus" ? SOLAR_RING_SYSTEMS[planetId] : null;

export interface RingVector3 {
  x: number;
  y: number;
  z: number;
}

export interface RingPlaneIntercept {
  rayDistanceBodyRadii: number;
  radiusBodyRadii: number;
  ringCoordinate: number;
  insideSystem: boolean;
}

const normalize = (vector: RingVector3): RingVector3 | null => {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 1e-12) return null;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
};

export const calculateRingPlaneIntercept = ({
  surfacePointBodyRadii,
  sunDirectionBody,
  ringSystem,
  planetRadiusKm,
}: {
  surfacePointBodyRadii: RingVector3;
  sunDirectionBody: RingVector3;
  ringSystem: SolarRingSystem;
  planetRadiusKm: number;
}): RingPlaneIntercept | null => {
  const direction = normalize(sunDirectionBody);
  if (!direction || !Number.isFinite(planetRadiusKm) || planetRadiusKm <= 0) return null;
  if (Math.abs(direction.y) <= 1e-10) return null;

  const rayDistanceBodyRadii = -surfacePointBodyRadii.y / direction.y;
  if (rayDistanceBodyRadii <= 0) return null;
  const x = surfacePointBodyRadii.x + direction.x * rayDistanceBodyRadii;
  const z = surfacePointBodyRadii.z + direction.z * rayDistanceBodyRadii;
  const radiusBodyRadii = Math.hypot(x, z);
  const innerRadiusBodyRadii = ringSystem.innerRadiusKm / planetRadiusKm;
  const outerRadiusBodyRadii = ringSystem.outerRadiusKm / planetRadiusKm;

  return {
    rayDistanceBodyRadii,
    radiusBodyRadii,
    ringCoordinate:
      (radiusBodyRadii - innerRadiusBodyRadii) /
      Math.max(outerRadiusBodyRadii - innerRadiusBodyRadii, 1e-12),
    insideSystem:
      radiusBodyRadii >= innerRadiusBodyRadii && radiusBodyRadii <= outerRadiusBodyRadii,
  };
};

/** Beer-Lambert transmission through a planar optical depth at a given solar elevation. */
export const calculateRingTransmission = (opticalDepth: number, solarElevationSin: number) => {
  if (!Number.isFinite(opticalDepth) || opticalDepth <= 0) return 1;
  const incidence = Math.max(Math.abs(solarElevationSin), 0.04);
  return Math.exp(-opticalDepth / incidence);
};
