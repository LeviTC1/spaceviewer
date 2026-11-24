#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const SCRIPT_VERSION = "spaceviewer-openngc-builder-v1";
const CHUNK_COUNT = 12;
const CHUNK_WIDTH_DEG = 30;
const MAX_MAGNITUDE = 12;
const MIN_MAJOR_AXIS_ARCMIN = 2;
const ANGULAR_SHELL_RADIUS = 108;
const ACCEPTED_TYPES = new Set(["G", "GPair", "GTrpl", "GGroup", "PN", "HII", "DrkN", "EmN", "Neb", "RfN", "SNR", "OCl", "GCl", "Cl+N"]);
const GALAXY_TYPES = new Set(["G", "GPair", "GTrpl", "GGroup"]);
const CLUSTER_TYPES = new Set(["OCl", "GCl"]);
const TYPE_LABELS = {
  G: "Galaxy", GPair: "Galaxy pair", GTrpl: "Galaxy triplet", GGroup: "Galaxy group",
  PN: "Planetary nebula", HII: "H II region", DrkN: "Dark nebula", EmN: "Emission nebula",
  Neb: "Nebula", RfN: "Reflection nebula", SNR: "Supernova remnant", OCl: "Open cluster",
  GCl: "Globular cluster", "Cl+N": "Star cluster with nebulosity",
};
const LEGACY_IDS = {
  NGC5194: "whirlpool-galaxy", NGC4594: "sombrero-galaxy", NGC3031: "bodes-galaxy",
  NGC3034: "cigar-galaxy", NGC5457: "pinwheel-galaxy", NGC5236: "southern-pinwheel-galaxy",
  NGC1976: "orion-nebula", NGC6611: "eagle-nebula", NGC6720: "ring-nebula",
  NGC1952: "crab-nebula", NGC6523: "lagoon-nebula", NGC3372: "carina-nebula",
  IC0434: "horsehead-nebula", NGC2070: "tarantula-nebula", NGC6853: "dumbbell-nebula",
  NGC7000: "north-america-nebula", M045: "pleiades", NGC2632: "beehive-cluster",
  NGC6205: "hercules-globular-cluster", NGC5139: "omega-centauri",
};
const CONSTELLATIONS = Object.fromEntries(`And Andromeda|Ant Antlia|Aps Apus|Aqr Aquarius|Aql Aquila|Ara Ara|Ari Aries|Aur Auriga|Boo Boötes|Cae Caelum|Cam Camelopardalis|Cnc Cancer|CVn Canes Venatici|CMa Canis Major|CMi Canis Minor|Cap Capricornus|Car Carina|Cas Cassiopeia|Cen Centaurus|Cep Cepheus|Cet Cetus|Cha Chamaeleon|Cir Circinus|Col Columba|Com Coma Berenices|CrA Corona Australis|CrB Corona Borealis|Crv Corvus|Crt Crater|Cru Crux|Cyg Cygnus|Del Delphinus|Dor Dorado|Dra Draco|Equ Equuleus|Eri Eridanus|For Fornax|Gem Gemini|Gru Grus|Her Hercules|Hor Horologium|Hya Hydra|Hyi Hydrus|Ind Indus|Lac Lacerta|Leo Leo|LMi Leo Minor|Lep Lepus|Lib Libra|Lup Lupus|Lyn Lynx|Lyr Lyra|Men Mensa|Mic Microscopium|Mon Monoceros|Mus Musca|Nor Norma|Oct Octans|Oph Ophiuchus|Ori Orion|Pav Pavo|Peg Pegasus|Per Perseus|Phe Phoenix|Pic Pictor|Psc Pisces|PsA Piscis Austrinus|Pup Puppis|Pyx Pyxis|Ret Reticulum|Sge Sagitta|Sgr Sagittarius|Sco Scorpius|Scl Sculptor|Sct Scutum|Ser Serpens|Se1 Serpens Caput|Se2 Serpens Cauda|Sex Sextans|Tau Taurus|Tel Telescopium|Tri Triangulum|TrA Triangulum Australe|Tuc Tucana|UMa Ursa Major|UMi Ursa Minor|Vel Vela|Vir Virgo|Vol Volans|Vul Vulpecula`.split("|").map((entry) => {
  const [code, ...name] = entry.split(" ");
  return [code, name.join(" ")];
}));

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(frontendRoot, "catalog-source/openngc-v20260501");
const receiptPath = resolve(sourceDirectory, "source-receipt.json");
const localGroupPath = resolve(frontendRoot, "src/generated/localGroupCatalog.generated.json");
const publicDirectory = resolve(frontendRoot, "public/catalogs/openngc");
const manifestPath = resolve(publicDirectory, "manifest.json");
const checkOnly = process.argv.includes("--check");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Hex = (content) => createHash("sha256").update(content).digest("hex");
const clean = (value) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const numeric = (value) => clean(value) && Number.isFinite(Number(value)) ? Number(value) : undefined;
const splitList = (value) => (clean(value)?.split(",").map((item) => item.trim()).filter(Boolean) ?? []);
const slugify = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "object";
const formatCatalogId = (value) => {
  const match = clean(value)?.match(/^(NGC|IC)(\d{1,4})(.*)$/);
  return match ? `${match[1]} ${Number(match[2])}${match[3] ? ` ${match[3].trim()}` : ""}` : clean(value);
};
const formatCrossIds = (prefix, value) => splitList(value).map((identifier) => {
  const match = identifier.match(/^0*(\d{1,4})(.*)$/);
  return match ? `${prefix} ${Number(match[1])}${match[2] ? ` ${match[2].trim()}` : ""}` : `${prefix} ${identifier}`;
});
const parseRaDeg = (value) => {
  const parts = value.split(":").map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? (parts[0] + parts[1] / 60 + parts[2] / 3600) * 15 : NaN;
};
const parseDecDeg = (value) => {
  const sign = value.trim().startsWith("-") ? -1 : 1;
  const parts = value.replace(/^[+-]/, "").split(":").map(Number);
  return parts.length === 3 && parts.every(Number.isFinite) ? sign * (parts[0] + parts[1] / 60 + parts[2] / 3600) : NaN;
};
const parseSemicolonCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ";" && !quoted) { row.push(field); field = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
    } else field += character;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows;
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
};
const familyFor = (type) => GALAXY_TYPES.has(type) ? "galaxy" : CLUSTER_TYPES.has(type) ? "cluster" : "nebula";
const objectClassFor = (row) => {
  if (row.Type === "GPair") return "galaxy-pair";
  if (row.Type === "GTrpl") return "galaxy-triplet";
  if (row.Type === "GGroup") return "galaxy-group";
  if (row.Type === "G") {
    const hubble = clean(row.Hubble)?.toUpperCase() ?? "";
    if (hubble.startsWith("SB")) return "barred-spiral-galaxy";
    if (hubble.startsWith("S0")) return "lenticular-galaxy";
    if (hubble.startsWith("E")) return "elliptical-galaxy";
    if (hubble.startsWith("I")) return "irregular-galaxy";
    if (hubble.startsWith("S")) return "spiral-galaxy";
    return "galaxy";
  }
  return ({ PN: "planetary-nebula", HII: "hii-region", DrkN: "dark-nebula", EmN: "emission-nebula", Neb: "nebula", RfN: "reflection-nebula", SNR: "supernova-remnant", OCl: "open-cluster", GCl: "globular-cluster", "Cl+N": "cluster-nebula" })[row.Type];
};
const importanceFor = ({ messier, apparentMagnitude, majorAxisArcMin, commonNames }) => Math.max(45, Math.min(99, Math.round(
  45 + (messier ? 24 : 0) + (commonNames.length ? 8 : 0) + (Number.isFinite(apparentMagnitude) ? Math.max(0, 12 - apparentMagnitude) * 1.8 : 0) + (Number.isFinite(majorAxisArcMin) ? Math.min(13, Math.log2(majorAxisArcMin + 1) * 2.4) : 0),
)));

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
for (const definition of receipt.sourceFiles) {
  const content = await readFile(resolve(frontendRoot, definition.path));
  if (content.byteLength !== definition.bytes || sha256Hex(content) !== definition.sha256) {
    throw new Error(`Pinned OpenNGC source does not match its receipt: ${definition.path}`);
  }
}
const csvDefinitions = receipt.sourceFiles.filter((definition) => definition.contentEncoding === "gzip");
const sourceContents = await Promise.all(csvDefinitions.map(async (definition) => ({
  definition,
  content: await readFile(resolve(frontendRoot, definition.path)),
})));
const sourceRows = sourceContents.flatMap(({ content }) => parseSemicolonCsv(gunzipSync(content).toString("utf8")));
if (sourceRows.length !== receipt.catalog.sourceRecordCount) {
  throw new Error(`OpenNGC source row count ${sourceRows.length.toLocaleString()} does not match the receipt.`);
}

