import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(frontendDirectory, "catalog-source/solar-textures");
const checkOnly = process.argv.includes("--check");

const NASA_PLUTO_SOURCE = {
  filename: "nasa-pluto-global-color-map.jpg",
  url: "https://assets.science.nasa.gov/dynamicimage/assets/science/psd/solar/2023/09/p/l/pluto_color_mapmosaic.jpg?crop=faces%2Cfocalpoint&fit=clip&h=2963&w=5926",
  sha256: "1c13296bb0d2678224f3579033c4fe4cd302dc2a0afa02c94a0ff1baa56d53c9",
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

const response = await fetch(NASA_PLUTO_SOURCE.url, {
  headers: { "User-Agent": "SpaceViewer astronomical texture provenance builder" },
});
if (!response.ok) {
  throw new Error(`NASA Pluto source request failed with HTTP ${response.status}.`);
}

const sourceBuffer = Buffer.from(await response.arrayBuffer());
const receivedHash = sha256(sourceBuffer);
if (receivedHash !== NASA_PLUTO_SOURCE.sha256) {
  throw new Error(
    `NASA Pluto source hash changed: expected ${NASA_PLUTO_SOURCE.sha256}, received ${receivedHash}. Review the upstream asset before rebuilding.`,
  );
}

const destination = resolve(sourceDirectory, NASA_PLUTO_SOURCE.filename);
if (checkOnly) {
  const current = await readFile(destination).catch(() => null);
  if (!current || sha256(current) !== NASA_PLUTO_SOURCE.sha256) {
    throw new Error("Pinned NASA Pluto source is missing or stale. Run: npm run textures:fetch");
  }
  console.log(`Solar texture source verified: ${NASA_PLUTO_SOURCE.filename} (${sourceBuffer.byteLength} bytes).`);
} else {
  await mkdir(sourceDirectory, { recursive: true });
  await writeFile(destination, sourceBuffer);
  console.log(`Wrote ${destination}: ${sourceBuffer.byteLength} bytes.`);
}
