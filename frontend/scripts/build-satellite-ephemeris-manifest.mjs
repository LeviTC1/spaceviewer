import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const receiptPath = resolve(root, "ephemeris-source/astronomy-engine-2.1.19.receipt.json");
const lockPath = resolve(root, "package-lock.json");
const manifestPath = resolve(root, "public/ephemerides/satellites/manifest.json");
const checkOnly = process.argv.includes("--check");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const receipt = await readJson(receiptPath);
const lock = await readJson(lockPath);
const installed = lock.packages?.["node_modules/astronomy-engine"];

if (!installed) throw new Error("package-lock.json does not contain astronomy-engine.");
if (installed.version !== receipt.package.version) throw new Error("Astronomy Engine version drifted from its receipt.");
if (installed.resolved !== receipt.package.npmTarballUrl) throw new Error("Astronomy Engine tarball URL drifted from its receipt.");
if (installed.integrity !== receipt.package.npmIntegrity) throw new Error("Astronomy Engine npm integrity drifted from its receipt.");
if (installed.license !== receipt.package.license) throw new Error("Astronomy Engine licence metadata drifted from its receipt.");

for (const definition of receipt.verifiedInstalledFiles) {
  const bytes = await readFile(resolve(root, definition.path));
  if (bytes.byteLength !== definition.bytes) throw new Error(`${definition.path} byte length drifted.`);
  if (sha256(bytes) !== definition.sha256) throw new Error(`${definition.path} SHA-256 drifted.`);
}

const manifest = {
  schemaVersion: 1,
  id: receipt.id,
  generatedBy: "spaceviewer-satellite-ephemeris-manifest-v1",
  package: {
    name: receipt.package.name,
    version: receipt.package.version,
    releaseTag: receipt.package.releaseTag,
    releaseCommit: receipt.package.releaseCommit,
    releaseUrl: receipt.package.releaseUrl,
    repository: receipt.package.repository,
    creator: receipt.package.creator,
    license: receipt.package.license,
    licenseUrl: receipt.package.licenseUrl,
    npmIntegrity: receipt.package.npmIntegrity
  },
  controlledBodies: receipt.models.flatMap((model) => model.bodies),
  models: receipt.models,
  runtime: receipt.spaceViewerContract,
  validation: receipt.upstreamValidation,
  attribution: "Astronomy Engine v2.1.19 by Donald Cross, used under the MIT License. Galilean positions are based on the IMCCE L1.2 analytical theory."
};

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (checkOnly) {
  const existing = await readFile(manifestPath, "utf8");
  if (existing !== serialized) throw new Error("Satellite ephemeris manifest is stale. Run npm run ephemeris:satellites:build.");
  console.log(`Satellite ephemeris check passed: ${manifest.controlledBodies.length} controlled bodies from ${manifest.package.name} ${manifest.package.version}`);
} else {
  await writeFile(manifestPath, serialized);
  console.log(`Wrote ${manifestPath}: ${manifest.controlledBodies.length} controlled bodies`);
}
