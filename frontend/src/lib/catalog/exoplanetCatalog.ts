export const EXOPLANET_CATALOG_MANIFEST_URL = "/catalogs/exoplanets/manifest.json";
export const EXOPLANET_GAIA_CROSSMATCH_METHOD =
  "nasa-exoplanet-archive-gaia-dr3-source-id-exact" as const;
export const EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC = 10;

export interface ExoplanetCatalogPlanet {
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

export interface ExoplanetGaiaDr3Crossmatch {
  sourceId: string;
  rendererObjectId: string;
  method: typeof EXOPLANET_GAIA_CROSSMATCH_METHOD;
  gaiaCatalogId: string;
  gaiaCatalogVersion: string;
  gaiaReferenceEpoch: "J2016.0";
  angularSeparationArcsec: number;
  gaiaInverseParallaxDistancePc: number;
  distanceDifferencePc: number;
}

export interface ExoplanetCatalogSystem {
  id: string;
  hostName: string;
  aliases: string[];
  raDeg: number;
  decDeg: number;
  distancePc: number;
  distanceErrorPlusPc?: number;
  distanceErrorMinusPc?: number;
  distanceLy: number;
  positionLy: { x: number; y: number; z: number };
  apparentMagnitudeV?: number;
  apparentMagnitudeK?: number;
  stellarTemperatureK?: number;
  stellarTemperatureErrorPlusK?: number;
  stellarTemperatureErrorMinusK?: number;
  spectralType?: string;
  gaiaDr3Crossmatch?: ExoplanetGaiaDr3Crossmatch;
  planets: ExoplanetCatalogPlanet[];
}

export interface ExoplanetCatalogChunkDefinition {
  id: string;
  label: string;
  url: string;
  raMinDeg: number;
  raMaxDeg: number;
  systemCount: number;
  planetCount: number;
  crossmatchedSystemCount: number;
  byteLength: number;
  sha256: string;
}

export interface ExoplanetCatalogManifest {
  schemaVersion: 2;
  catalog: {
    id: string;
    version: string;
    title: string;
    table: "pscomppars";
    retrievedAt: string;
    tapUrl: string;
    queryDocumentationUrl: string;
    columnDocumentationUrl: string;
    compositeTableDocumentationUrl: string;
    acknowledgmentUrl: string;
    credit: string;
    licenceStatus: string;
    usageBoundary: string;
  };
  selection: {
    predicate: string;
    maximumDistancePc: number;
    sourcePlanetCount: number;
    systemCount: number;
    planetCount: number;
    distanceRangePc: { minimum: number; maximum: number };
    boundary: string;
  };
  coordinates: {
    frame: "ICRS";
    origin: string;
    distanceUnit: "parsec";
    sceneTransform: string;
    placementBoundary: string;
  };
  parameters: { model: string; boundary: string };
  crossmatch: {
    method: ExoplanetGaiaDr3Crossmatch["method"];
    sourceAliasField: "gaia_dr3_id";
    gaiaCatalogId: string;
    gaiaCatalogVersion: string;
    gaiaSourceSha256: string;
    gaiaReferenceEpoch: "J2016.0";
    hostCount: number;
    hostsWithGaiaDr3Alias: number;
    hostsWithoutGaiaDr3Alias: number;
    matchedRendererHostCount: number;
    gaiaDr3AliasesOutsideRendererSubset: number;
    unmatchedRendererHostCount: number;
    maximumAngularSeparationArcsec: number;
    validationThresholdArcsec: number;
    boundary: string;
  };
  chunks: ExoplanetCatalogChunkDefinition[];
  build: { scriptVersion: string; sourceSha256: string; gaiaSourceSha256: string; chunking: string; sourcePlanetCount: number; systemCount: number; planetCount: number };
}

export interface DecodedExoplanetCatalogChunk {
  schemaVersion: 2;
  catalogId: string;
  chunkId: string;
  skyBounds: { frame: "ICRS"; raMinDeg: number; raMaxDeg: number };
  systemCount: number;
  planetCount: number;
  crossmatchedSystemCount: number;
  systems: ExoplanetCatalogSystem[];
}

const sha256Hex = async (content: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", content);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

const assertFinite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new Error(`Exoplanet catalogue ${label} is not finite.`);
};

export const validateExoplanetCatalogManifest = (value: unknown): ExoplanetCatalogManifest => {
  const manifest = value as ExoplanetCatalogManifest;
  if (
    manifest?.schemaVersion !== 2 || manifest.catalog?.table !== "pscomppars" ||
    !Number.isInteger(manifest.selection?.systemCount) || manifest.selection.systemCount <= 0 ||
    !Number.isInteger(manifest.selection?.planetCount) || manifest.selection.planetCount < manifest.selection.systemCount ||
    !Array.isArray(manifest.chunks) || !manifest.chunks.length
  ) throw new Error("Exoplanet catalogue manifest has an unsupported schema.");
  const chunkSystemCount = manifest.chunks.reduce((sum, chunk) => sum + chunk.systemCount, 0);
  const chunkPlanetCount = manifest.chunks.reduce((sum, chunk) => sum + chunk.planetCount, 0);
  const chunkCrossmatchCount = manifest.chunks.reduce((sum, chunk) => sum + chunk.crossmatchedSystemCount, 0);
  if (
    chunkSystemCount !== manifest.selection.systemCount ||
    chunkPlanetCount !== manifest.selection.planetCount ||
    chunkCrossmatchCount !== manifest.crossmatch?.matchedRendererHostCount
  ) {
    throw new Error("Exoplanet catalogue manifest chunk counts do not match the selection totals.");
  }
  if (
    manifest.crossmatch.method !== EXOPLANET_GAIA_CROSSMATCH_METHOD ||
    manifest.crossmatch.sourceAliasField !== "gaia_dr3_id" ||
    manifest.crossmatch.hostCount !== manifest.selection.systemCount ||
    manifest.crossmatch.hostsWithoutGaiaDr3Alias !==
      manifest.crossmatch.hostCount - manifest.crossmatch.hostsWithGaiaDr3Alias ||
    manifest.crossmatch.gaiaDr3AliasesOutsideRendererSubset !==
      manifest.crossmatch.hostsWithGaiaDr3Alias - manifest.crossmatch.matchedRendererHostCount ||
    manifest.crossmatch.unmatchedRendererHostCount !==
      manifest.crossmatch.hostCount - manifest.crossmatch.matchedRendererHostCount ||
    manifest.crossmatch.hostsWithGaiaDr3Alias < manifest.crossmatch.matchedRendererHostCount ||
    manifest.crossmatch.hostsWithGaiaDr3Alias > manifest.crossmatch.hostCount ||
    manifest.crossmatch.validationThresholdArcsec !== EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC ||
    manifest.crossmatch.maximumAngularSeparationArcsec > manifest.crossmatch.validationThresholdArcsec ||
    !/^[a-f0-9]{64}$/.test(manifest.crossmatch.gaiaSourceSha256)
  ) {
    throw new Error("Exoplanet catalogue manifest has an invalid Gaia DR3 cross-match contract.");
  }
  for (const chunk of manifest.chunks) {
    if (
      !/^ra-\d{2}$/.test(chunk.id) ||
      !chunk.url.startsWith("/catalogs/exoplanets/") ||
      !/^[a-f0-9]{64}$/.test(chunk.sha256) ||
      !Number.isInteger(chunk.crossmatchedSystemCount) ||
      chunk.crossmatchedSystemCount < 0 ||
      chunk.crossmatchedSystemCount > chunk.systemCount
    ) {
      throw new Error(`Exoplanet catalogue chunk ${chunk.id} is malformed.`);
    }
  }
  return manifest;
};

export const validateExoplanetCatalogChunk = (
  value: unknown,
  definition: ExoplanetCatalogChunkDefinition,
  catalogId: string,
): DecodedExoplanetCatalogChunk => {
  const chunk = value as DecodedExoplanetCatalogChunk;
  if (
    chunk?.schemaVersion !== 2 || chunk.catalogId !== catalogId || chunk.chunkId !== definition.id ||
    chunk.systemCount !== definition.systemCount || chunk.planetCount !== definition.planetCount ||
    chunk.crossmatchedSystemCount !== definition.crossmatchedSystemCount ||
    !Array.isArray(chunk.systems) || chunk.systems.length !== definition.systemCount
  ) throw new Error(`Exoplanet catalogue chunk ${definition.id} does not match its manifest.`);
  const ids = new Set<string>();
  let planetCount = 0;
  let crossmatchedSystemCount = 0;
  for (const system of chunk.systems) {
    if (!system.id.startsWith("exoplanet-system:") || ids.has(system.id) || !system.hostName || !Array.isArray(system.planets) || !system.planets.length) {
      throw new Error(`Exoplanet catalogue chunk ${definition.id} contains an invalid system.`);
    }
    ids.add(system.id);
    [system.raDeg, system.decDeg, system.distancePc, system.distanceLy, system.positionLy.x, system.positionLy.y, system.positionLy.z]
      .forEach((number, index) => assertFinite(number, `${system.hostName} field ${index}`));
    if (system.raDeg < definition.raMinDeg || system.raDeg >= definition.raMaxDeg || system.distancePc <= 0 || system.distancePc > 100) {
      throw new Error(`Exoplanet system ${system.hostName} is outside its declared selection or chunk.`);
    }
    const match = system.gaiaDr3Crossmatch;
    if (match) {
      [
        match.angularSeparationArcsec,
        match.gaiaInverseParallaxDistancePc,
        match.distanceDifferencePc,
      ].forEach((number, index) => assertFinite(number, `${system.hostName} Gaia cross-match field ${index}`));
      if (
        !/^\d+$/.test(match.sourceId) ||
        match.rendererObjectId !== `star:gaia-dr3:${match.sourceId}` ||
        match.method !== EXOPLANET_GAIA_CROSSMATCH_METHOD ||
        match.gaiaReferenceEpoch !== "J2016.0" ||
        match.angularSeparationArcsec < 0 ||
        match.angularSeparationArcsec > EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC ||
        match.gaiaInverseParallaxDistancePc <= 0 ||
        match.distanceDifferencePc < 0
      ) {
        throw new Error(`Exoplanet system ${system.hostName} has an invalid Gaia DR3 cross-match.`);
      }
      crossmatchedSystemCount += 1;
    }
    planetCount += system.planets.length;
  }
  if (planetCount !== definition.planetCount) throw new Error(`Exoplanet chunk ${definition.id} planet count is inconsistent.`);
  if (crossmatchedSystemCount !== definition.crossmatchedSystemCount) {
    throw new Error(`Exoplanet chunk ${definition.id} Gaia cross-match count is inconsistent.`);
  }
  return chunk;
};

export const loadExoplanetCatalogManifest = async () => {
  const response = await fetch(EXOPLANET_CATALOG_MANIFEST_URL);
  if (!response.ok) throw new Error(`Exoplanet catalogue manifest request failed (${response.status}).`);
  return validateExoplanetCatalogManifest(await response.json());
};

export const loadExoplanetCatalogChunk = async (
  definition: ExoplanetCatalogChunkDefinition,
  catalogId: string,
) => {
  const response = await fetch(definition.url);
  if (!response.ok) throw new Error(`Exoplanet catalogue chunk ${definition.id} request failed (${response.status}).`);
  const content = await response.arrayBuffer();
  if (content.byteLength !== definition.byteLength || await sha256Hex(content) !== definition.sha256) {
    throw new Error(`Exoplanet catalogue chunk ${definition.id} failed integrity validation.`);
  }
  return validateExoplanetCatalogChunk(JSON.parse(new TextDecoder().decode(content)), definition, catalogId);
};
