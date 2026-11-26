import type { SkyEpoch, SkyPosition } from "./coordinates";

export type SkyObjectId = string;

export type SkyObjectKind =
  | "star"
  | "planet"
  | "moon"
  | "exoplanet-system"
  | "asteroid"
  | "galaxy"
  | "nebula"
  | "star-cluster"
  | "galactic-feature"
  | "cosmological-feature"
  | "celestial-overlay"
  | "imagery-target"
  | "spacecraft"
  | "annotation";

export interface SkyObjectProvenance {
  source: string;
  catalog?: string;
  sourceId?: string;
  retrievedAt?: string;
  confidence?: "seed" | "catalog" | "derived";
  url?: string;
}

export interface SkyObjectVisualMetadata {
  color?: string;
  pointSize?: number;
  brightness?: number;
  labelPriority?: number;
}

export interface SkyObjectSearchMetadata {
  aliases?: string[];
  tags?: string[];
  description?: string;
  keywords?: string[];
}

export type SkyObjectImportanceTier = "landmark" | "notable" | "context" | "reference";

export interface SkyObjectImportanceMetadata {
  score: number;
  tier: SkyObjectImportanceTier;
  reasons: string[];
}

export interface SkyObjectRelation {
  type: "orbits" | "hosts" | "part-of" | "annotates" | "targets";
  targetId: SkyObjectId;
  label?: string;
}

export type SkyObjectTimeBehavior = "static" | "time-aware" | "time-sensitive";

export interface SkyObjectTimeMetadata {
  behavior: SkyObjectTimeBehavior;
  model?: string;
  note?: string;
}

export interface SkyObjectBase<K extends SkyObjectKind, ScientificMetadata> {
  id: SkyObjectId;
  kind: K;
  name: string;
  position: SkyPosition;
  epoch?: SkyEpoch;
  provenance: SkyObjectProvenance[];
  visual?: SkyObjectVisualMetadata;
  search?: SkyObjectSearchMetadata;
  scientific?: ScientificMetadata;
  relations?: SkyObjectRelation[];
  time?: SkyObjectTimeMetadata;
  importance?: SkyObjectImportanceMetadata;
}

export interface StarScientificMetadata {
  spectralType?: string;
  luminositySolar?: number;
  temperatureK?: number;
  distanceLy?: number;
  apparentMagnitude?: number;
  absoluteMagnitude?: number;
  colorIndexBpRp?: number;
  referenceEpochJulianYear?: number;
  renderEpochJulianYear?: number;
  raDeg?: number;
  raErrorMas?: number;
  decDeg?: number;
  decErrorMas?: number;
  parallaxMas?: number;
  parallaxErrorMas?: number;
  pmRaMasYr?: number;
  pmRaErrorMasYr?: number;
  pmDecMasYr?: number;
  pmDecErrorMasYr?: number;
  radialVelocityKmS?: number;
  radialVelocityErrorKmS?: number;
  radialVelocityApplied?: boolean;
  propagatedAngularUncertaintyMas?: number;
  propagatedAngularUncertaintySemiMajorMas?: number;
  propagatedAngularUncertaintySemiMinorMas?: number;
  propagatedAngularUncertaintyPositionAngleDeg?: number;
  propagatedPositionUncertaintySemiMajorLy?: number;
  propagatedPositionUncertaintySemiIntermediateLy?: number;
  propagatedPositionUncertaintySemiMinorLy?: number;
  propagatedPositionUncertaintyRadialLy?: number;
  propagatedPositionUncertaintyTransverseRmsLy?: number;
  propagatedCovarianceModel?: "gaia-six-parameter-jacobian";
  propagatedCovarianceRadialVelocityTreatment?:
    | "published-independent-radial-velocity"
    | "conditional-zero-radial-velocity";
  propagationModel?: "uniform-rectilinear-space-motion";
  propagationValidityStartYear?: number;
  propagationValidityEndYear?: number;
  ruwe?: number;
  exoplanetSystemId?: SkyObjectId;
  exoplanetHostCrossmatchMethod?: "nasa-exoplanet-archive-gaia-dr3-source-id-exact";
}

