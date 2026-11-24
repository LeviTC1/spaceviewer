#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import {
  EXOPLANET_GAIA_CROSSMATCH_METHOD,
  EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC,
  buildExoplanetHostIdentityIndex,
  buildGaiaAstrometryIndex,
  createExactGaiaRendererCrossmatch,
  parseGaiaDr3SourceId,
  stableExoplanetSystemId,
} from "./lib/stellar-crossmatch.mjs";

const SCRIPT_VERSION = "spaceviewer-nearby-exoplanet-builder-v2";
const PARSEC_TO_LIGHT_YEAR = 3.2615637771674333;
const CHUNK_WIDTH_DEG = 30;
const CHUNK_COUNT = 12;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(frontendRoot, "catalog-source/nasa-exoplanet-archive-nearby");
const receiptPath = resolve(sourceDirectory, "source-receipt.json");
const gaiaReceiptPath = resolve(frontendRoot, "catalog-source/gaia-dr3-nearby-100pc-g9.receipt.json");
const publicDirectory = resolve(frontendRoot, "public/catalogs/exoplanets");
const manifestPath = resolve(publicDirectory, "manifest.json");
const checkOnly = process.argv.includes("--check");
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const numeric = (value) => Number.isFinite(value) ? value : undefined;
const cleanString = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const degToRad = (value) => (value * Math.PI) / 180;

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
for (const definition of receipt.sourceFiles) {
  const content = await readFile(resolve(frontendRoot, definition.path));
  if (content.byteLength !== definition.bytes || sha256Hex(content) !== definition.sha256) {
    throw new Error(`Pinned exoplanet source does not match its receipt: ${definition.path}`);
  }
}
const sourceDefinition = receipt.sourceFiles.find((definition) => definition.path.endsWith(".json.gz"));
if (!sourceDefinition) throw new Error("Exoplanet source receipt has no compressed TAP snapshot.");
const rows = JSON.parse(gunzipSync(await readFile(resolve(frontendRoot, sourceDefinition.path))).toString("utf8"));
if (!Array.isArray(rows) || rows.length !== receipt.catalog.selection.planetCount) {
  throw new Error("Exoplanet source snapshot count does not match its receipt.");
}
const gaiaReceipt = JSON.parse(await readFile(gaiaReceiptPath, "utf8"));
const gaiaCompressed = await readFile(resolve(frontendRoot, gaiaReceipt.sourceFile.path));
if (
  gaiaCompressed.byteLength !== gaiaReceipt.sourceFile.compressedBytes ||
  sha256Hex(gaiaCompressed) !== gaiaReceipt.sourceFile.compressedSha256
) {
  throw new Error("Pinned Gaia source does not match its receipt for exoplanet cross-matching.");
}
const gaiaCsv = gunzipSync(gaiaCompressed);
if (
  gaiaCsv.byteLength !== gaiaReceipt.sourceFile.uncompressedBytes ||
  sha256Hex(gaiaCsv) !== gaiaReceipt.sourceFile.uncompressedSha256
) {
  throw new Error("Decoded Gaia source does not match its cross-match receipt.");
}
const gaiaAstrometryBySourceId = buildGaiaAstrometryIndex(gaiaCsv);
const exoplanetHostIdentityByGaiaSourceId = buildExoplanetHostIdentityIndex(rows);

const grouped = new Map();
for (const row of rows) {
  const hostName = cleanString(row.hostname);
  const planetName = cleanString(row.pl_name);
  if (!hostName || !planetName || !Number.isFinite(row.ra) || !Number.isFinite(row.dec) || !Number.isFinite(row.sy_dist)) {
    throw new Error(`Invalid exoplanet row ${planetName ?? "without name"}.`);
  }
  const group = grouped.get(hostName) ?? [];
  group.push(row);
  grouped.set(hostName, group);
}
if (grouped.size !== receipt.catalog.selection.hostCount) throw new Error("Exoplanet host count does not match its receipt.");

