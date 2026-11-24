import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const receiptPath = resolve(root, "orientation-source/naif-pck00011.receipt.json");
const implementationPath = resolve(root, "src/domain/solar/controlledSatelliteOrientation.ts");
const manifestPath = resolve(root, "public/orientation/satellites/manifest.json");
const checkOnly = process.argv.includes("--check");

const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
const implementation = await readFile(implementationPath, "utf8");
const expectedBodies = ["moon", "io", "europa", "ganymede", "callisto"];

if (receipt.schemaVersion !== 1) throw new Error("Unsupported satellite-orientation receipt schema.");
if (receipt.source?.fileName !== "pck00011.tpc") throw new Error("Unexpected NAIF PCK source version.");
if (!/^[a-f0-9]{64}$/.test(receipt.source?.sha256 ?? "")) throw new Error("Invalid source SHA-256 receipt.");
if (JSON.stringify(receipt.controlledBodies) !== JSON.stringify(expectedBodies)) {
  throw new Error("Controlled satellite-orientation body list drifted.");
}
if (!implementation.includes(receipt.source.sourceUrl)) {
  throw new Error("Runtime orientation source URL drifted from the receipt.");
}
for (const bodyId of expectedBodies) {
  if (!implementation.includes(`\"${bodyId}\"`)) {
    throw new Error(`Runtime orientation implementation no longer includes ${bodyId}.`);
  }
}

const manifest = {
  schemaVersion: 1,
  id: receipt.id,
  generatedBy: "spaceviewer-satellite-orientation-manifest-v1",
  source: receipt.source,
  controlledBodies: receipt.controlledBodies,
  models: receipt.models,
  runtime: receipt.spaceViewerContract,
  attribution: "NASA/JPL Navigation and Ancillary Information Facility generic PCK pck00011.tpc. Numerical rotational elements are transcribed with source citation."
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (checkOnly) {
  const existing = await readFile(manifestPath, "utf8");
  if (existing !== serialized) {
    throw new Error("Satellite-orientation manifest is stale. Run npm run orientation:satellites:build.");
  }
  console.log(`Satellite-orientation check passed: ${manifest.controlledBodies.length} bodies from ${manifest.source.fileName}`);
} else {
  await writeFile(manifestPath, serialized);
  console.log(`Wrote ${manifestPath}: ${manifest.controlledBodies.length} controlled bodies`);
}