const normalizeCatalogIdentity = (value) => {
  const match = clean(value)?.toUpperCase().match(/^(NGC|IC|M)\s*0*(\d{1,4})$/);
  return match ? `${match[1]}${match[2].padStart(match[1] === "M" ? 3 : 4, "0")}` : undefined;
};
const localGroup = JSON.parse(await readFile(localGroupPath, "utf8"));
const physicalLocalGroupIdentities = new Set(
  localGroup.records.map((record) => normalizeCatalogIdentity(record.name)).filter(Boolean),
);

let acceptedTypeCount = 0;
let coordinateRejectedCount = 0;
let thresholdRejectedCount = 0;
let localGroupExcludedCount = 0;
const selected = [];
for (const row of sourceRows) {
  if (!ACCEPTED_TYPES.has(row.Type)) continue;
  acceptedTypeCount += 1;
  const raDeg = parseRaDeg(row.RA);
  const decDeg = parseDecDeg(row.Dec);
  if (!Number.isFinite(raDeg) || raDeg < 0 || raDeg >= 360 || !Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90) {
    coordinateRejectedCount += 1;
    continue;
  }
  const messierNumber = numeric(row.M);
  const messier = Number.isInteger(messierNumber) && messierNumber > 0 ? `M ${messierNumber}` : undefined;
  const primaryIdentity = normalizeCatalogIdentity(row.Name);
  const messierIdentity = normalizeCatalogIdentity(messier);
  if (GALAXY_TYPES.has(row.Type) && [primaryIdentity, messierIdentity].some((identity) => identity && physicalLocalGroupIdentities.has(identity))) {
    localGroupExcludedCount += 1;
    continue;
  }
  const magnitudeV = numeric(row["V-Mag"]);
  const magnitudeB = numeric(row["B-Mag"]);
  const apparentMagnitude = magnitudeV ?? magnitudeB;
  const apparentMagnitudeBand = magnitudeV !== undefined ? "V" : magnitudeB !== undefined ? "B" : undefined;
  const majorAxisArcMin = numeric(row.MajAx);
  if (!(messier || (apparentMagnitude !== undefined && apparentMagnitude <= MAX_MAGNITUDE) || (majorAxisArcMin !== undefined && majorAxisArcMin >= MIN_MAJOR_AXIS_ARCMIN))) {
    thresholdRejectedCount += 1;
    continue;
  }
  const family = familyFor(row.Type);
  const primaryCatalogId = formatCatalogId(row.Name);
  if (!primaryCatalogId) throw new Error("Selected OpenNGC row has no primary identifier.");
  const commonNames = splitList(row["Common names"]);
  const identifiers = splitList(row.Identifiers).filter((identifier) => identifier.length <= 72).slice(0, 12);
  const crossIds = [...formatCrossIds("NGC", row.NGC), ...formatCrossIds("IC", row.IC)];
  const catalogIds = Array.from(new Set([primaryCatalogId, messier, ...crossIds].filter(Boolean)));
  const legacyId = LEGACY_IDS[row.Name] ?? (messierNumber ? LEGACY_IDS[`M${String(messierNumber).padStart(3, "0")}`] : undefined);
  const id = `deep:${family}:${legacyId ?? `opengc-${slugify(row.Name)}`}`;
  const importance = importanceFor({ messier, apparentMagnitude, majorAxisArcMin, commonNames });
  selected.push({
    id,
    sourceName: row.Name,
    name: commonNames[0] ?? primaryCatalogId,
    family,
    typeCode: row.Type,
    typeLabel: TYPE_LABELS[row.Type],
    objectClass: objectClassFor(row),
    raDeg,
    decDeg,
    constellation: CONSTELLATIONS[row.Const] ?? row.Const,
    constellationCode: row.Const,
    majorAxisArcMin,
    minorAxisArcMin: numeric(row.MinAx),
    positionAngleDeg: numeric(row.PosAng),
    apparentMagnitude,
    apparentMagnitudeBand,
    magnitudeB,
    magnitudeV,
    surfaceBrightness: numeric(row.SurfBr),
    hubbleType: clean(row.Hubble),
    radialVelocityKmS: numeric(row.RadVel),
    redshift: numeric(row.Redshift),
    messier,
    catalogIds,
    aliases: Array.from(new Set([...commonNames, ...catalogIds, row.Name, ...identifiers])).slice(0, 24),
    sourceCodes: clean(row.Sources),
    importance,
  });
}
selected.sort((left, right) => left.raDeg - right.raDeg || left.sourceName.localeCompare(right.sourceName));
const ids = new Set(selected.map((object) => object.id));
if (ids.size !== selected.length) throw new Error("OpenNGC selection produced non-unique SpaceViewer object IDs.");