const systems = Array.from(grouped.entries()).map(([hostName, hostRows]) => {
  hostRows.sort((left, right) => left.pl_name.localeCompare(right.pl_name));
  const first = hostRows[0];
  for (const row of hostRows.slice(1)) {
    if (Math.abs(row.ra - first.ra) > 1e-5 || Math.abs(row.dec - first.dec) > 1e-5 || Math.abs(row.sy_dist - first.sy_dist) > 1e-4) {
      throw new Error(`Host coordinates are inconsistent across ${hostName}.`);
    }
  }
  const ra = degToRad(first.ra);
  const dec = degToRad(first.dec);
  const distanceLy = first.sy_dist * PARSEC_TO_LIGHT_YEAR;
  const gaiaDr3SourceId = parseGaiaDr3SourceId(first.gaia_dr3_id);
  const gaiaDr3Crossmatch = createExactGaiaRendererCrossmatch({
    sourceId: gaiaDr3SourceId,
    hostName,
    raDeg: first.ra,
    decDeg: first.dec,
    distancePc: first.sy_dist,
    gaiaRecord: gaiaDr3SourceId ? gaiaAstrometryBySourceId.get(gaiaDr3SourceId) : undefined,
    gaiaCatalog: gaiaReceipt.catalog,
  });
  const aliases = Array.from(new Set(hostRows.flatMap((row) => [
    cleanString(row.gaia_dr3_id), cleanString(row.gaia_dr2_id), cleanString(row.hip_name), cleanString(row.hd_name),
    cleanString(row.tic_id), cleanString(row.pl_name),
  ]).filter(Boolean)));
  const planets = hostRows.map((row) => ({
    name: row.pl_name,
    letter: cleanString(row.pl_letter),
    discoveryYear: numeric(row.disc_year),
    discoveryMethod: cleanString(row.discoverymethod),
    discoveryFacility: cleanString(row.disc_facility),
    discoveryTelescope: cleanString(row.disc_telescope),
    orbitalPeriodDays: numeric(row.pl_orbper),
    orbitalPeriodErrorPlusDays: numeric(row.pl_orbpererr1),
    orbitalPeriodErrorMinusDays: numeric(row.pl_orbpererr2),
    semiMajorAxisAu: numeric(row.pl_orbsmax),
    semiMajorAxisErrorPlusAu: numeric(row.pl_orbsmaxerr1),
    semiMajorAxisErrorMinusAu: numeric(row.pl_orbsmaxerr2),
    radiusEarth: numeric(row.pl_rade),
    radiusErrorPlusEarth: numeric(row.pl_radeerr1),
    radiusErrorMinusEarth: numeric(row.pl_radeerr2),
    massEarth: numeric(row.pl_bmasse),
    massErrorPlusEarth: numeric(row.pl_bmasseerr1),
    massErrorMinusEarth: numeric(row.pl_bmasseerr2),
    equilibriumTemperatureK: numeric(row.pl_eqt),
    equilibriumTemperatureErrorPlusK: numeric(row.pl_eqterr1),
    equilibriumTemperatureErrorMinusK: numeric(row.pl_eqterr2),
  }));
  return {
    id: stableExoplanetSystemId(hostName),
    hostName,
    aliases,
    raDeg: first.ra,
    decDeg: first.dec,
    distancePc: first.sy_dist,
    distanceErrorPlusPc: numeric(first.sy_disterr1),
    distanceErrorMinusPc: numeric(first.sy_disterr2),
    distanceLy,
    positionLy: {
      x: distanceLy * Math.cos(dec) * Math.cos(ra),
      y: distanceLy * Math.cos(dec) * Math.sin(ra),
      z: distanceLy * Math.sin(dec),
    },
    apparentMagnitudeV: numeric(first.sy_vmag),
    apparentMagnitudeK: numeric(first.sy_kmag),
    stellarTemperatureK: numeric(first.st_teff),
    stellarTemperatureErrorPlusK: numeric(first.st_tefferr1),
    stellarTemperatureErrorMinusK: numeric(first.st_tefferr2),
    spectralType: cleanString(first.st_spectype),
    gaiaDr3Crossmatch,
    planets,
  };
}).sort((left, right) => left.raDeg - right.raDeg || left.hostName.localeCompare(right.hostName));

