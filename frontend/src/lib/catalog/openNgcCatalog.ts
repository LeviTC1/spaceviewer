export const OPENNGC_CATALOG_MANIFEST_URL = "/catalogs/openngc/manifest.json";

export type OpenNgcFamily = "galaxy" | "nebula" | "cluster";

export interface OpenNgcCatalogObject {
  id: string;
  sourceName: string;
  name: string;
  family: OpenNgcFamily;
  typeCode: string;
  typeLabel: string;
  objectClass: string;
  raDeg: number;
  decDeg: number;
  constellation: string;
  constellationCode: string;
  majorAxisArcMin?: number;
  minorAxisArcMin?: number;
  positionAngleDeg?: number;
  apparentMagnitude?: number;
  apparentMagnitudeBand?: "V" | "B";
  magnitudeB?: number;
  magnitudeV?: number;
  surfaceBrightness?: number;
  hubbleType?: string;
  radialVelocityKmS?: number;
  redshift?: number;
  messier?: string;
  catalogIds: string[];
  aliases: string[];
  sourceCodes?: string;
  importance: number;
}

export interface OpenNgcCatalogChunkDefinition {
  id: string;
  label: string;
  url: string;
  raMinDeg: number;
  raMaxDeg: number;
  objectCount: number;
  familyCounts: Record<OpenNgcFamily, number>;
  byteLength: number;
  sha256: string;
}

export interface OpenNgcCatalogManifest {
  schemaVersion: 1;
  catalog: {
    id: string;
    version: string;
    releaseCommit: string;
    title: string;
    retrievedAt: string;
    repositoryUrl: string;
    releaseUrl: string;
    doi: string;
    creator: string;
    credit: string;
    sourceBoundary: string;
  };
  licence: {
    id: "CC-BY-SA-4.0";
    url: string;
    sourceLicencePath: string;
    adaptationNotice: string;
  };
  selection: {
    predicate: string;
    acceptedTypes: string[];
    sourceRecordCount: number;
    acceptedTypeCount: number;
    coordinateRejectedCount: number;
    thresholdRejectedCount: number;
    localGroupExcludedCount: number;
    objectCount: number;
    familyCounts: Record<OpenNgcFamily, number>;
    typeCounts: Record<string, number>;
    boundary: string;
  };
  coordinates: {
    sourceFrame: "J2000 equatorial RA/Dec";
    epoch: "J2000";
    sceneTransform: string;
    angularShellRadiusSceneUnits: number;
    placementBoundary: string;
  };
  parameters: { magnitudeRule: string; sourceBoundary: string };
  chunks: OpenNgcCatalogChunkDefinition[];
  build: {
    scriptVersion: string;
    sourceSha256: Record<string, string>;
    chunking: string;
    objectCount: number;
  };
}

export interface DecodedOpenNgcCatalogChunk {
  schemaVersion: 1;
  catalogId: string;
  chunkId: string;
  skyBounds: { frame: "J2000"; raMinDeg: number; raMaxDeg: number };
  objectCount: number;
  familyCounts: Record<OpenNgcFamily, number>;
  objects: OpenNgcCatalogObject[];
  licence: { id: "CC-BY-SA-4.0"; adaptation: true };
}

