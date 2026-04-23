import type { SkyLayerData } from "./layers";
import type { SkyObject, SkyObjectId } from "./objects";
import { getSkyObjectImportanceScore } from "./objects";

export type SkyMapObjectFamilyFilter =
  | "all"
  | "stars"
  | "solar"
  | "galaxies"
  | "nebulae"
  | "clusters";

export type SkyMapDistanceFilter = "all" | "local" | "milky-way" | "extragalactic";

export type SkyMapSourceFilter = "all" | "local-stars" | "solar-bridge" | "messier-ngc";

export interface SkyMapFilterState {
  family: SkyMapObjectFamilyFilter;
  distance: SkyMapDistanceFilter;
  source: SkyMapSourceFilter;
  landmarksOnly: boolean;
}

export const createDefaultSkyMapFilters = (): SkyMapFilterState => ({
  family: "all",
  distance: "all",
  source: "all",
  landmarksOnly: false,
});

export const hasActiveSkyMapFilters = (filters: SkyMapFilterState) =>
  filters.family !== "all" ||
  filters.distance !== "all" ||
  filters.source !== "all" ||
  filters.landmarksOnly;

const objectMatchesFamily = (object: SkyObject, family: SkyMapObjectFamilyFilter) => {
  switch (family) {
    case "all":
      return true;
    case "stars":
      return object.kind === "star";
    case "solar":
      return object.id.startsWith("solar:");
    case "galaxies":
      return object.kind === "galaxy";
    case "nebulae":
      return object.kind === "nebula";
    case "clusters":
      return object.kind === "star-cluster";
  }
};

const getObjectDistanceLy = (object: SkyObject) => {
  if (object.kind === "star") return object.scientific.distanceLy ?? 0;
  if (object.kind === "galaxy" || object.kind === "nebula" || object.kind === "star-cluster") {
    return object.scientific?.distanceLy ?? 0;
  }
  return 0;
};

const objectMatchesDistance = (object: SkyObject, distance: SkyMapDistanceFilter) => {
  if (distance === "all") return true;
  const distanceLy = getObjectDistanceLy(object);
  if (distance === "local") return distanceLy <= 1_000;
  if (distance === "milky-way") return distanceLy > 1_000 && distanceLy <= 100_000;
  return distanceLy > 100_000;
};

const objectMatchesSource = (object: SkyObject, source: SkyMapSourceFilter) => {
  if (source === "all") return true;
  const sourceText = object.provenance
    .map((entry) => `${entry.source} ${entry.catalog ?? ""} ${entry.sourceId ?? ""}`)
    .join(" ")
    .toLowerCase();
  if (source === "local-stars") return sourceText.includes("nearby star");
  if (source === "solar-bridge") return sourceText.includes("solar bridge") || sourceText.includes("solar explorer");
  return sourceText.includes("messier") || sourceText.includes("ngc");
};

const objectMatchesImportance = (object: SkyObject, landmarksOnly: boolean) =>
  !landmarksOnly || getSkyObjectImportanceScore(object) >= 78;

export const objectMatchesSkyMapFilters = (object: SkyObject, filters: SkyMapFilterState) =>
  objectMatchesFamily(object, filters.family) &&
  objectMatchesDistance(object, filters.distance) &&
  objectMatchesSource(object, filters.source) &&
  objectMatchesImportance(object, filters.landmarksOnly);

export const applySkyMapFilters = (
  layerData: SkyLayerData[],
  filters: SkyMapFilterState,
  alwaysIncludeObjectIds: Iterable<SkyObjectId> = [],
): SkyLayerData[] => {
  if (!hasActiveSkyMapFilters(filters)) return layerData;
  const alwaysInclude = new Set(alwaysIncludeObjectIds);

  return layerData.map((data) => {
    const objects = data.objects.filter(
      (object) => alwaysInclude.has(object.id) || objectMatchesSkyMapFilters(object, filters),
    );
    const objectIds = new Set(objects.map((object) => object.id));
    const chunks = data.chunks?.map((chunk) => {
      const chunkObjectIds = chunk.objectIds.filter((objectId) => objectIds.has(objectId));
      return {
        ...chunk,
        objectIds: chunkObjectIds,
        objectCount: chunkObjectIds.length,
      };
    });

    return {
      ...data,
      objects,
      chunks,
      metrics: data.metrics
        ? {
            ...data.metrics,
            totalObjects: objects.length,
            searchableObjects: objects.length,
          }
        : data.metrics,
    };
  });
};
