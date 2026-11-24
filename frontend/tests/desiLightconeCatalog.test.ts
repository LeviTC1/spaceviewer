import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeDesiLightconeBinary,
  DESI_LIGHTCONE_CATALOG_METADATA,
} from "../src/lib/catalog/desiLightconeCatalog";

const binaryPath = resolve(process.cwd(), "public/catalogs/desi-lightcone/galaxies.svlc");

describe("DESI DR1 measured redshift light-cone catalogue", () => {
  it("matches the versioned binary receipt and source selection", async () => {
    const binary = await readFile(binaryPath);
    expect(binary.byteLength).toBe(DESI_LIGHTCONE_CATALOG_METADATA.binary.byteLength);
    expect(createHash("sha256").update(binary).digest("hex")).toBe(DESI_LIGHTCONE_CATALOG_METADATA.binary.sha256);
    expect(DESI_LIGHTCONE_CATALOG_METADATA.selection.sourceRecordCount).toBe(217_614);
    expect(DESI_LIGHTCONE_CATALOG_METADATA.selection.selectedRecordCount).toBe(22_648);
    expect(DESI_LIGHTCONE_CATALOG_METADATA.catalog.licenceId).toBe("CC-BY-4.0");
  });

  it("decodes measured coordinates, redshifts, IDs, and selection weights", async () => {
    const binary = await readFile(binaryPath);
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    const decoded = decodeDesiLightconeBinary(arrayBuffer);
    expect(decoded.recordCount).toBe(22_648);
    expect(decoded.positionsScene).toHaveLength(decoded.recordCount * 3);
    expect(decoded.colors).toHaveLength(decoded.recordCount * 3);
    expect(decoded.targetIds).toHaveLength(decoded.recordCount);
    expect([...decoded.redshifts].every((redshift) => redshift >= 0.1 && redshift <= 0.4)).toBe(true);
    expect([...decoded.completenessWeights].every((weight) => Number.isFinite(weight) && weight > 0)).toBe(true);
  });

  it("uses deterministic catalogue prefixes as unbiased quality LODs", async () => {
    const binary = await readFile(binaryPath);
    const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    const low = decodeDesiLightconeBinary(arrayBuffer, 1_024);
    const high = decodeDesiLightconeBinary(arrayBuffer, 4_096);
    expect(low.recordCount).toBe(1_024);
    expect(high.recordCount).toBe(4_096);
    expect([...high.targetIds.slice(0, low.recordCount)]).toEqual([...low.targetIds]);
    expect([...high.positionsScene.slice(0, low.positionsScene.length)]).toEqual([...low.positionsScene]);
  });
});
