#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const SCRIPT_VERSION = "spaceviewer-iau-constellation-boundary-builder-v1";
const EXPECTED_CONSTELLATION_COUNT = 88;
const EXPECTED_REGION_PATH_COUNT = 89;
const DISPLAY_RADIUS_SCENE_UNITS = 132;
const MAX_INTERPOLATION_STEP_DEG = 1.5;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const receiptPath = resolve(frontendRoot, "catalog-source/iau-constellation-boundaries-j2000-v1.receipt.json");
const outputPath = resolve(frontendRoot, "src/generated/constellationBoundaries.generated.json");
const manifestPath = resolve(frontendRoot, "public/catalogs/constellations/manifest.json");
const checkOnly = process.argv.includes("--check");

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const normalizeRa = (degrees) => ((degrees % 360) + 360) % 360;
const roundCoordinate = (value) => Number(value.toFixed(7));

const parseBoundaryVertex = (line, file) => {
  const [rightAscension, declination, sourceAbbreviation] = line.split("|").map((value) => value.trim());
  const parts = rightAscension.split(/\s+/).map(Number);
  if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
    throw new Error(`Invalid right ascension in ${file.fileId}: ${line}`);
  }
  const [hours, minutes, seconds] = parts;
  const raDeg = normalizeRa((hours + minutes / 60 + seconds / 3600) * 15);
  const decDeg = Number(declination);
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    throw new Error(`Out-of-range right ascension in ${file.fileId}: ${line}`);
  }
  if (!Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90) {
    throw new Error(`Out-of-range declination in ${file.fileId}: ${line}`);
  }
  if (sourceAbbreviation !== file.sourceAbbreviation) {
    throw new Error(`Boundary abbreviation mismatch in ${file.fileId}: ${sourceAbbreviation}`);
  }
  return { raDeg: roundCoordinate(raDeg), decDeg: roundCoordinate(decDeg) };
};

const endpointKey = (vertex) => `${normalizeRa(vertex.raDeg).toFixed(7)},${vertex.decDeg.toFixed(7)}`;
const segmentKey = (start, end) => [endpointKey(start), endpointKey(end)].sort().join("|");
const shortestRaDelta = (startRaDeg, endRaDeg) => {
  let delta = normalizeRa(endRaDeg) - normalizeRa(startRaDeg);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};
