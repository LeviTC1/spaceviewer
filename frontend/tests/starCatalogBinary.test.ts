import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { StarCatalogLoader } from "../src/lib/catalog/StarCatalogLoader";
import {
  decodeStarCatalogBinary,
  validateStarCatalogChunkMetadata,
  validateStarCatalogManifest,
} from "../src/lib/catalog/starCatalogBinary";
import { propagateGaiaSixParameterCovariance } from "../src/lib/catalog/starCatalogPropagation";
import type { DecodedStarCatalogChunk, StarCatalogManifestChunk } from "../src/lib/catalog/starCatalogTypes";

const catalogDirectory = resolve(process.cwd(), "public/catalogs/nearby-stars");
const PARSEC_TO_LIGHT_YEAR = 3.2615637771674333;

const readFixture = (filename: string) => readFile(resolve(catalogDirectory, filename));

const readManifest = async () =>
  validateStarCatalogManifest(JSON.parse(await readFile(resolve(catalogDirectory, "manifest.json"), "utf8")));

const decodeFixture = async (definition: StarCatalogManifestChunk) => {
  const manifest = await readManifest();
  const metadata = validateStarCatalogChunkMetadata(
    JSON.parse(await readFile(resolve(catalogDirectory, definition.metadataUrl.replace("./", "")), "utf8")),
    definition,
    manifest,
  );
  const binary = await readFixture(definition.binaryUrl.replace("./", ""));
  const arrayBuffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
  return decodeStarCatalogBinary(arrayBuffer, definition, metadata);
};

const sourceIdAt = (chunk: DecodedStarCatalogChunk, index: number) =>
  (BigInt(chunk.columns.sourceIdHigh[index]) << 32n) | BigInt(chunk.columns.sourceIdLow[index]);