const ids = new Set(systems.map((system) => system.id));
if (ids.size !== systems.length) throw new Error("Exoplanet system IDs are not unique.");
const planetCount = systems.reduce((sum, system) => sum + system.planets.length, 0);
if (planetCount !== rows.length) throw new Error("Exoplanet grouping changed the planet count.");
const crossmatchedSystems = systems.filter((system) => system.gaiaDr3Crossmatch);
const crossmatchSeparations = crossmatchedSystems.map((system) => system.gaiaDr3Crossmatch.angularSeparationArcsec);

const chunkOutputs = [];
for (let index = 0; index < CHUNK_COUNT; index += 1) {
  const raMinDeg = index * CHUNK_WIDTH_DEG;
  const raMaxDeg = raMinDeg + CHUNK_WIDTH_DEG;
  const chunkSystems = systems.filter((system) => system.raDeg >= raMinDeg && system.raDeg < raMaxDeg);
  const id = `ra-${String(index).padStart(2, "0")}`;
  const filename = `${id}.json`;
  const buffer = Buffer.from(stableJson({
    schemaVersion: 2,
    catalogId: receipt.catalog.id,
    chunkId: id,
    skyBounds: { frame: "ICRS", raMinDeg, raMaxDeg },
    systemCount: chunkSystems.length,
    planetCount: chunkSystems.reduce((sum, system) => sum + system.planets.length, 0),
    crossmatchedSystemCount: chunkSystems.filter((system) => system.gaiaDr3Crossmatch).length,
    systems: chunkSystems,
  }));
  chunkOutputs.push({
    path: resolve(publicDirectory, filename),
    buffer,
    metadata: {
      id,
      label: `ICRS RA ${raMinDeg}–${raMaxDeg}°`,
      url: `/catalogs/exoplanets/${filename}`,
      raMinDeg,
      raMaxDeg,
      systemCount: chunkSystems.length,
      planetCount: chunkSystems.reduce((sum, system) => sum + system.planets.length, 0),
      crossmatchedSystemCount: chunkSystems.filter((system) => system.gaiaDr3Crossmatch).length,
      byteLength: buffer.byteLength,
      sha256: sha256Hex(buffer),
    },
  });
}

