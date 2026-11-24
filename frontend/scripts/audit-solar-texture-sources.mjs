import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = resolve(scriptDirectory, "..");
const inventory = JSON.parse(
  await readFile(resolve(frontendDirectory, "catalog-source/solar-texture-inventory.json"), "utf8"),
);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const directReceipts = Object.entries(inventory.assets).filter(
  ([, receipt]) => receipt.transformId === "identity-byte-copy",
);

for (const [path, receipt] of directReceipts) {
  const response = await fetch(receipt.sourceUrl, {
    headers: { "User-Agent": "SpaceViewer astronomical texture provenance audit" },
  });
  if (!response.ok) throw new Error(`Source audit request failed for ${path}: HTTP ${response.status}.`);
  const sourceBuffer = Buffer.from(await response.arrayBuffer());
  const sourceHash = sha256(sourceBuffer);
  if (sourceHash !== receipt.sourceSha256) {
    throw new Error(
      `Upstream source changed for ${path}: expected ${receipt.sourceSha256}, received ${sourceHash}. Review before updating the receipt.`,
    );
  }
  const localBuffer = await readFile(resolve(frontendDirectory, "public/solar-textures", path));
  if (!sourceBuffer.equals(localBuffer)) throw new Error(`Local identity asset is not byte-identical to ${receipt.sourceUrl}.`);
  console.log(`Verified ${path} against ${receipt.sourceUrl}`);
}

console.log(`Solar texture source audit passed for ${directReceipts.length} byte-identical upstream assets.`);
