import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeMilkyWayTracerBinary,
  MILKY_WAY_CATALOG_METADATA,
} from "../src/lib/catalog/milkyWayTracerCatalog";

const binaryPath = resolve(process.cwd(), "public/catalogs/milky-way/tracers.svmw");

describe("Reid et al. Milky Way tracer catalogue", () => {
  it("carries an explicit source, selection, uncertainty, and usage contract", () => {
    const metadata = MILKY_WAY_CATALOG_METADATA;
    expect(metadata.catalog.sourceCatalogId).toBe("J/ApJ/885/131");
    expect(metadata.catalog.sourceCatalogDoi).toBe("10.26093/cds/vizier.18850131");
    expect(metadata.catalog.licenceStatus).toBe("verified-scientific-use-commercial-rights-source-dependent");
    expect(metadata.selection.sourceRecordCount).toBe(199);
    expect(metadata.selection.selectedRecordCount).toBe(199);
    expect(metadata.uncertainty.lowSignalCount).toBe(9);
    expect(metadata.uncertainty.unboundedReciprocalSpanCount).toBe(1);
    expect(metadata.armModel.segments).toHaveLength(7);
    expect(metadata.armModel.segments.every((segment) => segment.widthErrorKpc > 0)).toBe(true);
  });

  it("decodes the cacheable binary into finite Galactic positions and uncertainty segments", async () => {
    const file = await readFile(binaryPath);
    const arrayBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const catalog = decodeMilkyWayTracerBinary(arrayBuffer);

    expect(catalog.recordCount).toBe(199);
    expect(catalog.names).toHaveLength(199);
    expect(catalog.names[0]).toBe("G305.20+00.01");
    expect(catalog.positionsKpc).toHaveLength(199 * 3);
    expect(catalog.uncertaintySegmentsKpc).toHaveLength(199 * 6);
    expect([...catalog.positionsKpc].every(Number.isFinite)).toBe(true);
    expect([...catalog.uncertaintySegmentsKpc].every(Number.isFinite)).toBe(true);
    expect([...catalog.segmentIndices].filter((value) => value === 255).length).toBeGreaterThan(0);
    expect(Math.hypot(...catalog.positionsKpc.slice(0, 3))).toBeGreaterThan(0);
  });

  it("rejects a binary whose versioned header has been tampered with", async () => {
    const file = await readFile(binaryPath);
    const copy = Uint8Array.from(file);
    copy[0] = "X".charCodeAt(0);
    expect(() => decodeMilkyWayTracerBinary(copy.buffer)).toThrow(/header/i);
  });
});