describe("Gaia DR3 star catalogue binary format", () => {
  it("validates authoritative provenance, selection, and aggregate metrics", async () => {
    const manifest = await readManifest();
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.format).toBe("spaceviewer-star-columns-v3");
    expect(manifest.build.recordCount).toBe(15_448);
    expect(manifest.build.navigationRecordCount).toBe(832);
    expect(manifest.build.chunkCount).toBe(49);
    expect(manifest.build.totalBinaryBytes).toBe(2_295_712);
    expect(manifest.build.spatialPartition).toMatchObject({
      level: 1,
      cellCount: 48,
      sourceIdRightShiftBits: 57,
      priorityMetric: "descending-dot-product-of-live-camera-forward-and-source-record-centroid-icrs",
    });
    expect(manifest.catalog.referenceFrame).toBe("heliocentric-icrs-cartesian");
    expect(manifest.catalog.epoch).toEqual({ kind: "julian-year", value: "J2016.0", scale: "TCB" });
    expect(manifest.catalog.provenance.licenceStatus).toBe("verified");
    expect(manifest.catalog.provenance.credit).toBe("ESA/Gaia/DPAC");
    expect(manifest.build.propagation).toMatchObject({
      referenceEpochJulianYear: 2016,
      minimumJulianYear: 1900,
      maximumJulianYear: 2100,
      model: "uniform-rectilinear-space-motion",
      radialVelocityTreatment: "gaia-dr3-when-available-zero-fallback",
      radialVelocityRecordCount: 13_492,
      radialVelocityFallbackRecordCount: 1_956,
      covarianceModel: "full-six-parameter-linearized-jacobian",
      radialVelocityCovarianceTreatment: "independent-spectroscopic-uncertainty-when-available-conditional-zero-otherwise",
    });
    expect(manifest.query.selection).toMatchObject({
      nominalMaximumDistanceParsec: 100,
      parallaxSignalToNoiseMinimum: 10,
      maximumApparentMagnitudeG: 9,
      excludesDuplicatedSourceFlag: true,
    });
    expect(manifest.chunks.reduce((total, chunk) => total + chunk.recordCount, 0)).toBe(15_448);
    expect(manifest.chunks.reduce((total, chunk) => total + chunk.navigationRecordCount, 0)).toBe(832);
  });

  it("rejects a manifest that weakens the six-parameter covariance contract", async () => {
    const manifest = JSON.parse(await readFile(resolve(catalogDirectory, "manifest.json"), "utf8"));
    manifest.build.propagation.covarianceModel = "five-parameter-approximation";
    expect(() => validateStarCatalogManifest(manifest)).toThrow(/bounded propagation contract/i);
  });

  it("decodes Float64 positions, source identifiers, astrometry, and bounded navigation metadata", async () => {
    const manifest = await readManifest();
    const definition = manifest.chunks[0];
    const decoded = await decodeFixture(definition);

    expect(decoded.chunkId).toBe("bright-core-g6");
    expect(decoded.columns.x).toBeInstanceOf(Float64Array);
    expect(decoded.columns.sourceIdHigh).toBeInstanceOf(Uint32Array);
    expect(decoded.columns.parallaxErrorMas).toBeInstanceOf(Float32Array);
    expect(decoded.columns.pmRaMasYr).toBeInstanceOf(Float32Array);
    expect(decoded.columns.radialVelocityKmS).toBeInstanceOf(Float32Array);
    expect(decoded.columns.raPmRaCorr).toBeInstanceOf(Float32Array);
    expect(decoded.renderPositions).toBeInstanceOf(Float32Array);
    expect(decoded.metadata.navigationRecords).toHaveLength(243);
    expect(decoded.metadata.navigationRecords.length).toBeLessThan(decoded.recordCount);
    expect(decoded.renderPositions.length).toBe(decoded.recordCount * 3);
    expect(decoded.renderEpochJulianYear).toBe(2016);

    const navigationRecord = decoded.metadata.navigationRecords[0];
    expect(sourceIdAt(decoded, navigationRecord.binaryIndex).toString()).toBe(navigationRecord.sourceId);
    expect(decoded.columns.apparentMagnitudeG[navigationRecord.binaryIndex]).toBeLessThanOrEqual(6);
    expect(decoded.columns.parallaxErrorMas[navigationRecord.binaryIndex] / decoded.columns.parallaxMas[navigationRecord.binaryIndex]).toBeLessThanOrEqual(0.1001);
    expect(decoded.columns.distanceLy[navigationRecord.binaryIndex]).toBeCloseTo(
      (1000 / decoded.columns.parallaxMas[navigationRecord.binaryIndex]) * PARSEC_TO_LIGHT_YEAR,
      4,
    );
    const radialCount = (await Promise.all(manifest.chunks.map(decodeFixture))).reduce(
      (total, chunk) => total + chunk.columns.radialVelocityKmS.filter(Number.isFinite).length,
      0,
    );
    expect(radialCount).toBe(manifest.build.propagation.radialVelocityRecordCount);
  });

  it("produces finite positive six-parameter confidence axes for every Gaia navigation record", async () => {
    const manifest = await readManifest();
    const chunks = await Promise.all(manifest.chunks.map(decodeFixture));
    for (const chunk of chunks) {
      for (const metadata of chunk.metadata.navigationRecords) {
        const index = metadata.binaryIndex;
        const finiteOrUndefined = (value: number) => Number.isFinite(value) ? value : undefined;
        const covariance = propagateGaiaSixParameterCovariance({
          targetJulianYear: 2100,
          raDeg: chunk.columns.raDeg[index],
          decDeg: chunk.columns.decDeg[index],
          parallaxMas: chunk.columns.parallaxMas[index],
          pmRaMasYr: chunk.columns.pmRaMasYr[index],
          pmDecMasYr: chunk.columns.pmDecMasYr[index],
          radialVelocityKmS: finiteOrUndefined(chunk.columns.radialVelocityKmS[index]),
          radialVelocityErrorKmS: finiteOrUndefined(chunk.columns.radialVelocityErrorKmS[index]),
          raErrorMas: chunk.columns.raErrorMas[index],
          decErrorMas: chunk.columns.decErrorMas[index],
          parallaxErrorMas: chunk.columns.parallaxErrorMas[index],
          pmRaErrorMasYr: chunk.columns.pmRaErrorMasYr[index],
          pmDecErrorMasYr: chunk.columns.pmDecErrorMasYr[index],
          raDecCorr: chunk.columns.raDecCorr[index],
          raParallaxCorr: chunk.columns.raParallaxCorr[index],
          raPmRaCorr: chunk.columns.raPmRaCorr[index],
          raPmDecCorr: chunk.columns.raPmDecCorr[index],
          decParallaxCorr: chunk.columns.decParallaxCorr[index],
          decPmRaCorr: chunk.columns.decPmRaCorr[index],
          decPmDecCorr: chunk.columns.decPmDecCorr[index],
          parallaxPmRaCorr: chunk.columns.parallaxPmRaCorr[index],
          parallaxPmDecCorr: chunk.columns.parallaxPmDecCorr[index],
          pmRaPmDecCorr: chunk.columns.pmRaPmDecCorr[index],
        });
        const axes = [
          covariance.positionEllipsoid.semiMajorLy,
          covariance.positionEllipsoid.semiIntermediateLy,
          covariance.positionEllipsoid.semiMinorLy,
        ];
        if (!axes.every((value) => Number.isFinite(value) && value > 0)) {
          throw new Error(
            `Gaia ${metadata.sourceId} produced invalid confidence axes: ${axes.join(", ")}; matrix=${[...covariance.positionCovarianceLy2].join(",")}`,
          );
        }
        expect(covariance.angularEllipse.semiMajorMas).toBeGreaterThan(0);
        expect(covariance.angularEllipse.semiMinorMas).toBeGreaterThan(0);
      }
    }
  });

  it("partitions the bright core and all 48 nested HEALPix level-one cells without gaps", async () => {
    const manifest = await readManifest();
    const chunks = await Promise.all(manifest.chunks.map(decodeFixture));
    expect(chunks[0].columns.apparentMagnitudeG.every((magnitude) => magnitude <= 6)).toBe(true);
    expect(manifest.chunks[0].spatialCell).toBeNull();
    chunks.slice(1).forEach((chunk, chunkOffset) => {
      const expectedHealpix = BigInt(Number(chunk.chunkId.replace("sky-", "")));
      const spatialCell = manifest.chunks[chunkOffset + 1].spatialCell!;
      expect(spatialCell.level).toBe(1);
      expect(spatialCell.index).toBe(Number(expectedHealpix));
      expect(Math.hypot(
        spatialCell.recordCentroidUnitIcrs.x,
        spatialCell.recordCentroidUnitIcrs.y,
        spatialCell.recordCentroidUnitIcrs.z,
      )).toBeCloseTo(1, 10);
      for (let index = 0; index < chunk.recordCount; index += 1) {
        expect(chunk.columns.apparentMagnitudeG[index]).toBeGreaterThan(6);
        expect(sourceIdAt(chunk, index) >> 57n).toBe(expectedHealpix);
      }
    });
    expect(chunks.reduce((total, chunk) => total + chunk.recordCount, 0)).toBe(manifest.build.recordCount);
  });

  it("rejects corrupt magic and mismatched binary lengths", async () => {
    const manifest = await readManifest();
    const definition = manifest.chunks[0];
    const metadata = validateStarCatalogChunkMetadata(
      JSON.parse(await readFile(resolve(catalogDirectory, definition.metadataUrl.replace("./", "")), "utf8")),
      definition,
      manifest,
    );
    const binary = await readFixture(definition.binaryUrl.replace("./", ""));
    const corrupt = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
    new Uint8Array(corrupt)[0] = 0;
    expect(() => decodeStarCatalogBinary(corrupt, definition, metadata)).toThrow(/magic/i);
    expect(() => decodeStarCatalogBinary(new ArrayBuffer(128), definition, metadata)).toThrow(/length/i);
  });
});

