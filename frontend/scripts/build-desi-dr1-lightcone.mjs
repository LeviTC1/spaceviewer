#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_VERSION = "spaceviewer-desi-dr1-lightcone-builder-v1";
const SOURCE_RECORD_COUNT = 217_614;
const EXPECTED_SELECTED_RECORD_COUNT = 22_648;
const HEADER_BYTES = 96;
const RECORD_BYTES = 72;
const FLOATS_PER_RECORD = 14;
const FORMAT_VERSION = 1;
const MAGIC = "SVLC";
const SPEED_OF_LIGHT_KM_S = 299_792.458;
const COSMOLOGY = { name: "Planck 2018 baseline flat Lambda-CDM", h0KmSPerMpc: 67.4, omegaM: 0.315, omegaLambda: 0.685 };
const SELECTION = { raMinDeg: 130, raMaxDeg: 250, decMinDeg: 30, decMaxDeg: 40, redshiftMin: 0.1, redshiftMax: 0.4 };
const DISPLAY = { centerRaDeg: 190, centerDecDeg: 35, sceneUnitsPerMpc: 0.04 };
const EXPECTED_COLUMNS = [
  ["TARGETID", "K"], ["Z", "D"], ["NTILE", "K"], ["RA", "D"], ["DEC", "D"], ["PHOTSYS", "1A"],
  ["FRAC_TLOBS_TILES", "D"], ["WEIGHT_ZFAIL", "D"], ["WEIGHT_SYS", "D"], ["WEIGHT", "D"], ["WEIGHT_COMP", "D"],
  ["flux_g_dered", "E"], ["flux_r_dered", "E"], ["flux_z_dered", "E"], ["flux_w1_dered", "E"], ["flux_w2_dered", "E"],
  ["NX", "D"], ["WEIGHT_FKP", "D"],
];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(frontendRoot, "catalog-source/desi-dr1-lightcone");
const receiptPath = resolve(sourceDirectory, "source-receipt.json");
const generatedPath = resolve(frontendRoot, "src/generated/desiLightconeCatalog.generated.json");
const publicDirectory = resolve(frontendRoot, "public/catalogs/desi-lightcone");
const manifestPath = resolve(publicDirectory, "manifest.json");
const binaryPath = resolve(publicDirectory, "galaxies.svlc");
const checkOnly = process.argv.includes("--check");

const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const degToRad = (value) => (value * Math.PI) / 180;
const quantile = (values, fraction) => values[Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * fraction)))];
const cleanCardValue = (value) => value.trim().replace(/^'|'$/g, "").trim();

const parseFitsHeader = (buffer, offset) => {
  const cards = new Map();
  let cursor = offset;
  for (;;) {
    const card = buffer.toString("ascii", cursor, cursor + 80);
    const keyword = card.slice(0, 8).trim();
    if (keyword && card[8] === "=") cards.set(keyword, cleanCardValue(card.slice(10).split("/")[0]));
    cursor += 80;
    if (keyword === "END") break;
    if (cursor > buffer.byteLength) throw new Error("DESI FITS header is unterminated.");
  }
  return { cards, byteLength: Math.ceil((cursor - offset) / 2_880) * 2_880 };
};

const fitsFieldBytes = (form) => {
  const match = /^(\d*)([A-Z])$/.exec(form.trim());
  if (!match) throw new Error(`Unsupported FITS TFORM ${form}.`);
  const repeat = Number(match[1] || 1);
  const bytes = { A: 1, B: 1, I: 2, J: 4, K: 8, E: 4, D: 8 }[match[2]];
  if (!bytes) throw new Error(`Unsupported FITS TFORM ${form}.`);
  return repeat * bytes;
};

const parseColumns = (cards) => {
  const fieldCount = Number(cards.get("TFIELDS"));
  let offset = 0;
  const columns = new Map();
  for (let index = 1; index <= fieldCount; index += 1) {
    const name = cards.get(`TTYPE${index}`);
    const form = cards.get(`TFORM${index}`);
    if (!name || !form) throw new Error(`DESI FITS field ${index} is incomplete.`);
    columns.set(name, { name, form, offset, byteLength: fitsFieldBytes(form) });
    offset += fitsFieldBytes(form);
  }
  return { columns, recordBytes: offset };
};

