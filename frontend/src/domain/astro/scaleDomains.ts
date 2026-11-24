import type { AstroReferenceFrameId } from "./referenceFrames";

export type ScaleDomainId =
  | "surface"
  | "planetary"
  | "solar"
  | "stellar"
  | "galactic"
  | "deep-space"
  | "cosmological";

export type ScaleDomainAvailability = "implemented" | "bridged" | "foundation";

export interface ScaleDomainDefinition {
  id: ScaleDomainId;
  label: string;
  shortLabel: string;
  frame: AstroReferenceFrameId;
  availability: ScaleDomainAvailability;
  rendererStrategy: string;
  scientificInterpretation: string;
  transitionOverlap: ScaleDomainId[];
}

export const SCALE_DOMAINS: Record<ScaleDomainId, ScaleDomainDefinition> = {
  surface: {
    id: "surface",
    label: "Earth surface",
    shortLabel: "Surface",
    frame: "surface-local",
    availability: "bridged",
    rendererStrategy: "EarthViewer tiled globe and terrain renderer",
    scientificInterpretation: "Geodetic surface, terrain and Earth-orbit context",
    transitionOverlap: ["planetary"],
  },
  planetary: {
    id: "planetary",
    label: "Planetary system",
    shortLabel: "Planet",
    frame: "planetocentric",
    availability: "implemented",
    rendererStrategy: "Solar Explorer parent-relative scene",
    scientificInterpretation: "Scale-compressed planet and moon systems",
    transitionOverlap: ["surface", "solar"],
  },
  solar: {
    id: "solar",
    label: "Solar System",
    shortLabel: "Solar",
    frame: "heliocentric-ecliptic",
    availability: "implemented",
    rendererStrategy: "VSOP87/Keplerian Solar Explorer scene",
    scientificInterpretation: "Heliocentric positions with labelled visual scale compression",
    transitionOverlap: ["planetary", "stellar"],
  },
  stellar: {
    id: "stellar",
    label: "Stellar neighbourhood",
    shortLabel: "Stars",
    frame: "local-interstellar",
    availability: "implemented",
    rendererStrategy: "SkyMap point-cloud layer",
    scientificInterpretation: "Local star seed catalogue projected from light-year coordinates",
    transitionOverlap: ["solar", "galactic"],
  },
  galactic: {
    id: "galactic",
    label: "Milky Way",
    shortLabel: "Galaxy",
    frame: "galactic",
    availability: "implemented",
    rendererStrategy: "Deterministic GPU point-volume Milky Way schematic",
    scientificInterpretation: "Kpc-calibrated global structure with individual particles explicitly marked as schematic",
    transitionOverlap: ["stellar", "deep-space"],
  },
  "deep-space": {
    id: "deep-space",
    label: "Local Group and deep space",
    shortLabel: "Deep",
    frame: "local-group",
    availability: "implemented",
    rendererStrategy: "LVDB physical-direction point layer plus curated symbolic distant landmarks",
    scientificInterpretation: "Physical heliocentric supergalactic Local Group coordinates with explicit logarithmic scene radius; more distant landmarks remain staged",
    transitionOverlap: ["galactic", "cosmological"],
  },
  cosmological: {
    id: "cosmological",
    label: "Observable Universe",
    shortLabel: "Cosmos",
    frame: "cosmological-comoving",
    availability: "implemented",
    rendererStrategy: "DESI DR1 measured-galaxy redshift light cone with deterministic binary LOD",
    scientificInterpretation: "Measured ICRS/redshift survey positions transformed to a declared reference-cosmology comoving display, with explicit selection and uncertainty boundaries",
    transitionOverlap: ["deep-space"],
  },
};

export const SCALE_DOMAIN_ORDER: ScaleDomainId[] = [
  "surface",
  "planetary",
  "solar",
  "stellar",
  "galactic",
  "deep-space",
  "cosmological",
];

export class ScaleDomainManager {
  get(domainId: ScaleDomainId) {
    return SCALE_DOMAINS[domainId];
  }

  getJourneyTo(domainId: ScaleDomainId) {
    const targetIndex = SCALE_DOMAIN_ORDER.indexOf(domainId);
    return SCALE_DOMAIN_ORDER.slice(0, targetIndex + 1).map((id) => SCALE_DOMAINS[id]);
  }

  getTransition(from: ScaleDomainId, to: ScaleDomainId) {
    const fromIndex = SCALE_DOMAIN_ORDER.indexOf(from);
    const toIndex = SCALE_DOMAIN_ORDER.indexOf(to);
    return {
      from: SCALE_DOMAINS[from],
      to: SCALE_DOMAINS[to],
      direction: Math.sign(toIndex - fromIndex) as -1 | 0 | 1,
      adjacent: Math.abs(toIndex - fromIndex) === 1,
      representationCrossfadeRequired: from !== to,
    };
  }
}

export const scaleDomainManager = new ScaleDomainManager();