const methodCounts = {};
for (const system of systems) for (const planet of system.planets) {
  const method = planet.discoveryMethod ?? "Unspecified";
  methodCounts[method] = (methodCounts[method] ?? 0) + 1;
}
const distances = systems.map((system) => system.distancePc);
const manifest = {
  schemaVersion: 2,
  catalog: {
    id: receipt.catalog.id,
    version: receipt.catalog.version,
    title: receipt.catalog.title,
    table: receipt.catalog.table,
    retrievedAt: receipt.catalog.retrievedAt,
    tapUrl: receipt.catalog.tapUrl,
    queryDocumentationUrl: receipt.catalog.queryDocumentationUrl,
    columnDocumentationUrl: receipt.catalog.columnDocumentationUrl,
    compositeTableDocumentationUrl: receipt.catalog.compositeTableDocumentationUrl,
    acknowledgmentUrl: receipt.catalog.acknowledgmentUrl,
    credit: receipt.catalog.provenance.credit,
    licenceStatus: receipt.catalog.provenance.licenceStatus,
    usageBoundary: receipt.catalog.provenance.usageBoundary,
  },
  selection: {
    predicate: receipt.catalog.selection.predicate,
    maximumDistancePc: receipt.catalog.selection.maximumDistancePc,
    sourcePlanetCount: rows.length,
    systemCount: systems.length,
    planetCount,
    distanceRangePc: { minimum: Math.min(...distances), maximum: Math.max(...distances) },
    boundary: "Confirmed planets in PSCompPars with a published host distance no greater than 100 pc and finite ICRS RA/Dec. This is not a completeness-limited occurrence-rate sample; archive contents and published parameter availability are strongly selection-biased.",
  },
  coordinates: {
    frame: "ICRS",
    origin: "Solar-system barycentric directional frame with archive host distance",
    distanceUnit: "parsec",
    sceneTransform: "ICRS spherical host coordinates converted to heliocentric Cartesian light-years, then rendered with the shared 0.8 scene-units/light-year stellar projection",
    placementBoundary: "All planets in one system share the host-star catalogue position. Planetary orbits are many orders of magnitude below this map scale and are not separated or animated here.",
  },
  parameters: {
    model: "PSCompPars composite parameters",
    boundary: "PSCompPars values may combine parameters from different published references and are not guaranteed to form one self-consistent physical solution. Missing values remain missing.",
  },
  crossmatch: {
    method: EXOPLANET_GAIA_CROSSMATCH_METHOD,
    sourceAliasField: "gaia_dr3_id",
    gaiaCatalogId: gaiaReceipt.catalog.id,
    gaiaCatalogVersion: gaiaReceipt.catalog.version,
    gaiaSourceSha256: gaiaReceipt.sourceFile.uncompressedSha256,
    gaiaReferenceEpoch: gaiaReceipt.catalog.epoch.value,
    hostCount: systems.length,
    hostsWithGaiaDr3Alias: exoplanetHostIdentityByGaiaSourceId.size,
    hostsWithoutGaiaDr3Alias: systems.length - exoplanetHostIdentityByGaiaSourceId.size,
    matchedRendererHostCount: crossmatchedSystems.length,
    gaiaDr3AliasesOutsideRendererSubset:
      exoplanetHostIdentityByGaiaSourceId.size - crossmatchedSystems.length,
    unmatchedRendererHostCount: systems.length - crossmatchedSystems.length,
    maximumAngularSeparationArcsec: Math.max(...crossmatchSeparations),
    validationThresholdArcsec: EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC,
    boundary: "An exact NASA Exoplanet Archive Gaia DR3 source identifier is linked only when that source is present in SpaceViewer's receipted 100 pc / G <= 9 Gaia renderer subset. The measured catalogue positions remain separate because the archive composite distance and Gaia inverse-parallax distance can differ.",
  },
  statistics: {
    discoveryMethodCounts: Object.fromEntries(Object.entries(methodCounts).sort(([left], [right]) => left.localeCompare(right))),
    systemsWithStellarTemperature: systems.filter((system) => Number.isFinite(system.stellarTemperatureK)).length,
    systemsWithSpectralType: systems.filter((system) => system.spectralType).length,
    planetsWithOrbitalPeriod: systems.flatMap((system) => system.planets).filter((planet) => Number.isFinite(planet.orbitalPeriodDays)).length,
    planetsWithRadius: systems.flatMap((system) => system.planets).filter((planet) => Number.isFinite(planet.radiusEarth)).length,
    planetsWithMass: systems.flatMap((system) => system.planets).filter((planet) => Number.isFinite(planet.massEarth)).length,
  },
  chunks: chunkOutputs.map((chunk) => chunk.metadata),
  build: {
    scriptVersion: SCRIPT_VERSION,
    sourceSha256: sourceDefinition.sha256,
    gaiaSourceSha256: gaiaReceipt.sourceFile.uncompressedSha256,
    chunking: `${CHUNK_COUNT} independent ICRS right-ascension sectors of ${CHUNK_WIDTH_DEG} degrees`,
    sourcePlanetCount: rows.length,
    systemCount: systems.length,
    planetCount,
  },
};
const manifestBuffer = Buffer.from(stableJson(manifest));
const outputs = [[manifestPath, manifestBuffer], ...chunkOutputs.map((chunk) => [chunk.path, chunk.buffer])];

if (checkOnly) {
  for (const [path, expected] of outputs) {
    const actual = await readFile(path).catch(() => null);
    if (!actual?.equals(expected)) throw new Error(`Nearby exoplanet generated asset is stale: ${path}`);
  }
  console.log(`Nearby exoplanet catalogue check passed: ${planetCount.toLocaleString()} planets in ${systems.length.toLocaleString()} systems, ${CHUNK_COUNT} chunks`);
} else {
  await mkdir(publicDirectory, { recursive: true });
  await Promise.all(outputs.map(([path, content]) => writeFile(path, content)));
  console.log(`Nearby exoplanet catalogue built: ${planetCount.toLocaleString()} planets in ${systems.length.toLocaleString()} systems, ${CHUNK_COUNT} chunks`);
}