const splitmix64 = (input) => {
  const mask = (1n << 64n) - 1n;
  let value = (input + 0x9e3779b97f4a7c15n) & mask;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & mask;
  return value ^ (value >> 31n);
};

const comovingDistanceMpc = (redshift) => {
  const intervals = 256;
  const step = redshift / intervals;
  let sum = 0;
  for (let index = 0; index <= intervals; index += 1) {
    const z = index * step;
    const inverseE = 1 / Math.sqrt(COSMOLOGY.omegaM * (1 + z) ** 3 + COSMOLOGY.omegaLambda);
    sum += (index === 0 || index === intervals ? 1 : index % 2 === 0 ? 2 : 4) * inverseE;
  }
  return (SPEED_OF_LIGHT_KM_S / COSMOLOGY.h0KmSPerMpc) * (step / 3) * sum;
};

const sourceReceipt = JSON.parse(await readFile(receiptPath, "utf8"));
for (const definition of sourceReceipt.sourceFiles) {
  const content = await readFile(resolve(frontendRoot, definition.path));
  if (content.byteLength !== definition.bytes || sha256Hex(content) !== definition.sha256) {
    throw new Error(`Pinned DESI source does not match its receipt: ${definition.path}`);
  }
}
const fitsDefinition = sourceReceipt.sourceFiles.find((definition) => definition.path.endsWith(".fits"));
if (!fitsDefinition) throw new Error("DESI source receipt does not identify a FITS catalogue.");
const fits = await readFile(resolve(frontendRoot, fitsDefinition.path));
const primary = parseFitsHeader(fits, 0);
const table = parseFitsHeader(fits, primary.byteLength);
const { columns, recordBytes: sourceRecordBytes } = parseColumns(table.cards);
const sourceRecordsOffset = primary.byteLength + table.byteLength;
const sourceRecordCount = Number(table.cards.get("NAXIS2"));
if (
  table.cards.get("XTENSION") !== "BINTABLE" ||
  table.cards.get("DESIDR") !== "dr1" ||
  sourceRecordCount !== SOURCE_RECORD_COUNT ||
  sourceRecordBytes !== Number(table.cards.get("NAXIS1")) ||
  sourceRecordsOffset + sourceRecordCount * sourceRecordBytes > fits.byteLength
) {
  throw new Error("DESI clustering FITS header or table dimensions are unexpected.");
}
EXPECTED_COLUMNS.forEach(([name, form]) => {
  if (columns.get(name)?.form.trim() !== form) throw new Error(`DESI FITS column ${name} no longer has expected TFORM ${form}.`);
});

