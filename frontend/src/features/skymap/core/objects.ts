import type { SkyEpoch, SkyPosition } from "./coordinates";

export type SkyObjectId = string;

export type SkyObjectKind =
  | "star"
  | "planet"
  | "moon"
  | "asteroid"
  | "galaxy"
  | "nebula"
  | "star-cluster"
  | "imagery-target"
  | "spacecraft"
  | "annotation";

export interface SkyObjectProvenance {
  source: string;
  catalog?: string;
  sourceId?: string;
  retrievedAt?: string;
  confidence?: "seed" | "catalog" | "derived";
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
}

export interface PlanetScientificMetadata {
  radiusKm?: number;
  massKg?: number;
  semiMajorAxisAU?: number;
  orbitalPeriodDays?: number;
  inclinationDeg?: number;
  eccentricity?: number;
  axialTiltDeg?: number;
  rotationPeriodHours?: number;
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

export type DeepSkyObjectClass =
  | "spiral-galaxy"
  | "barred-spiral-galaxy"
  | "lenticular-galaxy"
  | "irregular-galaxy"
  | "emission-nebula"
  | "planetary-nebula"
  | "supernova-remnant"
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
  apparentMagnitude?: number;
  constellation?: string;
  catalogIds?: string[];
  facts?: string[];
  imagery?: DeepSkyImageryReference[];
  discoveryBlurb?: string;
  observationContext?: string;
  relatedObjectIds?: SkyObjectId[];
  mapPlacementNote?: string;
  symbolRotation?: [number, number, number];
}

export interface ImageryTargetMetadata {
  mission?: string;
  instrument?: string;
  imageId?: string;
}

export interface AnnotationMetadata {
  body: string;
  severity?: "info" | "warning";
}

export type StarSkyObject = SkyObjectBase<"star", StarScientificMetadata> & {
  kind: "star";
  scientific: StarScientificMetadata;
};

export type PlanetSkyObject = SkyObjectBase<"planet", PlanetScientificMetadata>;
export type MoonSkyObject = SkyObjectBase<"moon", MoonScientificMetadata>;
export type AsteroidSkyObject = SkyObjectBase<"asteroid", SmallBodyScientificMetadata>;
export type GalaxySkyObject = SkyObjectBase<"galaxy", DeepSkyScientificMetadata>;
export type NebulaSkyObject = SkyObjectBase<"nebula", DeepSkyScientificMetadata>;
export type StarClusterSkyObject = SkyObjectBase<"star-cluster", DeepSkyScientificMetadata>;
export type ImageryTargetSkyObject = SkyObjectBase<"imagery-target", ImageryTargetMetadata>;
export type SpacecraftSkyObject = SkyObjectBase<"spacecraft", { mission?: string; status?: string }>;
export type AnnotationSkyObject = SkyObjectBase<"annotation", AnnotationMetadata>;

export type SkyObject =
  | StarSkyObject
  | PlanetSkyObject
  | MoonSkyObject
  | AsteroidSkyObject
  | GalaxySkyObject
  | NebulaSkyObject
  | StarClusterSkyObject
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

export const getSkyObjectImportanceScore = (object: SkyObject | null | undefined) =>
  Math.max(0, Math.min(100, object?.importance?.score ?? object?.visual?.labelPriority ?? 0));
