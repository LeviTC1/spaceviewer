#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// VSOP87A: heliocentric rectangular coordinates referred to the ecliptic and equinox J2000 (the explorer's
// world frame). File names keep the historical "vsop87c" spelling.
import vsop87c from "vsop87/dist/vsop87a.js";

const BUILDER_VERSION = "spaceviewer-vsop87c-ephemeris-builder-v1";
const FORMAT = "spaceviewer-vsop87c-float64-v1";
const MAGIC = "SVEP";
const SCHEMA_VERSION = 1;
const HEADER_BYTES = 64;
const ENDIAN_MARKER = 0x01020304;
const POSITION_ASSET_KIND = 1;
const ORBIT_ASSET_KIND = 2;
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JULIAN_DATE = 2_440_587.5;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const receiptPath = resolve(frontendRoot, "ephemeris-source/vsop87c-2025-2050.receipt.json");
const outputDirectory = resolve(frontendRoot, "public/ephemerides/vsop87c");
const checkOnly = process.argv.includes("--check");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const integrity = (content) => `sha256-${createHash("sha256").update(content).digest("base64")}`;
const utcDateToJulianDate = (date) => date.getTime() / DAY_MS + UNIX_EPOCH_JULIAN_DATE;

const writeHeader = ({ view, kind, planetCount, sampleCount, startJulianDate, stepDays, year }) => {
  Array.from(MAGIC).forEach((character, index) => view.setUint8(index, character.charCodeAt(0)));
  view.setUint16(4, SCHEMA_VERSION, true);
  view.setUint16(6, HEADER_BYTES, true);
  view.setUint8(8, kind);
  view.setUint8(9, planetCount);
  view.setUint32(12, sampleCount, true);
  view.setFloat64(16, startJulianDate, true);
  view.setFloat64(24, stepDays, true);
  view.setUint32(32, ENDIAN_MARKER, true);
  view.setInt32(36, year, true);
  view.setUint32(40, planetCount * 3, true);
};

const encodePositionYear = (year, planetOrder) => {
  const yearStartJulianDate = utcDateToJulianDate(new Date(Date.UTC(year, 0, 1)));
  const nextYearJulianDate = utcDateToJulianDate(new Date(Date.UTC(year + 1, 0, 1)));
  const startJulianDay = Math.floor(yearStartJulianDate);
  const endJulianDay = Math.ceil(nextYearJulianDate);
  const sampleCount = endJulianDay - startJulianDay + 1;
  const byteLength = HEADER_BYTES + sampleCount * planetOrder.length * 3 * Float64Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  writeHeader({
    view,
    kind: POSITION_ASSET_KIND,
    planetCount: planetOrder.length,
    sampleCount,
    startJulianDate: startJulianDay,
    stepDays: 1,
    year,
  });

  let byteOffset = HEADER_BYTES;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const result = vsop87c(startJulianDay + sampleIndex);
    for (const planetId of planetOrder) {
      const vector = result[planetId];
      for (const coordinate of [vector.x, vector.y, vector.z]) {
        view.setFloat64(byteOffset, coordinate, true);
        byteOffset += Float64Array.BYTES_PER_ELEMENT;
      }
    }
  }
  return {
    content: Buffer.from(buffer),
    startJulianDate: startJulianDay,
    endJulianDate: endJulianDay,
    sampleCount,
  };
};

const encodeRepresentativeOrbits = (receipt, planetOrder) => {
  const sampleCount = receipt.sampling.orbitSamplesPerPlanet;
  const referenceJulianDate = receipt.sampling.orbitReferenceJulianDate;
  const byteLength = HEADER_BYTES + sampleCount * planetOrder.length * 3 * Float64Array.BYTES_PER_ELEMENT;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  writeHeader({
    view,
    kind: ORBIT_ASSET_KIND,
    planetCount: planetOrder.length,
    sampleCount,
    startJulianDate: referenceJulianDate,
    stepDays: 0,
    year: 0,
  });

  const periodByPlanet = new Map(receipt.planets.map((planet) => [planet.id, planet.orbitalPeriodDays]));
  let byteOffset = HEADER_BYTES;
  for (const planetId of planetOrder) {
    const periodDays = periodByPlanet.get(planetId);
    if (!Number.isFinite(periodDays) || periodDays <= 0) {
      throw new Error(`Missing orbital period for ${planetId}.`);
    }
    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      const julianDate = referenceJulianDate - periodDays / 2 + (periodDays * sampleIndex) / sampleCount;
      const vector = vsop87c(julianDate)[planetId];
      for (const coordinate of [vector.x, vector.y, vector.z]) {
        view.setFloat64(byteOffset, coordinate, true);
        byteOffset += Float64Array.BYTES_PER_ELEMENT;
      }
    }
  }
  return { content: Buffer.from(buffer), sampleCount, referenceJulianDate };
};

