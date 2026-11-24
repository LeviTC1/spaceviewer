#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_VERSION = "spaceviewer-milky-way-reid2019-builder-v1";
const EXPECTED_RECORD_COUNT = 199;
const HEADER_BYTES = 64;
const RECORD_BYTES = 96;
const FLOATS_PER_RECORD = 20;
const FORMAT_VERSION = 1;
const MAGIC = "SVMW";
const ARM_COLORS = ["#ffb55e", "#ef7f69", "#69c7e8", "#b8d67a", "#f1dc77", "#9ba9ff", "#d58ae7"];
const ICRS_TO_GALACTIC = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.7469822444972189],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(frontendRoot, "catalog-source/milky-way-reid2019");
const receiptPath = resolve(sourceDirectory, "source-receipt.json");
const armModelPath = resolve(sourceDirectory, "arm-model.json");
const generatedPath = resolve(frontendRoot, "src/generated/milkyWayCatalog.generated.json");
const publicDirectory = resolve(frontendRoot, "public/catalogs/milky-way");
const manifestPath = resolve(publicDirectory, "manifest.json");
const binaryPath = resolve(publicDirectory, "tracers.svmw");
const checkOnly = process.argv.includes("--check");

const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const degToRad = (value) => (value * Math.PI) / 180;
const radToDeg = (value) => (value * 180) / Math.PI;
const normalizeLongitude = (value) => ((value % 360) + 360) % 360;
const angularDifference = (left, right) => Math.abs(((left - right + 540) % 360) - 180);
const finiteNumber = (value, label, rowNumber) => {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label} in Reid row ${rowNumber}.`);
  return parsed;
};

const parseRow = (line, rowIndex) => {
  if (line.length > 129) throw new Error(`Reid row ${rowIndex + 1} has ${line.length} bytes; expected at most 129.`);
  line = line.padEnd(129, " ");
  const number = rowIndex + 1;
  const name = line.slice(0, 13).trim();
  const otherName = line.slice(15, 30).trim();
  const raHours = finiteNumber(line.slice(31, 33), "RA hours", number);
  const raMinutes = finiteNumber(line.slice(34, 36), "RA minutes", number);
  const raSeconds = finiteNumber(line.slice(37, 44), "RA seconds", number);
  const decSign = line.slice(46, 47) === "-" ? -1 : 1;
  const decDegrees = finiteNumber(line.slice(47, 49), "Dec degrees", number);
  const decMinutes = finiteNumber(line.slice(50, 52), "Dec minutes", number);
  const decSeconds = finiteNumber(line.slice(53, 59), "Dec seconds", number);
  const raDeg = 15 * (raHours + raMinutes / 60 + raSeconds / 3600);
  const decDeg = decSign * (decDegrees + decMinutes / 60 + decSeconds / 3600);
  const parallaxMas = finiteNumber(line.slice(62, 67), "parallax", number);
  const parallaxErrorMas = finiteNumber(line.slice(68, 73), "parallax uncertainty", number);
  const pmEastMasYr = finiteNumber(line.slice(76, 82), "eastward proper motion", number);
  const pmEastErrorMasYr = finiteNumber(line.slice(83, 87), "eastward proper-motion uncertainty", number);
  const pmNorthMasYr = finiteNumber(line.slice(90, 96), "northward proper motion", number);
  const pmNorthErrorMasYr = finiteNumber(line.slice(97, 101), "northward proper-motion uncertainty", number);
  const vLsrKmS = finiteNumber(line.slice(104, 108), "LSR velocity", number);
  const vLsrErrorKmS = finiteNumber(line.slice(109, 111), "LSR velocity uncertainty", number);
  const armCode = line.slice(113, 116).trim();
  const references = line.slice(118, 129).trim();

  if (!name || !armCode || !references || parallaxMas <= 0 || parallaxErrorMas <= 0) {
    throw new Error(`Reid row ${number} is missing a required measurement or identifier.`);
  }

  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  const equatorial = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const galactic = ICRS_TO_GALACTIC.map((row) => row.reduce((sum, coefficient, index) => sum + coefficient * equatorial[index], 0));
  const galacticLongitudeDeg = normalizeLongitude(radToDeg(Math.atan2(galactic[1], galactic[0])));
  const galacticLatitudeDeg = radToDeg(Math.asin(Math.max(-1, Math.min(1, galactic[2]))));
  const nameCoordinates = /^G(\d{3}\.\d{2})([+-])(\d{2}\.\d{2})$/.exec(name);
  if (nameCoordinates) {
    const nameLongitude = Number(nameCoordinates[1]);
    const nameLatitude = Number(nameCoordinates[3]) * (nameCoordinates[2] === "-" ? -1 : 1);
    if (angularDifference(galacticLongitudeDeg, nameLongitude) > 0.08 || Math.abs(galacticLatitudeDeg - nameLatitude) > 0.08) {
      throw new Error(`ICRS-to-Galactic transform does not reproduce ${name}.`);
    }
  }

  const distanceKpc = 1 / parallaxMas;
  const distanceLowKpc = 1 / (parallaxMas + parallaxErrorMas);
  const distanceHighKpc = parallaxMas > parallaxErrorMas ? 1 / (parallaxMas - parallaxErrorMas) : Number.NaN;
  return {
    name,
    otherName,
    references,
    armCode,
    raDeg,
    decDeg,
    parallaxMas,
    parallaxErrorMas,
    pmEastMasYr,
    pmEastErrorMasYr,
    pmNorthMasYr,
    pmNorthErrorMasYr,
    vLsrKmS,
    vLsrErrorKmS,
    galacticLongitudeDeg,
    galacticLatitudeDeg,
    distanceKpc,
    distanceLowKpc,
    distanceHighKpc,
    heliocentricGalacticXKpc: galactic[0] * distanceKpc,
    heliocentricGalacticYKpc: galactic[1] * distanceKpc,
    heliocentricGalacticZKpc: galactic[2] * distanceKpc,
    fractionalParallaxError: parallaxErrorMas / parallaxMas,
  };
};

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const armModel = JSON.parse(await readFile(armModelPath, "utf8"));
const sourceDefinitions = new Map(receipt.sourceFiles.map((file) => [file.path.split("/").at(-1), file]));
for (const [name, definition] of sourceDefinitions) {
  const content = await readFile(resolve(sourceDirectory, name));
  if (content.byteLength !== definition.bytes || sha256Hex(content) !== definition.sha256) {
    throw new Error(`Pinned Reid source does not match its receipt: ${name}`);
  }
}

const table = await readFile(resolve(sourceDirectory, "table1.dat"), "utf8");
const records = table.trimEnd().split("\n").map(parseRow);
if (records.length !== EXPECTED_RECORD_COUNT || receipt.recordCount !== EXPECTED_RECORD_COUNT) {
  throw new Error(`Expected ${EXPECTED_RECORD_COUNT} Reid tracers; decoded ${records.length}.`);
}
const uniqueSourceKeys = new Set(records.map((record) => `${record.name}|${record.otherName}|${record.raDeg.toFixed(7)}`));
if (uniqueSourceKeys.size !== records.length) throw new Error("Reid tracer source keys are not unique.");

const armCodes = [...new Set(records.map((record) => record.armCode))].sort();
const segmentByArmCode = new Map();
const segments = armModel.model.segments.map((segment, index) => {
  segment.sourceArmCodes.forEach((armCode) => {
    if (segmentByArmCode.has(armCode)) throw new Error(`Arm code ${armCode} maps to multiple fitted segments.`);
    segmentByArmCode.set(armCode, index);
  });
  return {
    ...segment,
    color: ARM_COLORS[index],
    catalogueSourceCount: records.filter((record) => segment.sourceArmCodes.includes(record.armCode)).length,
    uncertaintyInterpretation: "Published marginal 1-sigma parameter errors and intrinsic Gaussian 1-sigma width; no joint covariance supplied.",
  };
});
if (segments.length !== 7) throw new Error("Reid Table 2 transcription must contain seven fitted arm segments.");

const strings = [Buffer.from([0])];
let stringBytes = 1;
const stringOffsets = new Map([["", 0]]);
const addString = (value) => {
  if (stringOffsets.has(value)) return stringOffsets.get(value);
  const offset = stringBytes;
  const encoded = Buffer.from(`${value}\0`, "utf8");
  strings.push(encoded);
  stringBytes += encoded.byteLength;
  stringOffsets.set(value, offset);
  return offset;
};
records.forEach((record) => {
  addString(record.name);
  addString(record.otherName);
  addString(record.references);
});
const stringsBuffer = Buffer.concat(strings);
const recordsOffset = HEADER_BYTES;
const stringTableOffset = recordsOffset + records.length * RECORD_BYTES;
const binary = Buffer.alloc(stringTableOffset + stringsBuffer.byteLength);
binary.write(MAGIC, 0, 4, "ascii");
binary.writeUInt16LE(FORMAT_VERSION, 4);
binary.writeUInt16LE(HEADER_BYTES, 6);
binary.writeUInt32LE(records.length, 8);
binary.writeUInt32LE(RECORD_BYTES, 12);
binary.writeUInt32LE(recordsOffset, 16);
binary.writeUInt32LE(stringTableOffset, 20);
binary.writeUInt32LE(stringsBuffer.byteLength, 24);
binary.writeUInt32LE(FLOATS_PER_RECORD, 28);
binary.writeFloatLE(armModel.model.galactocentricSunDistanceKpc, 32);
binary.writeUInt32LE(armCodes.length, 36);
binary.writeUInt32LE(segments.length, 40);

records.forEach((record, index) => {
  const offset = recordsOffset + index * RECORD_BYTES;
  binary.writeUInt32LE(addString(record.name), offset);
  binary.writeUInt32LE(addString(record.otherName), offset + 4);
  binary.writeUInt32LE(addString(record.references), offset + 8);
  binary.writeUInt8(armCodes.indexOf(record.armCode), offset + 12);
  const segmentIndex = segmentByArmCode.get(record.armCode);
  binary.writeUInt8(segmentIndex ?? 255, offset + 13);
  let flags = 0;
  if (Number.isFinite(record.distanceHighKpc)) flags |= 1;
  if (segmentIndex != null) flags |= 2;
  if (record.fractionalParallaxError >= 1 / 3) flags |= 4;
  binary.writeUInt16LE(flags, offset + 14);
  const floats = [
    record.raDeg,
    record.decDeg,
    record.parallaxMas,
    record.parallaxErrorMas,
    record.pmEastMasYr,
    record.pmEastErrorMasYr,
    record.pmNorthMasYr,
    record.pmNorthErrorMasYr,
    record.vLsrKmS,
    record.vLsrErrorKmS,
    record.galacticLongitudeDeg,
    record.galacticLatitudeDeg,
    record.distanceKpc,
    record.distanceLowKpc,
    record.distanceHighKpc,
    record.heliocentricGalacticXKpc,
    record.heliocentricGalacticYKpc,
    record.heliocentricGalacticZKpc,
    record.fractionalParallaxError,
    1 / Math.max(1, record.fractionalParallaxError * 5),
  ];
  floats.forEach((value, floatIndex) => binary.writeFloatLE(value, offset + 16 + floatIndex * 4));
});
stringsBuffer.copy(binary, stringTableOffset);

const sourceArmCounts = Object.fromEntries(armCodes.map((armCode) => [
  armCode,
  records.filter((record) => record.armCode === armCode).length,
]));
const maxDistanceKpc = Math.max(...records.map((record) => record.distanceKpc));
const lowSignalCount = records.filter((record) => record.fractionalParallaxError >= 1 / 3).length;
const unboundedReciprocalSpanCount = records.filter((record) => !Number.isFinite(record.distanceHighKpc)).length;
const tableSource = sourceDefinitions.get("table1.dat");
const metadata = {
  schemaVersion: 1,
  catalog: {
    id: "reid2019-vlbi-maser-tracers",
    version: receipt.catalog.version,
    title: "Reid et al. VLBI high-mass star-forming-region tracers",
    sourceCatalogId: receipt.catalog.id,
    sourceCatalogDoi: receipt.catalog.catalogDoi,
    articleDoi: receipt.catalog.articleDoi,
    catalogUrl: receipt.catalog.catalogUrl,
    articleUrl: receipt.catalog.articleUrl,
    retrievedAt: receipt.catalog.retrievedAt,
    credit: receipt.catalog.provenance.credit,
    licenceId: receipt.catalog.provenance.licenceId,
    licenceStatus: receipt.catalog.provenance.licenceStatus,
    licenceUrl: receipt.catalog.provenance.licenceUrl,
    licenceSummary: receipt.catalog.provenance.licenceSummary,
    referenceFrame: "heliocentric-galactic-cartesian",
    sourceCoordinateFrame: "ICRS J2000",
    distanceUnit: "kiloparsec",
  },
  selection: {
    sourceTable: "VizieR J/ApJ/885/131 table1",
    sourceRecordCount: records.length,
    selectedRecordCount: records.length,
    predicate: "All 199 published table rows with positive trigonometric parallax and quoted uncertainty; no additional scientific filtering.",
    populationBoundary: "VLBI masers associated with high-mass star-forming regions; this is neither a complete star census nor an unbiased Galactic-density sample.",
    armAssignmentBoundary: "Published arm designators are retained. Fitted Table 2 segments use subsets and priors, so catalogue-source counts can differ from fit N.",
  },
  transform: {
    icrsToGalacticMatrix: ICRS_TO_GALACTIC,
    galactocentricSunDistanceKpc: armModel.model.galactocentricSunDistanceKpc,
    galactocentricConvention: "+X from Galactic centre toward the Sun, +Y toward Galactic longitude 90 degrees, +Z toward Galactic north",
    displayMapping: "world x = -heliocentric X, world y = heliocentric Z, world z = heliocentric Y, scaled linearly in scene units per kpc",
  },
  uncertainty: {
    sourceMeasurements: "Per-source parallax, proper-motion, and LSR-velocity 1-sigma uncertainties from the catalogue.",
    distanceVisualization: "Nominal reciprocal parallax d=1/parallax with the reciprocal of parallax plus/minus one quoted sigma stored as a diagnostic span.",
    distanceCaveat: "The reciprocal span is not a Bayesian distance posterior and becomes unbounded when parallax minus one sigma is non-positive.",
    armModel: armModel.source.transcriptionNote,
    lowSignalThreshold: "fractional parallax uncertainty >= 1/3",
    lowSignalCount,
    unboundedReciprocalSpanCount,
  },
  armModel: {
    source: armModel.source,
    equation: armModel.model.equation,
    azimuthConvention: armModel.model.azimuthConvention,
    intrinsicWidthSlopeKpcPerKpc: armModel.model.intrinsicWidthSlopeKpcPerKpc,
    segments,
  },
  binary: {
    url: "/catalogs/milky-way/tracers.svmw",
    format: "SpaceViewer Milky Way tracers",
    magic: MAGIC,
    version: FORMAT_VERSION,
    headerBytes: HEADER_BYTES,
    recordBytes: RECORD_BYTES,
    recordCount: records.length,
    byteLength: binary.byteLength,
    sha256: sha256Hex(binary),
    stringEncoding: "null-terminated UTF-8",
    floatFields: [
      "raDeg", "decDeg", "parallaxMas", "parallaxErrorMas", "pmEastMasYr", "pmEastErrorMasYr",
      "pmNorthMasYr", "pmNorthErrorMasYr", "vLsrKmS", "vLsrErrorKmS", "galacticLongitudeDeg",
      "galacticLatitudeDeg", "distanceKpc", "distanceLowKpc", "distanceHighKpc", "heliocentricGalacticXKpc",
      "heliocentricGalacticYKpc", "heliocentricGalacticZKpc", "fractionalParallaxError", "markerWeight",
    ],
  },
  build: {
    scriptVersion: SCRIPT_VERSION,
    sourceSha256: tableSource.sha256,
    recordCount: records.length,
    armCodeCount: armCodes.length,
    armCodes,
    sourceArmCounts,
    fittedSegmentCount: segments.length,
    maximumNominalDistanceKpc: maxDistanceKpc,
  },
};
const generatedBuffer = Buffer.from(stableJson(metadata));
const manifestBuffer = Buffer.from(stableJson({
  ...metadata,
  build: { ...metadata.build, generatedMetadataSha256: sha256Hex(generatedBuffer) },
}));
const outputs = [[generatedPath, generatedBuffer], [manifestPath, manifestBuffer], [binaryPath, binary]];

if (checkOnly) {
  for (const [target, expected] of outputs) {
    const actual = await readFile(target).catch(() => null);
    if (!actual?.equals(expected)) throw new Error(`Generated Milky Way asset is stale: ${target}`);
  }
  console.log(`Milky Way catalogue check passed: ${records.length} tracers, ${segments.length} fitted segments`);
} else {
  await Promise.all(outputs.map(async ([target, content]) => {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }));
  console.log(`Milky Way catalogue built: ${records.length} tracers, ${segments.length} fitted segments, ${binary.byteLength} bytes`);
}
