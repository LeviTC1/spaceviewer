import type { AstroReferenceFrameId } from "./referenceFrames";
import type { AstroDistanceUnit, AstroVector3 } from "./units";

export type AstronomicalObjectType =
  | "star"
  | "planet"
  | "dwarf-planet"
  | "moon"
  | "small-body"
  | "spacecraft"
  | "galaxy"
  | "nebula"
  | "cluster"
  | "feature";

export interface AstronomicalSourceReference {
  registryId: string;
  sourceId?: string;
  retrievedAt?: string;
  confidence: "authoritative" | "derived" | "seed";
}

export interface AstronomicalNavigationBehavior {
  scaleDomain: "surface" | "planetary" | "solar" | "stellar" | "galactic" | "deep-space" | "cosmological";
  focusRadius?: number;
  rendererSurface: "earth" | "solar" | "skymap" | "imagery";
  route?: string;
}

export interface AstronomicalVisualRepresentation {
  strategy: "pbr-body" | "point" | "sprite" | "impostor" | "volume" | "surface-tile" | "annotation";
  assetIds?: string[];
  lodLevels: string[];
  scaleDisclosure?: string;
}

export interface AstronomicalObjectRecord {
  id: string;
  slug: string;
  name: string;
  type: AstronomicalObjectType;
  subtype?: string;
  parentId?: string;
  referenceFrame: AstroReferenceFrameId;
  epoch: string;
  position?: AstroVector3<AstroDistanceUnit, AstroReferenceFrameId>;
  radius?: { value: number; unit: AstroDistanceUnit };
  physical?: Record<string, number | string | boolean>;
  visual: AstronomicalVisualRepresentation;
  sources: AstronomicalSourceReference[];
  searchAliases: string[];
  navigation: AstronomicalNavigationBehavior;
}

export class SpatialObjectRegistry {
  private readonly records = new Map<string, AstronomicalObjectRecord>();

  register(record: AstronomicalObjectRecord) {
    if (this.records.has(record.id)) {
      throw new Error(`Astronomical object ${record.id} is already registered.`);
    }
    if (!record.sources.length) {
      throw new Error(`Astronomical object ${record.id} must identify at least one source record.`);
    }
    this.records.set(record.id, record);
    return record;
  }

  get(id: string) {
    return this.records.get(id) ?? null;
  }

  search(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return Array.from(this.records.values()).filter((record) =>
      [record.name, record.slug, record.type, record.subtype, ...record.searchAliases]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }

  values() {
    return Array.from(this.records.values());
  }
}