export interface PlanetScientificMetadata {
  radiusKm?: number;
  massKg?: number;
  semiMajorAxisAU?: number;
  orbitalPeriodDays?: number;
  inclinationDeg?: number;
  eccentricity?: number;
  poleRightAscensionDeg?: number;
  poleDeclinationDeg?: number;
  poleAngleToJ2000EclipticNorthDeg?: number;
  primeMeridianDeg?: number;
  rotationPeriodHours?: number;
  rotationSense?: "prograde" | "retrograde";
  rotationModel?: string;
  rotationSystem?: string;
  moonCount?: number;
  ringSystem?: boolean;
  facts?: string[];
  approximation?: string;
}

export interface MoonScientificMetadata {
  parentPlanetId?: SkyObjectId;
  parentPlanetName?: string;
  moonClass?: "major" | "minor";
  radiusKm?: number;
  orbitalDistanceKm?: number;
  orbitalPeriodDays?: number;
  inclinationDeg?: number;
  orbitDirection?: 1 | -1;
  facts?: string[];
  approximation?: string;
}

export interface SmallBodyScientificMetadata {
  diameterKm?: number;
  orbitClass?: string;
}

export interface ExoplanetParameter {
  name: string;
  letter?: string;
  discoveryYear?: number;
  discoveryMethod?: string;
  discoveryFacility?: string;
  discoveryTelescope?: string;
  orbitalPeriodDays?: number;
  orbitalPeriodErrorPlusDays?: number;
  orbitalPeriodErrorMinusDays?: number;
  semiMajorAxisAu?: number;
  semiMajorAxisErrorPlusAu?: number;
  semiMajorAxisErrorMinusAu?: number;
  radiusEarth?: number;
  radiusErrorPlusEarth?: number;
  radiusErrorMinusEarth?: number;
  massEarth?: number;
  massErrorPlusEarth?: number;
  massErrorMinusEarth?: number;
  equilibriumTemperatureK?: number;
  equilibriumTemperatureErrorPlusK?: number;
  equilibriumTemperatureErrorMinusK?: number;
}

export interface ExoplanetSystemScientificMetadata {
  hostName: string;
  planetCount: number;
  planets: ExoplanetParameter[];
  raDeg: number;
  decDeg: number;
  distancePc: number;
  distanceLy: number;
  distanceErrorPlusPc?: number;
  distanceErrorMinusPc?: number;
  apparentMagnitudeV?: number;
  apparentMagnitudeK?: number;
  stellarTemperatureK?: number;
  stellarTemperatureErrorPlusK?: number;
  stellarTemperatureErrorMinusK?: number;
  spectralType?: string;
  /** Derived from stellar luminosity (Kasting et al. 1993 flux limits); not a measurement. */
  stellarLuminositySolar?: number;
  stellarLuminositySource?: string;
  habitableZone?: { innerAu: number; outerAu: number; method: string };
  sourceRelease: string;
  selectionBoundary: string;
  parameterBoundary: string;
  mapPlacementNote: string;
  manifestUrl: string;
  gaiaDr3Crossmatch?: {
    sourceId: string;
    rendererObjectId: SkyObjectId;
    method: "nasa-exoplanet-archive-gaia-dr3-source-id-exact";
    gaiaCatalogId: string;
    gaiaCatalogVersion: string;
    gaiaReferenceEpoch: "J2016.0";
    angularSeparationArcsec: number;
    gaiaInverseParallaxDistancePc: number;
    distanceDifferencePc: number;
  };
}

export type DeepSkyObjectClass =
  | "galaxy"
  | "spiral-galaxy"
  | "barred-spiral-galaxy"
  | "elliptical-galaxy"
  | "lenticular-galaxy"
  | "irregular-galaxy"
  | "galaxy-pair"
  | "galaxy-triplet"
  | "galaxy-group"
  | "dwarf-galaxy"
  | "dwarf-spheroidal-galaxy"
  | "dwarf-irregular-galaxy"
  | "nebula"
  | "emission-nebula"
  | "reflection-nebula"
  | "dark-nebula"
  | "hii-region"
  | "planetary-nebula"
  | "supernova-remnant"
  | "cluster-nebula"
  | "open-cluster"
  | "globular-cluster";

export interface DeepSkyImageryReference {
  label: string;
  source: string;
  targetId?: string;
  previewUrl?: string;
  fullResUrl?: string;
  credit?: string;
  alt?: string;
}