const columnOffset = (name) => columns.get(name).offset;
const readDouble = (rowOffset, name) => fits.readDoubleBE(rowOffset + columnOffset(name));
const selected = [];
for (let index = 0; index < sourceRecordCount; index += 1) {
  const rowOffset = sourceRecordsOffset + index * sourceRecordBytes;
  const raDeg = readDouble(rowOffset, "RA");
  const decDeg = readDouble(rowOffset, "DEC");
  const redshift = readDouble(rowOffset, "Z");
  if (
    raDeg < SELECTION.raMinDeg || raDeg > SELECTION.raMaxDeg ||
    decDeg < SELECTION.decMinDeg || decDeg > SELECTION.decMaxDeg ||
    redshift < SELECTION.redshiftMin || redshift > SELECTION.redshiftMax
  ) continue;

  const targetId = fits.readBigInt64BE(rowOffset + columnOffset("TARGETID"));
  const nTile = fits.readBigInt64BE(rowOffset + columnOffset("NTILE"));
  const photSys = fits.toString("ascii", rowOffset + columnOffset("PHOTSYS"), rowOffset + columnOffset("PHOTSYS") + 1);
  const fracTlobsTiles = readDouble(rowOffset, "FRAC_TLOBS_TILES");
  const weightZFail = readDouble(rowOffset, "WEIGHT_ZFAIL");
  const weightSys = readDouble(rowOffset, "WEIGHT_SYS");
  const weight = readDouble(rowOffset, "WEIGHT");
  const weightComp = readDouble(rowOffset, "WEIGHT_COMP");
  const nx = readDouble(rowOffset, "NX");
  const weightFkp = readDouble(rowOffset, "WEIGHT_FKP");
  const numericValues = [raDeg, decDeg, redshift, fracTlobsTiles, weightZFail, weightSys, weight, weightComp, nx, weightFkp];
  if (numericValues.some((value) => !Number.isFinite(value)) || targetId <= 0 || nTile <= 0 || nTile > 65_535 || !["N", "S"].includes(photSys)) {
    throw new Error(`Invalid DESI clustering record at source row ${index + 1}.`);
  }
  if (fracTlobsTiles <= 0 || weight <= 0 || weightComp <= 0 || weightSys <= 0 || weightZFail <= 0 || weightFkp <= 0 || nx <= 0) {
    throw new Error(`Non-positive DESI selection weight at source row ${index + 1}.`);
  }

  const distanceMpc = comovingDistanceMpc(redshift);
  const ra = degToRad(raDeg);
  const dec = degToRad(decDeg);
  const direction = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  const centerRa = degToRad(DISPLAY.centerRaDeg);
  const centerDec = degToRad(DISPLAY.centerDecDeg);
  const right = [-Math.sin(centerRa), Math.cos(centerRa), 0];
  const up = [-Math.sin(centerDec) * Math.cos(centerRa), -Math.sin(centerDec) * Math.sin(centerRa), Math.cos(centerDec)];
  const forward = [Math.cos(centerDec) * Math.cos(centerRa), Math.cos(centerDec) * Math.sin(centerRa), Math.sin(centerDec)];
  const dot = (left, rightVector) => left.reduce((sum, value, axis) => sum + value * rightVector[axis], 0);
  selected.push({
    targetId,
    lodKey: splitmix64(targetId),
    nTile: Number(nTile),
    photSys,
    values: [
      raDeg, decDeg, redshift, distanceMpc,
      dot(direction, right) * distanceMpc,
      dot(direction, up) * distanceMpc,
      dot(direction, forward) * distanceMpc,
      fracTlobsTiles, weightZFail, weightSys, weight, weightComp, nx, weightFkp,
    ],
  });
}
if (selected.length !== EXPECTED_SELECTED_RECORD_COUNT) {
  throw new Error(`DESI light-cone selection decoded ${selected.length.toLocaleString()} rows; expected ${EXPECTED_SELECTED_RECORD_COUNT.toLocaleString()}.`);
}
const uniqueIds = new Set(selected.map((record) => record.targetId.toString()));
if (uniqueIds.size !== selected.length) throw new Error("DESI light-cone TARGETIDs are not unique.");
selected.sort((left, right) => left.lodKey < right.lodKey ? -1 : left.lodKey > right.lodKey ? 1 : left.targetId < right.targetId ? -1 : 1);

const binary = Buffer.alloc(HEADER_BYTES + selected.length * RECORD_BYTES);
binary.write(MAGIC, 0, 4, "ascii");
binary.writeUInt16LE(FORMAT_VERSION, 4);
binary.writeUInt16LE(HEADER_BYTES, 6);
binary.writeUInt32LE(selected.length, 8);
binary.writeUInt32LE(RECORD_BYTES, 12);
binary.writeUInt32LE(HEADER_BYTES, 16);
binary.writeUInt32LE(FLOATS_PER_RECORD, 20);
binary.writeUInt32LE(sourceRecordCount, 24);
binary.writeUInt32LE(0, 28);
binary.writeFloatLE(COSMOLOGY.h0KmSPerMpc, 32);
binary.writeFloatLE(COSMOLOGY.omegaM, 36);
binary.writeFloatLE(DISPLAY.sceneUnitsPerMpc, 40);
binary.writeFloatLE(DISPLAY.centerRaDeg, 44);
binary.writeFloatLE(DISPLAY.centerDecDeg, 48);
binary.writeFloatLE(SELECTION.raMinDeg, 52);
binary.writeFloatLE(SELECTION.raMaxDeg, 56);
binary.writeFloatLE(SELECTION.decMinDeg, 60);
binary.writeFloatLE(SELECTION.decMaxDeg, 64);
binary.writeFloatLE(SELECTION.redshiftMin, 68);
binary.writeFloatLE(SELECTION.redshiftMax, 72);
const distances = selected.map((record) => record.values[3]);
binary.writeFloatLE(Math.min(...distances), 84);
binary.writeFloatLE(Math.max(...distances), 88);