const chunkOutputs = [];
for (let index = 0; index < CHUNK_COUNT; index += 1) {
  const raMinDeg = index * CHUNK_WIDTH_DEG;
  const raMaxDeg = raMinDeg + CHUNK_WIDTH_DEG;
  const objects = selected.filter((object) => object.raDeg >= raMinDeg && object.raDeg < raMaxDeg);
  const id = `ra-${String(index).padStart(2, "0")}`;
  const filename = `${id}.json`;
  const familyCounts = Object.fromEntries(["galaxy", "nebula", "cluster"].map((family) => [family, objects.filter((object) => object.family === family).length]));
  const buffer = Buffer.from(stableJson({
    schemaVersion: 1,
    catalogId: receipt.catalog.id,
    chunkId: id,
    skyBounds: { frame: "J2000", raMinDeg, raMaxDeg },
    objectCount: objects.length,
    familyCounts,
    objects,
    licence: { id: "CC-BY-SA-4.0", adaptation: true },
  }));
  chunkOutputs.push({
    path: resolve(publicDirectory, filename),
    buffer,
    metadata: {
      id,
      label: `J2000 RA ${raMinDeg}–${raMaxDeg}°`,
      url: `/catalogs/openngc/${filename}`,
      raMinDeg,
      raMaxDeg,
      objectCount: objects.length,
      familyCounts,
      byteLength: buffer.byteLength,
      sha256: sha256Hex(buffer),
    },
  });
}

