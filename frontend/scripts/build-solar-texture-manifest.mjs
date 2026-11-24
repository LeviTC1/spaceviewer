import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const textureDirectory = resolve(frontendDirectory, "public/solar-textures");
const inventoryPath = resolve(frontendDirectory, "catalog-source/solar-texture-inventory.json");
const manifestPath = resolve(textureDirectory, "manifest.json");
const checkOnly = process.argv.includes("--check");

const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
if (inventory.schema !== "spaceviewer-solar-texture-inventory-v2") {
  throw new Error(`Unsupported solar texture inventory schema: ${inventory.schema ?? "missing"}`);
}

const sourcesById = new Map(inventory.sources.map((source) => [source.id, source]));
const transformsById = new Map(inventory.transforms.map((transform) => [transform.id, transform]));
if (sourcesById.size !== inventory.sources.length || transformsById.size !== inventory.transforms.length) {
  throw new Error("Solar texture inventory source and transform identifiers must be unique.");
}

for (const source of inventory.sources) {
  if (source.sourceStatus !== "verified" || !["verified", "not-applicable"].includes(source.licenceStatus)) {
    throw new Error(`Solar texture source ${source.id} is not cleared by a recorded source/licence receipt.`);
  }
  if (source.sourceFile) {
    const buffer = await readFile(resolve(frontendDirectory, source.sourceFile));
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== source.sourceSha256) {
      throw new Error(`Pinned source file hash mismatch for ${source.sourceFile}.`);
    }
  }
}

const readPngDimensions = (buffer) => {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature || buffer.length < 24) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const readJpegDimensions = (buffer) => {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && offset + 7 < buffer.length) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    if (segmentLength < 2) break;
    offset += segmentLength;
  }
  return null;
};

const classifyAsset = (filename) => {
  if (filename.includes("earth_daymap")) return { body: "earth", role: "surface-colour" };
  if (filename.includes("ring_alpha")) return { body: "saturn", role: "ring-colour-alpha" };
  if (filename.includes("earth_clouds")) return { body: "earth", role: "cloud-colour-alpha" };
  if (filename.includes("earth_lights")) return { body: "earth", role: "night-emission" };
  if (filename.includes("earth_specular")) return { body: "earth", role: "surface-specular-mask" };
  if (filename.includes("earth_atmos")) return { body: "earth", role: "atmosphere-colour-overlay" };
  if (filename === "noise.png") return { body: "gas-giants", role: "artistic-detail-overlay" };
  if (filename.includes("moon")) return { body: "moon", role: "surface-colour" };
  if (filename.includes("sun")) return { body: "sun", role: "stellar-surface-colour" };
  const body = filename.match(/2k_([a-z]+?)(?:_surface)?\./)?.[1] ?? "unknown";
  return { body, role: "surface-colour" };
};