selected.forEach((record, index) => {
  const offset = HEADER_BYTES + index * RECORD_BYTES;
  binary.writeBigUInt64LE(record.targetId, offset);
  binary.writeUInt16LE(record.nTile, offset + 8);
  binary.writeUInt8(record.photSys === "N" ? 0 : 1, offset + 10);
  binary.writeUInt8(0, offset + 11);
  record.values.forEach((value, valueIndex) => binary.writeFloatLE(value, offset + 12 + valueIndex * 4));
});

const sortedWeights = (fieldIndex) => selected.map((record) => record.values[fieldIndex]).sort((a, b) => a - b);
const weightStats = (fieldIndex) => {
  const values = sortedWeights(fieldIndex);
  return { minimum: values[0], median: quantile(values, 0.5), maximum: values.at(-1) };
};
const nzText = await readFile(resolve(sourceDirectory, "BGS_BRIGHT-21.5_NGC_nz.txt"), "utf8");
const nzLines = nzText.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
const nzBins = nzLines.map((line) => {
  const [zMid, zLow, zHigh, numberDensityH3Mpc3, weightedCount, volumeMpc3HMinus3] = line.trim().split(/\s+/).map(Number);
  return { zMid, zLow, zHigh, numberDensityH3Mpc3, weightedCount, volumeMpc3HMinus3 };
});
if (nzBins.length !== 30 || nzBins.some((bin) => Object.values(bin).some((value) => !Number.isFinite(value)))) {
  throw new Error("DESI n(z) reference table is malformed.");
}