export interface DeepSkyScientificMetadata {
  objectClass?: DeepSkyObjectClass;
  distanceLy?: number;
  redshift?: number;
  angularSizeArcMin?: number;
  minorAngularSizeArcMin?: number;
  positionAngleDeg?: number;
  apparentMagnitude?: number;
  apparentMagnitudeBand?: "V" | "B";
  magnitudeB?: number;
  magnitudeV?: number;
  surfaceBrightness?: number;
  hubbleType?: string;
  constellation?: string;
  catalogIds?: string[];
  facts?: string[];
  imagery?: DeepSkyImageryReference[];
  discoveryBlurb?: string;
  observationContext?: string;
  relatedObjectIds?: SkyObjectId[];
  mapPlacementNote?: string;
  symbolRotation?: [number, number, number];
  raDeg?: number;
  decDeg?: number;
  distanceKpc?: number;
  distanceErrorMinusKpc?: number;
  distanceErrorPlusKpc?: number;
  distanceReference?: string;
  distanceMeasurementMethod?: string;
  absoluteMagnitudeV?: number;
  stellarMassSolar?: number;
  radialVelocityKmS?: number;
  radialVelocityErrorMinusKmS?: number;
  radialVelocityErrorPlusKmS?: number;
  properMotionRaMasYr?: number;
  properMotionDecMasYr?: number;
  supergalacticKpc?: { x: number; y: number; z: number };
  localGroupMembership?: string;
  hostName?: string;
  sourceRelease?: string;
  coordinateConvention?: string;
  manifestUrl?: string;
  selectionBoundary?: string;
  parameterBoundary?: string;
  licenceBoundary?: string;
}

export interface GalacticStructureScientificMetadata {
  featureClass: "galaxy-model" | "galactic-center" | "solar-location";
  galactocentricRadiusKpc?: number;
  modelRadiusKpc?: number;
  armCount?: number;
  pitchAngleDeg?: number;
  tracerCount?: number;
  fittedSegmentCount?: number;
  lowSignalTracerCount?: number;
  selectionBoundary?: string;
  uncertaintyModel?: string;
  manifestUrl?: string;
  licenceBoundary?: string;
  facts?: string[];
  modelStatus: "scientific-schematic" | "catalog-derived";
  mapPlacementNote: string;
}

export interface CosmologicalStructureScientificMetadata {
  featureClass: "observable-universe-model" | "observer-origin" | "redshift-survey-lightcone";
  coordinateConvention: "normalized-comoving-volume" | "observer-centred-redshift-space-comoving-cartesian";
  cosmology: string;
  tracerCount?: number;
  redshiftRange?: { minimum: number; maximum: number };
  skyFootprint?: string;
  selectionBoundary?: string;
  uncertaintyBoundary?: string;
  manifestUrl?: string;
  licenceBoundary?: string;
  facts?: string[];
  modelStatus: "scientific-schematic" | "catalog-derived";
  mapPlacementNote: string;
}

export interface CelestialOverlayScientificMetadata {
  featureClass: "iau-constellation-boundaries";
  referenceEpoch: "J2000";
  constellationCount: number;
  regionPathCount: number;
  sourceVertexCount: number;
  uniqueBoundarySegmentCount: number;
  facts?: string[];
  modelStatus: "catalog-derived";
  mapPlacementNote: string;
}

export interface ImageryTargetMetadata {
  mission?: string;
  instrument?: string;
  imageId?: string;
}

export interface SpacecraftScientificMetadata {
  mission?: string;
  status?: string;
  distanceFromSunAu?: number;
  velocityRelativeToSunKmS?: number;
  ephemerisEpochIso?: string;
  trajectoryModel?: string;
}

export interface AnnotationMetadata {
  body: string;
  severity?: "info" | "warning";
  targetName?: string;
  createdAt?: string;
  timeKey?: string;
}

export type StarSkyObject = SkyObjectBase<"star", StarScientificMetadata> & {
  kind: "star";
  scientific: StarScientificMetadata;
};

