import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const manifestUrl = new URL("../public/data/solar/small-bodies/source-manifest.json", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
};

const failures = [];
for (const object of manifest.objects) {
  const response = await fetch(object.queryUrl, {
    headers: { "user-agent": "SpaceViewer source receipt verifier" },
  });
  if (!response.ok) {
    failures.push(`${object.id}: HTTP ${response.status}`);
    continue;
  }
  const source = await response.json();
  const canonicalJson = JSON.stringify(canonicalize(source));
  const sha256 = createHash("sha256").update(canonicalJson).digest("hex");
  if (sha256 !== object.upstreamCanonicalJsonSha256) {
    failures.push(
      `${object.id}: source changed (${sha256}; pinned ${object.upstreamCanonicalJsonSha256})`,
    );
  } else {
    process.stdout.write(`${object.id}: verified ${sha256}\n`);
  }
}

if (failures.length) {
  throw new Error(`Small-body source receipt check failed:\n${failures.join("\n")}`);
}