const metadata = {
  schemaVersion: 1,
  catalog: {
    id: "desi-dr1-bgs-bright-21.5-ngc-lightcone",
    version: sourceReceipt.catalog.version,
    title: "DESI DR1 BGS_BRIGHT-21.5 measured-galaxy redshift light cone",
    sourceTitle: sourceReceipt.catalog.title,
    releaseDate: sourceReceipt.catalog.releaseDate,
    retrievedAt: sourceReceipt.catalog.retrievedAt,
    sourceUrl: fitsDefinition.url,
    dataReleaseUrl: sourceReceipt.catalog.dataReleaseUrl,
    dataModelUrl: sourceReceipt.catalog.dataModelUrl,
    samplePaper: sourceReceipt.catalog.samplePaper,
    samplePaperDoi: sourceReceipt.catalog.samplePaperDoi,
    samplePaperUrl: sourceReceipt.catalog.samplePaperUrl,
    credit: sourceReceipt.catalog.provenance.credit,
    licenceId: sourceReceipt.catalog.provenance.licenceId,
    licenceStatus: sourceReceipt.catalog.provenance.licenceStatus,
    licenceUrl: sourceReceipt.catalog.provenance.licenceUrl,
    acknowledgmentsUrl: sourceReceipt.catalog.provenance.desiAcknowledgmentsUrl,
  },
  selection: {
    sourceSample: "DESI DR1 LSS BGS_BRIGHT-21.5 NGC clustering data catalogue v1.5",
    sourceSampleDefinition: "BGS_BRIGHT galaxies with 0.1 < z < 0.4 and evolution-corrected Fastspecfit r-band absolute magnitude M_r < -21.5; DESI LSS catalogue vetoes and weights are inherited.",
    sourceRecordCount,
    selectedRecordCount: selected.length,
    skyFootprint: { ...SELECTION, frame: "ICRS" },
    predicate: `RA >= ${SELECTION.raMinDeg} AND RA <= ${SELECTION.raMaxDeg} AND DEC >= ${SELECTION.decMinDeg} AND DEC <= ${SELECTION.decMaxDeg} AND Z >= ${SELECTION.redshiftMin} AND Z <= ${SELECTION.redshiftMax}`,
    selectionBoundary: "This is a rectangular cut through the NGC clustering catalogue, not a volume-complete census of all galaxies. Angular footprint, target selection, veto masks, fibre assignment, redshift success, and magnitude selection remain observable boundaries.",
    displayPopulation: "Every selected measured galaxy is stored. Quality tiers use deterministic prefixes of a TARGETID hash order, preserving an unbiased visual subsample without inventing objects.",
  },
  coordinates: {
    angularFrame: "ICRS",
    radialObservable: "Redrock spectroscopic redshift Z",
    coordinateConvention: "observer-centred redshift-space comoving Cartesian",
    displayBasis: `local tangent basis centred on ICRS RA ${DISPLAY.centerRaDeg} deg, Dec ${DISPLAY.centerDecDeg} deg`,
    sceneUnitsPerMpc: DISPLAY.sceneUnitsPerMpc,
    cosmology: { ...COSMOLOGY, speedOfLightKmS: SPEED_OF_LIGHT_KM_S },
    distanceEquation: "D_C(z) = c/H0 integral_0^z dz' / sqrt(Omega_m(1+z')^3 + Omega_Lambda)",
    interpretationBoundary: "Comoving distances are inferred from measured redshift under the declared reference cosmology. They are not independent distance measurements; peculiar velocities create redshift-space distortions.",
    distanceRangeMpc: { minimum: Math.min(...distances), maximum: Math.max(...distances) },
  },
  uncertainty: {
    sourceBoundary: "The clustering FITS product does not publish per-object ZERR, so this layer does not draw radial error bars.",
    statisticalBoundary: "Catalogue weights correct analysis selection effects; they are not per-galaxy measurement probabilities and do not change marker brightness.",
    systematicBoundary: "Peculiar velocities, fibre assignment, imaging systematics, redshift failures, masks, and the assumed cosmology remain relevant. This visualization is not a density-field estimator or precision clustering measurement.",
  },
  weights: {
    visualUse: "retained as metadata but not used to duplicate galaxies, change point brightness, or infer filaments",
    combined: weightStats(10),
    completeness: weightStats(11),
    imagingSystematics: weightStats(9),
    redshiftFailure: weightStats(8),
    fkp: weightStats(13),
    fracTlobsTiles: weightStats(7),
  },
  referenceNofZ: {
    source: "BGS_BRIGHT-21.5_NGC_nz.txt",
    populationBoundary: "Published for the full NGC sample, not recomputed for the displayed rectangular strip.",
    bins: nzBins,
  },
  binary: {
    url: "/catalogs/desi-lightcone/galaxies.svlc",
    format: "SpaceViewer measured redshift light-cone binary",
    magic: MAGIC,
    version: FORMAT_VERSION,
    headerBytes: HEADER_BYTES,
    recordBytes: RECORD_BYTES,
    floatsPerRecord: FLOATS_PER_RECORD,
    recordCount: selected.length,
    byteLength: binary.byteLength,
    sha256: sha256Hex(binary),
    recordOrder: "ascending SplitMix64(TARGETID), then TARGETID; any leading prefix is a deterministic uniform LOD sample",
    floatFields: ["raDeg", "decDeg", "redshift", "comovingDistanceMpc", "localXMpc", "localYMpc", "localZMpc", "fracTlobsTiles", "weightZFail", "weightSys", "weight", "weightComp", "nx", "weightFkp"],
  },
  build: {
    scriptVersion: SCRIPT_VERSION,
    sourceSha256: fitsDefinition.sha256,
    sourceRecordCount,
    selectedRecordCount: selected.length,
    photometricSystemCounts: Object.fromEntries(["N", "S"].map((key) => [key, selected.filter((record) => record.photSys === key).length])),
    tileCountRange: { minimum: Math.min(...selected.map((record) => record.nTile)), maximum: Math.max(...selected.map((record) => record.nTile)) },
  },
};

const metadataBuffer = Buffer.from(stableJson(metadata));
const outputs = [[generatedPath, metadataBuffer], [manifestPath, metadataBuffer], [binaryPath, binary]];
if (checkOnly) {
  for (const [path, expected] of outputs) {
    const actual = await readFile(path).catch(() => null);
    if (!actual?.equals(expected)) throw new Error(`DESI light-cone generated asset is stale: ${path}`);
  }
  console.log(`DESI light-cone catalogue check passed: ${selected.length.toLocaleString()} measured galaxies, ${binary.byteLength.toLocaleString()} bytes`);
} else {
  await Promise.all([mkdir(dirname(generatedPath), { recursive: true }), mkdir(publicDirectory, { recursive: true })]);
  await Promise.all(outputs.map(([path, content]) => writeFile(path, content)));
  console.log(`DESI light-cone catalogue built: ${selected.length.toLocaleString()} measured galaxies, ${binary.byteLength.toLocaleString()} bytes`);
}