const familyCounts = Object.fromEntries(["galaxy", "nebula", "cluster"].map((family) => [family, selected.filter((object) => object.family === family).length]));
const typeCounts = Object.fromEntries(Array.from(ACCEPTED_TYPES).sort().map((type) => [type, selected.filter((object) => object.typeCode === type).length]));
const manifest = {
  schemaVersion: 1,
  catalog: {
    id: receipt.catalog.id,
    version: receipt.catalog.releaseTag,
    releaseCommit: receipt.catalog.releaseCommit,
    title: receipt.catalog.title,
    retrievedAt: receipt.catalog.retrievedAt,
    repositoryUrl: receipt.catalog.repositoryUrl,
    releaseUrl: receipt.catalog.releaseUrl,
    doi: receipt.catalog.doi,
    creator: receipt.catalog.creator,
    credit: receipt.catalog.credit,
    sourceBoundary: receipt.catalog.sourceBoundary,
  },
  licence: {
    id: receipt.catalog.licenceId,
    url: receipt.catalog.licenceUrl,
    sourceLicencePath: "catalog-source/openngc-v20260501/CC-BY-SA-4.0.txt",
    adaptationNotice: "SpaceViewer filtered, normalized, classified and chunked this OpenNGC-derived dataset. The derived catalogue assets in /catalogs/openngc are offered under CC BY-SA 4.0; SpaceViewer's unrelated source code and assets are not relicensed by that statement.",
  },
  selection: {
    predicate: `Accepted deep-sky type with finite J2000 RA/Dec and (Messier cross-reference OR preferred V/B apparent magnitude <= ${MAX_MAGNITUDE} OR major axis >= ${MIN_MAJOR_AXIS_ARCMIN} arcmin), excluding galaxies represented by the physical LVDB Local Group layer`,
    acceptedTypes: Array.from(ACCEPTED_TYPES),
    sourceRecordCount: sourceRows.length,
    acceptedTypeCount,
    coordinateRejectedCount,
    thresholdRejectedCount,
    localGroupExcludedCount,
    objectCount: selected.length,
    familyCounts,
    typeCounts,
    boundary: "This is a display-oriented OpenNGC subset, not a complete or statistically uniform deep-sky census. Catalogue field availability, contributing surveys, magnitude bands, angular-size sources and the selection thresholds vary by object.",
  },
  coordinates: {
    sourceFrame: "J2000 equatorial RA/Dec",
    epoch: "J2000",
    sceneTransform: `Direction-preserving Cartesian projection on a fixed ${ANGULAR_SHELL_RADIUS}-scene-unit sphere`,
    angularShellRadiusSceneUnits: ANGULAR_SHELL_RADIUS,
    placementBoundary: `OpenNGC supplies authoritative J2000 sky direction but not a homogeneous physical distance for this selection. Objects are therefore placed on a fixed ${ANGULAR_SHELL_RADIUS}-unit angular guide sphere; radial separation is intentionally undefined and must not be interpreted as distance.`,
  },
  parameters: {
    magnitudeRule: "Use V magnitude where present, otherwise B magnitude; the displayed band is preserved per object.",
    sourceBoundary: receipt.catalog.sourceBoundary,
  },
  chunks: chunkOutputs.map((chunk) => chunk.metadata),
  build: {
    scriptVersion: SCRIPT_VERSION,
    sourceSha256: Object.fromEntries(csvDefinitions.map((definition) => [definition.sourceName, definition.uncompressedSha256])),
    chunking: `${CHUNK_COUNT} independent J2000 right-ascension sectors of ${CHUNK_WIDTH_DEG} degrees`,
    objectCount: selected.length,
  },
};
const manifestBuffer = Buffer.from(stableJson(manifest));
const outputs = [[manifestPath, manifestBuffer], ...chunkOutputs.map((chunk) => [chunk.path, chunk.buffer])];

if (checkOnly) {
  for (const [path, expected] of outputs) {
    const actual = await readFile(path).catch(() => null);
    if (!actual?.equals(expected)) throw new Error(`OpenNGC generated asset is stale: ${path}`);
  }
  console.log(`OpenNGC catalogue check passed: ${selected.length.toLocaleString()} objects in ${CHUNK_COUNT} chunks`);
} else {
  await mkdir(publicDirectory, { recursive: true });
  await Promise.all(outputs.map(([path, content]) => writeFile(path, content)));
  console.log(`OpenNGC catalogue built: ${selected.length.toLocaleString()} objects in ${CHUNK_COUNT} chunks`);
}