const toSceneVector = (raDeg, decDeg) => {
  const raRad = (normalizeRa(raDeg) * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const cosDec = Math.cos(decRad);
  return {
    x: roundCoordinate(DISPLAY_RADIUS_SCENE_UNITS * cosDec * Math.cos(raRad)),
    y: roundCoordinate(DISPLAY_RADIUS_SCENE_UNITS * cosDec * Math.sin(raRad)),
    z: roundCoordinate(DISPLAY_RADIUS_SCENE_UNITS * Math.sin(decRad)),
  };
};
const densifySegment = (start, end) => {
  const deltaRa = shortestRaDelta(start.raDeg, end.raDeg);
  const deltaDec = end.decDeg - start.decDeg;
  const representativeDeclination = ((start.decDeg + end.decDeg) / 2) * Math.PI / 180;
  const angularSpan = Math.max(Math.abs(deltaDec), Math.abs(deltaRa * Math.cos(representativeDeclination)));
  const stepCount = Math.max(1, Math.ceil(angularSpan / MAX_INTERPOLATION_STEP_DEG));
  return Array.from({ length: stepCount + 1 }, (_, index) => {
    const progress = index / stepCount;
    return toSceneVector(start.raDeg + deltaRa * progress, start.decDeg + deltaDec * progress);
  });
};

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const sourcePath = resolve(frontendRoot, receipt.sourceFile.path.replace(/^frontend\//, ""));
const compressed = await readFile(sourcePath);
if (sha256Hex(compressed) !== receipt.sourceFile.compressedSha256) {
  throw new Error("IAU constellation-boundary source checksum does not match its receipt.");
}
const uncompressed = gunzipSync(compressed);
if (sha256Hex(uncompressed) !== receipt.sourceFile.uncompressedSha256) {
  throw new Error("IAU constellation-boundary uncompressed checksum does not match its receipt.");
}
const snapshot = JSON.parse(uncompressed.toString("utf8"));
if (snapshot.files.length !== EXPECTED_REGION_PATH_COUNT || receipt.sourceFile.fileCount !== EXPECTED_REGION_PATH_COUNT) {
  throw new Error(`Expected ${EXPECTED_REGION_PATH_COUNT} IAU region paths.`);
}

const receiptFiles = new Map(receipt.sourceFile.files.map((file) => [file.fileId, file]));
const uniqueSegments = new Map();
const regions = snapshot.files.map((file) => {
  const receiptFile = receiptFiles.get(file.fileId);
  const content = `${file.content.replace(/\r\n/g, "\n").trim()}\n`;
  if (!receiptFile || sha256Hex(Buffer.from(content)) !== receiptFile.sha256) {
    throw new Error(`IAU source file checksum does not match its receipt: ${file.fileId}`);
  }
  const vertices = content.trim().split("\n").map((line) => parseBoundaryVertex(line, file));
  if (vertices.length !== file.vertexCount) {
    throw new Error(`IAU source vertex count mismatch for ${file.fileId}.`);
  }
  const closedVertices = [...vertices, vertices[0]];
  for (let index = 0; index < closedVertices.length - 1; index += 1) {
    const start = closedVertices[index];
    const end = closedVertices[index + 1];
    const key = segmentKey(start, end);
    if (!uniqueSegments.has(key)) {
      uniqueSegments.set(key, {
        key,
        start,
        end,
        constellationAbbreviations: new Set([file.abbreviation]),
      });
    } else {
      uniqueSegments.get(key).constellationAbbreviations.add(file.abbreviation);
    }
  }
  return {
    id: file.fileId,
    abbreviation: file.abbreviation,
    sourceAbbreviation: file.sourceAbbreviation,
    sourceUrl: file.sourceUrl,
    sourceVertexCount: vertices.length,
    closed: true,
  };
});

const constellationCount = new Set(regions.map((region) => region.abbreviation)).size;
if (constellationCount !== EXPECTED_CONSTELLATION_COUNT) {
  throw new Error(`Expected ${EXPECTED_CONSTELLATION_COUNT} constellations; decoded ${constellationCount}.`);
}
const boundarySegments = [...uniqueSegments.values()]
  .sort((left, right) => left.key.localeCompare(right.key))
  .map((segment, index) => ({
    id: `iau-boundary-${String(index + 1).padStart(4, "0")}`,
    constellationAbbreviations: [...segment.constellationAbbreviations].sort(),
    sceneVectors: densifySegment(segment.start, segment.end),
  }));
const renderedVertexCount = boundarySegments.reduce((sum, segment) => sum + segment.sceneVectors.length, 0);
const sharedSegmentCount = boundarySegments.filter((segment) => segment.constellationAbbreviations.length > 1).length;

const generated = {
  schemaVersion: 1,
  catalog: {
    id: receipt.catalog.id,
    version: receipt.catalog.version,
    title: receipt.catalog.title,
    sourceName: receipt.catalog.provenance.sourceName,
    sourcePageUrl: receipt.catalog.provenance.sourcePageUrl,
    vizierUrl: receipt.catalog.provenance.vizierUrl,
    credit: receipt.catalog.provenance.credit,
    retrievedAt: receipt.catalog.provenance.retrievedAt,
    referenceFrame: receipt.catalog.referenceFrame,
    epoch: receipt.catalog.epoch,
  },
  projectionBoundary: {
    sourceCoordinates: "Official J2000 equatorial right ascension and declination boundary vertices",
    renderedCoordinates: "J2000 equatorial unit directions placed on a symbolic Three.js display sphere",
    displayRadiusSceneUnits: DISPLAY_RADIUS_SCENE_UNITS,
    maxInterpolationStepDeg: MAX_INTERPOLATION_STEP_DEG,
    physicalDistanceMeaning: "none",
    note: "Angular direction is preserved; the display radius is an interface guide and is not a physical distance.",
  },
  build: {
    scriptVersion: SCRIPT_VERSION,
    sourceSha256: receipt.sourceFile.uncompressedSha256,
    constellationCount,
    regionPathCount: regions.length,
    sourceVertexCount: receipt.sourceFile.vertexCount,
    uniqueBoundarySegmentCount: boundarySegments.length,
    sharedBoundarySegmentCount: sharedSegmentCount,
    renderedVertexCount,
  },
  regions,
  boundarySegments,
};
const generatedBuffer = Buffer.from(stableJson(generated));
const manifestBuffer = Buffer.from(stableJson({
  schemaVersion: 1,
  catalog: generated.catalog,
  projectionBoundary: generated.projectionBoundary,
  build: { ...generated.build, generatedSha256: sha256Hex(generatedBuffer) },
}));

const outputs = [[outputPath, generatedBuffer], [manifestPath, manifestBuffer]];
if (checkOnly) {
  for (const [target, expected] of outputs) {
    const actual = await readFile(target).catch(() => null);
    if (!actual?.equals(expected)) throw new Error(`Generated constellation-boundary asset is stale: ${target}`);
  }
  console.log(`Constellation-boundary check passed: ${constellationCount} constellations, ${boundarySegments.length} unique segments`);
} else {
  await Promise.all(outputs.map(async ([target, content]) => {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }));
  console.log(`Constellation boundaries built: ${constellationCount} constellations, ${boundarySegments.length} unique segments`);
}
