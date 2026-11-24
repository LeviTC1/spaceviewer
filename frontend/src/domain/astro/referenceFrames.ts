export type AstroReferenceFrameId =
  | "surface-local"
  | "earth-fixed"
  | "planetocentric"
  | "heliocentric-ecliptic"
  | "heliocentric-icrs"
  | "local-interstellar"
  | "galactic"
  | "local-group"
  | "cosmological-comoving";

export interface AstroReferenceFrameDefinition {
  id: AstroReferenceFrameId;
  label: string;
  parentId: AstroReferenceFrameId | null;
  origin: string;
  axes: string;
  interpretation: "physical" | "derived" | "visualization";
}

export const ASTRO_REFERENCE_FRAMES: Record<AstroReferenceFrameId, AstroReferenceFrameDefinition> = {
  "surface-local": {
    id: "surface-local",
    label: "Surface local",
    parentId: "earth-fixed",
    origin: "Selected geodetic surface focus",
    axes: "Local east, north and up",
    interpretation: "derived",
  },
  "earth-fixed": {
    id: "earth-fixed",
    label: "Earth fixed",
    parentId: "planetocentric",
    origin: "Earth centre of mass",
    axes: "Rotating terrestrial axes",
    interpretation: "physical",
  },
  planetocentric: {
    id: "planetocentric",
    label: "Planetary system",
    parentId: "heliocentric-ecliptic",
    origin: "Selected planet or moon system barycentric approximation",
    axes: "Parent-relative orbital plane",
    interpretation: "derived",
  },
  "heliocentric-ecliptic": {
    id: "heliocentric-ecliptic",
    label: "Heliocentric ecliptic",
    parentId: "local-interstellar",
    origin: "Sun",
    axes: "Mean ecliptic plane",
    interpretation: "physical",
  },
  "heliocentric-icrs": {
    id: "heliocentric-icrs",
    label: "Heliocentric ICRS",
    parentId: "local-interstellar",
    origin: "Sun",
    axes: "ICRS equatorial Cartesian axes at the catalogue reference epoch",
    interpretation: "derived",
  },
  "local-interstellar": {
    id: "local-interstellar",
    label: "Local stellar neighbourhood",
    parentId: "galactic",
    origin: "Solar neighbourhood catalogue origin",
    axes: "Catalogue-derived local cartesian axes",
    interpretation: "derived",
  },
  galactic: {
    id: "galactic",
    label: "Milky Way",
    parentId: "local-group",
    origin: "Galactic centre reference",
    axes: "Galactic longitude, latitude and radial distance",
    interpretation: "physical",
  },
  "local-group": {
    id: "local-group",
    label: "Local Group / deep space",
    parentId: "cosmological-comoving",
    origin: "Sun (heliocentric Local Volume Database coordinates)",
    axes: "Supergalactic Cartesian axes derived from J2000 ICRS positions",
    interpretation: "derived",
  },
  "cosmological-comoving": {
    id: "cosmological-comoving",
    label: "Observable Universe",
    parentId: null,
    origin: "Observer-centred cosmological visualization",
    axes: "Comoving visualization coordinates",
    interpretation: "visualization",
  },
};

export class ReferenceFrameManager {
  constructor(
    private readonly frames: Record<AstroReferenceFrameId, AstroReferenceFrameDefinition> = ASTRO_REFERENCE_FRAMES,
  ) {}

  get(frameId: AstroReferenceFrameId) {
    return this.frames[frameId];
  }

  getPathToRoot(frameId: AstroReferenceFrameId) {
    const path: AstroReferenceFrameDefinition[] = [];
    const visited = new Set<AstroReferenceFrameId>();
    let current: AstroReferenceFrameDefinition | undefined = this.frames[frameId];
    while (current) {
      if (visited.has(current.id)) {
        throw new Error(`Reference frame cycle detected at ${current.id}.`);
      }
      visited.add(current.id);
      path.push(current);
      current = current.parentId ? this.frames[current.parentId] : undefined;
    }
    return path;
  }

  getBreadcrumb(frameId: AstroReferenceFrameId) {
    return this.getPathToRoot(frameId).reverse();
  }

  getCommonAncestor(a: AstroReferenceFrameId, b: AstroReferenceFrameId) {
    const aIds = new Set(this.getPathToRoot(a).map((frame) => frame.id));
    return this.getPathToRoot(b).find((frame) => aIds.has(frame.id)) ?? null;
  }
}

export const referenceFrameManager = new ReferenceFrameManager();