const buildFiles = async () => {
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const packageManifestPath = resolve(frontendRoot, "node_modules/vsop87/package.json");
  const implementationPath = resolve(frontendRoot, receipt.source.implementationPath);
  const licencePath = resolve(frontendRoot, "node_modules/vsop87/LICENSE.txt");
  const [packageManifest, implementation, licence] = await Promise.all([
    readFile(packageManifestPath, "utf8").then(JSON.parse),
    readFile(implementationPath),
    readFile(licencePath),
  ]);
  if (
    receipt.schemaVersion !== 1 ||
    packageManifest.version !== receipt.source.implementationVersion ||
    packageManifest.license !== receipt.source.licenceId
  ) {
    throw new Error("VSOP87 receipt does not match the installed source package.");
  }
  const planetOrder = receipt.planets.map((planet) => planet.id);
  if (planetOrder.length !== 8 || new Set(planetOrder).size !== planetOrder.length) {
    throw new Error("VSOP87C receipt must define the eight supported planets exactly once.");
  }

  const minimumYear = Number(receipt.validity.minimumUtcDate.slice(0, 4));
  const maximumYear = Number(receipt.validity.maximumUtcDate.slice(0, 4));
  const files = new Map();
  const chunks = [];
  let totalBinaryBytes = 0;
  for (let year = minimumYear; year <= maximumYear; year += 1) {
    const encoded = encodePositionYear(year, planetOrder);
    const filename = `positions-${year}.svep`;
    files.set(filename, encoded.content);
    totalBinaryBytes += encoded.content.byteLength;
    chunks.push({
      id: `positions-${year}`,
      year,
      startJulianDate: encoded.startJulianDate,
      endJulianDate: encoded.endJulianDate,
      stepDays: receipt.sampling.positionStepJulianDays,
      sampleCount: encoded.sampleCount,
      byteLength: encoded.content.byteLength,
      url: `./${filename}`,
      integrity: integrity(encoded.content),
    });
  }

  const orbitAsset = encodeRepresentativeOrbits(receipt, planetOrder);
  const orbitFilename = "representative-orbits.svep";
  files.set(orbitFilename, orbitAsset.content);
  totalBinaryBytes += orbitAsset.content.byteLength;

  const manifest = Buffer.from(
    stableJson({
      schemaVersion: SCHEMA_VERSION,
      format: FORMAT,
      ephemeris: receipt.ephemeris,
      source: {
        ...receipt.source,
        implementationSha256: sha256Hex(implementation),
        licenceSha256: sha256Hex(licence),
      },
      validity: receipt.validity,
      sampling: receipt.sampling,
      planets: receipt.planets,
      limitations: receipt.limitations,
      build: {
        builder: BUILDER_VERSION,
        deterministic: true,
        headerBytes: HEADER_BYTES,
        byteOrder: "little-endian",
        scalarPrecision: "float64",
        positionLayout: "sample-major-planet-major-xyz",
        orbitLayout: "planet-major-sample-major-xyz",
        planetOrder,
        chunkCount: chunks.length,
        totalBinaryBytes,
      },
      chunks,
      orbitAsset: {
        id: "representative-orbits",
        referenceJulianDate: orbitAsset.referenceJulianDate,
        sampleCount: orbitAsset.sampleCount,
        byteLength: orbitAsset.content.byteLength,
        url: `./${orbitFilename}`,
        integrity: integrity(orbitAsset.content),
      },
    }),
  );
  files.set("manifest.json", manifest);
  return { files, receipt, totalBinaryBytes };
};

const persistFiles = async (files) => {
  if (!checkOnly) await mkdir(outputDirectory, { recursive: true });
  for (const [filename, content] of files) {
    const destination = resolve(outputDirectory, filename);
    if (checkOnly) {
      const existing = await readFile(destination).catch(() => null);
      if (!existing || !existing.equals(content)) {
        throw new Error(`Generated ephemeris asset is missing or stale: ${destination}`);
      }
    } else {
      await writeFile(destination, content);
    }
  }
};

const { files, receipt, totalBinaryBytes } = await buildFiles();
await persistFiles(files);
console.log(
  `VSOP87C ephemeris ${checkOnly ? "verified" : "built"}: ${receipt.planets.length} planets, ${
    files.size - 2
  } yearly chunks, ${totalBinaryBytes.toLocaleString()} binary bytes`,
);