describe("StarCatalogLoader", () => {
  it("loads independent chunks progressively in manifest priority order", async () => {
    const manifestBuffer = await readFixture("manifest.json");
    const manifest = validateStarCatalogManifest(JSON.parse(manifestBuffer.toString("utf8")));
    const fixtures = new Map<string, Uint8Array>();
    fixtures.set("manifest.json", manifestBuffer);
    for (const chunk of manifest.chunks) {
      fixtures.set(chunk.binaryUrl.replace("./", ""), await readFixture(chunk.binaryUrl.replace("./", "")));
      fixtures.set(chunk.metadataUrl.replace("./", ""), await readFixture(chunk.metadataUrl.replace("./", "")));
    }
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const filename = url.pathname.split("/").pop() ?? "";
      const fixture = fixtures.get(filename);
      return fixture ? new Response(fixture) : new Response("missing", { status: 404 });
    };
    const progress: number[] = [];
    const loader = new StarCatalogLoader({
      fetchImpl: fetchImpl as typeof fetch,
      workerFactory: undefined,
      maxMainThreadFallbackBytes: Number.POSITIVE_INFINITY,
    });
    const result = await loader.load("https://spaceviewer.test/catalogs/nearby-stars/manifest.json", {
      onChunk: (_chunk, state) => progress.push(state.loadedChunks),
    });
    loader.dispose();

    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(manifest.chunks.map((chunk) => chunk.id));
    expect(progress).toEqual(Array.from({ length: 49 }, (_, index) => index + 1));
    expect(result.chunks.reduce((total, chunk) => total + chunk.recordCount, 0)).toBe(15_448);
  });

  it("reprioritizes pending spatial chunks from the latest live view direction", async () => {
    const manifestBuffer = await readFixture("manifest.json");
    const manifest = validateStarCatalogManifest(JSON.parse(manifestBuffer.toString("utf8")));
    const fixtures = new Map<string, Uint8Array>();
    fixtures.set("manifest.json", manifestBuffer);
    for (const chunk of manifest.chunks) {
      fixtures.set(chunk.binaryUrl.replace("./", ""), await readFixture(chunk.binaryUrl.replace("./", "")));
      fixtures.set(chunk.metadataUrl.replace("./", ""), await readFixture(chunk.metadataUrl.replace("./", "")));
    }
    const fetchImpl = async (input: RequestInfo | URL) => {
      const filename = new URL(String(input)).pathname.split("/").pop() ?? "";
      const fixture = fixtures.get(filename);
      return fixture ? new Response(fixture) : new Response("missing", { status: 404 });
    };
    const loader = new StarCatalogLoader({
      fetchImpl: fetchImpl as typeof fetch,
      workerFactory: undefined,
      maxMainThreadFallbackBytes: Number.POSITIVE_INFINITY,
    });
    const target = manifest.chunks.find((chunk) => chunk.id === "sky-47")!;
    const loaded = await loader.load(
      "https://spaceviewer.test/catalogs/nearby-stars/manifest.json",
      {
        onChunk: (chunk) => {
          if (chunk.chunkId === "bright-core-g6") {
            loader.setPriorityDirection(target.spatialCell!.recordCentroidUnitIcrs);
          }
        },
      },
    );
    loader.dispose();

    expect(loaded.chunks[0].chunkId).toBe("bright-core-g6");
    expect(loaded.chunks[1].chunkId).toBe("sky-47");
  });

  it("recomputes every loaded chunk for a bounded target epoch without refetching assets", async () => {
    const manifestBuffer = await readFixture("manifest.json");
    const manifest = validateStarCatalogManifest(JSON.parse(manifestBuffer.toString("utf8")));
    const fixtures = new Map<string, Uint8Array>();
    fixtures.set("manifest.json", manifestBuffer);
    for (const chunk of manifest.chunks) {
      fixtures.set(chunk.binaryUrl.replace("./", ""), await readFixture(chunk.binaryUrl.replace("./", "")));
      fixtures.set(chunk.metadataUrl.replace("./", ""), await readFixture(chunk.metadataUrl.replace("./", "")));
    }
    let fetchCount = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      fetchCount += 1;
      const filename = new URL(String(input)).pathname.split("/").pop() ?? "";
      const fixture = fixtures.get(filename);
      return fixture ? new Response(fixture) : new Response("missing", { status: 404 });
    };
    const loader = new StarCatalogLoader({
      fetchImpl: fetchImpl as typeof fetch,
      workerFactory: undefined,
      maxMainThreadFallbackBytes: Number.POSITIVE_INFINITY,
    });
    const loaded = await loader.load("https://spaceviewer.test/catalogs/nearby-stars/manifest.json");
    const initialPositions = loaded.chunks[0].renderPositions.slice();
    const fetchesAfterLoad = fetchCount;
    const propagated = await loader.setTargetJulianYear(2100);
    loader.dispose();

    expect(propagated.targetJulianYear).toBe(2100);
    expect(propagated.chunks).toHaveLength(49);
    expect(fetchCount).toBe(fetchesAfterLoad);
    const brightCore = propagated.chunks.find((chunk) => chunk.chunkId === "bright-core-g6")!;
    expect(brightCore.renderPositions.some((value, index) => Math.abs(value - initialPositions[index]) > 1e-6)).toBe(true);
  });

  it("filters loaded buffers by view and magnitude without refetching catalogue assets", async () => {
    const manifestBuffer = await readFixture("manifest.json");
    const manifest = validateStarCatalogManifest(JSON.parse(manifestBuffer.toString("utf8")));
    const fixtures = new Map<string, Uint8Array>();
    fixtures.set("manifest.json", manifestBuffer);
    for (const chunk of manifest.chunks) {
      fixtures.set(chunk.binaryUrl.replace("./", ""), await readFixture(chunk.binaryUrl.replace("./", "")));
      fixtures.set(chunk.metadataUrl.replace("./", ""), await readFixture(chunk.metadataUrl.replace("./", "")));
    }
    let fetchCount = 0;
    const fetchImpl = async (input: RequestInfo | URL) => {
      fetchCount += 1;
      const filename = new URL(String(input)).pathname.split("/").pop() ?? "";
      const fixture = fixtures.get(filename);
      return fixture ? new Response(fixture) : new Response("missing", { status: 404 });
    };
    const loader = new StarCatalogLoader({
      fetchImpl: fetchImpl as typeof fetch,
      workerFactory: undefined,
      maxMainThreadFallbackBytes: Number.POSITIVE_INFINITY,
    });
    await loader.load("https://spaceviewer.test/catalogs/nearby-stars/manifest.json");
    const fetchesAfterLoad = fetchCount;
    const filtered = await loader.filterView({
      viewProjectionMatrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ],
      positionScale: 0.001,
      magnitudeLimitG: 9,
      pointBudget: 100,
    });
    loader.dispose();

    expect(fetchCount).toBe(fetchesAfterLoad);
    expect(filtered.chunks).toHaveLength(49);
    expect(filtered.diagnostics.totalRecords).toBe(15_448);
    expect(filtered.diagnostics.magnitudeEligibleRecords).toBe(15_448);
    expect(filtered.diagnostics.renderedRecords).toBe(100);
    expect(filtered.chunks.reduce((total, chunk) => total + chunk.indices.length, 0)).toBe(100);
  });
});