const FAMILIES = new Set<OpenNgcFamily>(["galaxy", "nebula", "cluster"]);
const sha256Hex = async (content: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

export const validateOpenNgcCatalogManifest = (value: unknown): OpenNgcCatalogManifest => {
  const manifest = value as OpenNgcCatalogManifest;
  if (
    manifest?.schemaVersion !== 1 || manifest.catalog?.id !== "openngc-deep-sky" ||
    manifest.licence?.id !== "CC-BY-SA-4.0" || !manifest.licence.adaptationNotice ||
    !Number.isInteger(manifest.selection?.objectCount) || manifest.selection.objectCount <= 0 ||
    !Array.isArray(manifest.chunks) || manifest.chunks.length !== 12 ||
    manifest.coordinates?.epoch !== "J2000" || !Number.isFinite(manifest.coordinates.angularShellRadiusSceneUnits)
  ) throw new Error("OpenNGC catalogue manifest has an unsupported schema.");
  if (
    manifest.chunks.reduce((sum, chunk) => sum + chunk.objectCount, 0) !== manifest.selection.objectCount ||
    Object.values(manifest.selection.familyCounts).reduce((sum, count) => sum + count, 0) !== manifest.selection.objectCount
  ) throw new Error("OpenNGC manifest totals are inconsistent.");
  for (const chunk of manifest.chunks) {
    if (
      !/^ra-\d{2}$/.test(chunk.id) || !chunk.url.startsWith("/catalogs/openngc/") ||
      !/^[a-f0-9]{64}$/.test(chunk.sha256) || !Number.isInteger(chunk.objectCount) || chunk.objectCount <= 0
    ) throw new Error(`OpenNGC catalogue chunk ${chunk.id} is malformed.`);
  }
  return manifest;
};

export const validateOpenNgcCatalogChunk = (
  value: unknown,
  definition: OpenNgcCatalogChunkDefinition,
  catalogId: string,
): DecodedOpenNgcCatalogChunk => {
  const chunk = value as DecodedOpenNgcCatalogChunk;
  if (
    chunk?.schemaVersion !== 1 || chunk.catalogId !== catalogId || chunk.chunkId !== definition.id ||
    chunk.skyBounds?.frame !== "J2000" || chunk.objectCount !== definition.objectCount ||
    chunk.licence?.id !== "CC-BY-SA-4.0" || chunk.licence.adaptation !== true ||
    !Array.isArray(chunk.objects) || chunk.objects.length !== definition.objectCount
  ) throw new Error(`OpenNGC catalogue chunk ${definition.id} does not match its manifest.`);
  const ids = new Set<string>();
  const familyCounts: Record<OpenNgcFamily, number> = { galaxy: 0, nebula: 0, cluster: 0 };
  for (const object of chunk.objects) {
    if (
      !object.id.startsWith("deep:") || ids.has(object.id) || !object.sourceName || !object.name ||
      !FAMILIES.has(object.family) || !Number.isFinite(object.raDeg) || !Number.isFinite(object.decDeg) ||
      object.raDeg < definition.raMinDeg || object.raDeg >= definition.raMaxDeg ||
      object.decDeg < -90 || object.decDeg > 90 || !Array.isArray(object.catalogIds) || !object.catalogIds.length ||
      !Array.isArray(object.aliases) || !Number.isFinite(object.importance)
    ) throw new Error(`OpenNGC catalogue chunk ${definition.id} contains an invalid object.`);
    ids.add(object.id);
    familyCounts[object.family] += 1;
  }
  for (const family of FAMILIES) {
    if (familyCounts[family] !== definition.familyCounts[family] || familyCounts[family] !== chunk.familyCounts[family]) {
      throw new Error(`OpenNGC catalogue chunk ${definition.id} has inconsistent ${family} totals.`);
    }
  }
  return chunk;
};

export const loadOpenNgcCatalogManifest = async () => {
  const response = await fetch(OPENNGC_CATALOG_MANIFEST_URL);
  if (!response.ok) throw new Error(`OpenNGC catalogue manifest request failed (${response.status}).`);
  return validateOpenNgcCatalogManifest(await response.json());
};

export const loadOpenNgcCatalogChunk = async (
  definition: OpenNgcCatalogChunkDefinition,
  catalogId: string,
) => {
  const response = await fetch(definition.url);
  if (!response.ok) throw new Error(`OpenNGC catalogue chunk ${definition.id} request failed (${response.status}).`);
  const content = await response.arrayBuffer();
  if (content.byteLength !== definition.byteLength || await sha256Hex(content) !== definition.sha256) {
    throw new Error(`OpenNGC catalogue chunk ${definition.id} failed integrity validation.`);
  }
  return validateOpenNgcCatalogChunk(JSON.parse(new TextDecoder().decode(content)), definition, catalogId);
};