const entries = [];
for (const quality of ["high", "perf"]) {
  const qualityDirectory = resolve(textureDirectory, quality);
  const filenames = (await readdir(qualityDirectory)).sort();
  for (const filename of filenames) {
    if (!/[.](?:jpe?g|png)$/i.test(filename)) continue;
    const absolutePath = resolve(qualityDirectory, filename);
    const buffer = await readFile(absolutePath);
    const extension = extname(filename).toLowerCase();
    const dimensions = extension === ".png" ? readPngDimensions(buffer) : readJpegDimensions(buffer);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
      throw new Error(`Could not read dimensions for ${absolutePath}`);
    }
    const classification = classifyAsset(filename);
    const publicPath = `/solar-textures/${quality}/${filename}`;
    const inventoryKey = `${quality}/${filename}`;
    const receipt = inventory.assets[inventoryKey];
    if (!receipt) throw new Error(`Missing provenance receipt for ${inventoryKey}.`);
    const source = sourcesById.get(receipt.sourceId);
    const transform = transformsById.get(receipt.transformId);
    if (!source) throw new Error(`Unknown source ${receipt.sourceId} for ${inventoryKey}.`);
    if (!transform) throw new Error(`Unknown transform ${receipt.transformId} for ${inventoryKey}.`);
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (digest !== receipt.expectedSha256) {
      throw new Error(
        `Texture hash mismatch for ${inventoryKey}: expected ${receipt.expectedSha256}, received ${digest}. Rebuild or review the asset receipt.`,
      );
    }
    if (receipt.transformId === "identity-byte-copy" && receipt.sourceSha256 !== digest) {
      throw new Error(`Identity receipt for ${inventoryKey} is not byte-identical to its recorded source hash.`);
    }
    entries.push({
      id: `${quality}-${filename.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`,
      path: publicPath,
      quality: quality === "perf" ? "performance" : "high",
      body: classification.body,
      role: classification.role,
      width: dimensions.width,
      height: dimensions.height,
      bytes: buffer.byteLength,
      mimeType: extension === ".png" ? "image/png" : "image/jpeg",
      sha256: digest,
      runtimeStatus: filename.includes("earth_atmos") ? "unreferenced" : "referenced",
      sourceStatus: source.sourceStatus,
      licenceStatus: source.licenceStatus,
      sourceId: source.id,
      author: source.author,
      sourcePage: source.sourcePage,
      sourceUrl: receipt.sourceUrl ?? null,
      sourceSha256: receipt.sourceSha256 ?? null,
      licence: source.licence,
      licenceUrl: source.licenceUrl,
      retrievedAt: source.retrievedAt,
      attribution: source.attribution,
      derivedFrom: receipt.derivedFrom ? `/solar-textures/${receipt.derivedFrom}` : null,
      transform: {
        id: transform.id,
        tool: transform.tool,
        description: transform.description,
      },
    });
  }
}

const entryKeys = new Set(entries.map((entry) => entry.path.replace("/solar-textures/", "")));
const receiptKeys = Object.keys(inventory.assets);
const extraReceipts = receiptKeys.filter((key) => !entryKeys.has(key));
if (extraReceipts.length > 0) {
  throw new Error(`Provenance receipts reference missing texture files: ${extraReceipts.join(", ")}`);
}
for (const [key, receipt] of Object.entries(inventory.assets)) {
  if (receipt.derivedFrom && !entryKeys.has(receipt.derivedFrom)) {
    throw new Error(`Texture receipt ${key} derives from missing asset ${receipt.derivedFrom}.`);
  }
}

const hashes = new Map();
for (const entry of entries) {
  const paths = hashes.get(entry.sha256) ?? [];
  paths.push(entry.path);
  hashes.set(entry.sha256, paths);
}

const duplicateGroups = [...hashes.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([sha256, paths]) => ({ sha256, paths: paths.sort() }))
  .sort((a, b) => a.paths[0].localeCompare(b.paths[0]));

const manifest = {
  schema: "spaceviewer-solar-texture-manifest-v2",
  catalogId: inventory.id,
  version: inventory.version,
  generatedBy: relative(frontendDirectory, fileURLToPath(import.meta.url)),
  assetRoot: inventory.assetRoot,
  assetCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  provenance: {
    sourceStatus: inventory.sourceStatus,
    licenceStatus: inventory.licenceStatus,
    note: inventory.note,
    renderingStatus: inventory.renderingStatus,
    attributionHref: inventory.attributionHref,
    sourceCount: inventory.sources.length,
    sources: inventory.sources,
  },
  qualityCounts: {
    high: entries.filter((entry) => entry.quality === "high").length,
    performance: entries.filter((entry) => entry.quality === "performance").length,
  },
  unreferencedAssets: entries.filter((entry) => entry.runtimeStatus === "unreferenced").map((entry) => entry.path),
  duplicateGroups,
  assets: entries,
};

const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (checkOnly) {
  const current = await readFile(manifestPath, "utf8").catch(() => "");
  if (current !== output) {
    throw new Error(`Solar texture manifest is missing or stale. Run: npm run textures:build`);
  }
  console.log(`Solar texture manifest verified: ${entries.length} assets, ${manifest.totalBytes} bytes.`);
} else {
  await writeFile(manifestPath, output, "utf8");
  console.log(`Wrote ${manifestPath}: ${entries.length} assets, ${manifest.totalBytes} bytes.`);
}