export type PlanetSkyObject = SkyObjectBase<"planet", PlanetScientificMetadata>;
export type MoonSkyObject = SkyObjectBase<"moon", MoonScientificMetadata>;
export type AsteroidSkyObject = SkyObjectBase<"asteroid", SmallBodyScientificMetadata>;
export type ExoplanetSystemSkyObject = SkyObjectBase<"exoplanet-system", ExoplanetSystemScientificMetadata> & {
  kind: "exoplanet-system";
  scientific: ExoplanetSystemScientificMetadata;
};
export type GalaxySkyObject = SkyObjectBase<"galaxy", DeepSkyScientificMetadata>;
export type NebulaSkyObject = SkyObjectBase<"nebula", DeepSkyScientificMetadata>;
export type StarClusterSkyObject = SkyObjectBase<"star-cluster", DeepSkyScientificMetadata>;
export type GalacticFeatureSkyObject = SkyObjectBase<"galactic-feature", GalacticStructureScientificMetadata> & {
  kind: "galactic-feature";
  scientific: GalacticStructureScientificMetadata;
};
export type CosmologicalFeatureSkyObject = SkyObjectBase<"cosmological-feature", CosmologicalStructureScientificMetadata> & {
  kind: "cosmological-feature";
  scientific: CosmologicalStructureScientificMetadata;
};
export type CelestialOverlaySkyObject = SkyObjectBase<"celestial-overlay", CelestialOverlayScientificMetadata> & {
  kind: "celestial-overlay";
  scientific: CelestialOverlayScientificMetadata;
};
export type ImageryTargetSkyObject = SkyObjectBase<"imagery-target", ImageryTargetMetadata>;
export type SpacecraftSkyObject = SkyObjectBase<"spacecraft", SpacecraftScientificMetadata>;
export type AnnotationSkyObject = SkyObjectBase<"annotation", AnnotationMetadata>;

export type SkyObject =
  | StarSkyObject
  | PlanetSkyObject
  | MoonSkyObject
  | AsteroidSkyObject
  | ExoplanetSystemSkyObject
  | GalaxySkyObject
  | NebulaSkyObject
  | StarClusterSkyObject
  | GalacticFeatureSkyObject
  | CosmologicalFeatureSkyObject
  | CelestialOverlaySkyObject
  | ImageryTargetSkyObject
  | SpacecraftSkyObject
  | AnnotationSkyObject;

export const isStarSkyObject = (object: SkyObject | null | undefined): object is StarSkyObject =>
  object?.kind === "star";

export const isPlanetSkyObject = (object: SkyObject | null | undefined): object is PlanetSkyObject =>
  object?.kind === "planet";

export const isMoonSkyObject = (object: SkyObject | null | undefined): object is MoonSkyObject =>
  object?.kind === "moon";

export const isGalaxySkyObject = (object: SkyObject | null | undefined): object is GalaxySkyObject =>
  object?.kind === "galaxy";

export const isNebulaSkyObject = (object: SkyObject | null | undefined): object is NebulaSkyObject =>
  object?.kind === "nebula";

export const isStarClusterSkyObject = (
  object: SkyObject | null | undefined,
): object is StarClusterSkyObject => object?.kind === "star-cluster";

export const isDeepSkyObject = (
  object: SkyObject | null | undefined,
): object is GalaxySkyObject | NebulaSkyObject | StarClusterSkyObject =>
  isGalaxySkyObject(object) || isNebulaSkyObject(object) || isStarClusterSkyObject(object);

export const isGalacticFeatureSkyObject = (
  object: SkyObject | null | undefined,
): object is GalacticFeatureSkyObject => object?.kind === "galactic-feature";

export const isCosmologicalFeatureSkyObject = (
  object: SkyObject | null | undefined,
): object is CosmologicalFeatureSkyObject => object?.kind === "cosmological-feature";

export const isCelestialOverlaySkyObject = (
  object: SkyObject | null | undefined,
): object is CelestialOverlaySkyObject => object?.kind === "celestial-overlay";

export const isAnnotationSkyObject = (
  object: SkyObject | null | undefined,
): object is AnnotationSkyObject => object?.kind === "annotation";

export const isExoplanetSystemSkyObject = (
  object: SkyObject | null | undefined,
): object is ExoplanetSystemSkyObject => object?.kind === "exoplanet-system";

export const getSkyObjectImportanceScore = (object: SkyObject | null | undefined) =>
  Math.max(0, Math.min(100, object?.importance?.score ?? object?.visual?.labelPriority ?? 0));
