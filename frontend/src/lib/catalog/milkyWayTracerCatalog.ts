import generatedMetadata from "../../generated/milkyWayCatalog.generated.json";

export interface MilkyWayArmSegmentMetadata {
  id: string;
  label: string;
  sourceCount: number;
  catalogueSourceCount: number;
  tangentLongitudeDeg: number | null;
  betaMinDeg: number;
  betaMaxDeg: number;
  betaKinkDeg: number;
  betaKinkErrorDeg: number | null;
  radiusKinkKpc: number;
  radiusKinkErrorKpc: number;
  pitchBeforeDeg: number;
  pitchBeforeErrorDeg: number;
  pitchAfterDeg: number;
  pitchAfterErrorDeg: number;
  widthKpc: number;
  widthErrorKpc: number;
  sourceArmCodes: string[];
  color: string;
  uncertaintyInterpretation: string;
}

export interface MilkyWayCatalogMetadata {
  schemaVersion: number;
  catalog: {
    id: string;
    version: string;
    title: string;
    sourceCatalogId: string;
    sourceCatalogDoi: string;
    articleDoi: string;
    catalogUrl: string;
    articleUrl: string;
    retrievedAt: string;
    credit: string;
    licenceId: string;
    licenceStatus: string;
    licenceUrl: string;
    licenceSummary: string;
    referenceFrame: string;
    sourceCoordinateFrame: string;
    distanceUnit: string;
  };
  selection: {
    sourceTable: string;
    sourceRecordCount: number;
    selectedRecordCount: number;
    predicate: string;
    populationBoundary: string;
    armAssignmentBoundary: string;
  };
  transform: {
    icrsToGalacticMatrix: number[][];
    galactocentricSunDistanceKpc: number;
    galactocentricConvention: string;
    displayMapping: string;
  };
  uncertainty: {
    sourceMeasurements: string;
    distanceVisualization: string;
    distanceCaveat: string;
    armModel: string;
    lowSignalThreshold: string;
    lowSignalCount: number;
    unboundedReciprocalSpanCount: number;
  };
  armModel: {
    source: {
      article: string;
      articleDoi: string;
      articleUrl: string;
      sourceTable: string;
      transcriptionNote: string;
    };
    equation: string;
    azimuthConvention: string;
    intrinsicWidthSlopeKpcPerKpc: number;
    segments: MilkyWayArmSegmentMetadata[];
  };
  binary: {
    url: string;
    format: string;
    magic: string;
    version: number;
    headerBytes: number;
    recordBytes: number;
    recordCount: number;
    byteLength: number;
    sha256: string;
    stringEncoding: string;
    floatFields: string[];
  };
  build: {
    scriptVersion: string;
    sourceSha256: string;
    recordCount: number;
    armCodeCount: number;
    armCodes: string[];
    sourceArmCounts: Record<string, number>;
    fittedSegmentCount: number;
    maximumNominalDistanceKpc: number;
  };
}

export const MILKY_WAY_CATALOG_METADATA = generatedMetadata as MilkyWayCatalogMetadata;

export interface DecodedMilkyWayTracerCatalog {
  recordCount: number;
  positionsKpc: Float32Array;
  uncertaintySegmentsKpc: Float32Array;
  segmentIndices: Uint8Array;
  markerWeights: Float32Array;
  fractionalParallaxErrors: Float32Array;
  names: string[];
  armCodes: string[];
}

const MAGIC = "SVMW";
const HEADER_BYTES = 64;
const RECORD_BYTES = 96;
const FLOAT_OFFSET = 16;
const FLOAT_BYTES = 4;
const floatAt = (view: DataView, recordOffset: number, fieldIndex: number) =>
  view.getFloat32(recordOffset + FLOAT_OFFSET + fieldIndex * FLOAT_BYTES, true);

const readNullTerminatedUtf8 = (bytes: Uint8Array, start: number) => {
  if (start < 0 || start >= bytes.byteLength) throw new Error("Milky Way catalogue string offset is out of range.");
  let end = start;
  while (end < bytes.byteLength && bytes[end] !== 0) end += 1;
  if (end === bytes.byteLength) throw new Error("Milky Way catalogue contains an unterminated string.");
  return new TextDecoder().decode(bytes.subarray(start, end));
};

export const decodeMilkyWayTracerBinary = (
  arrayBuffer: ArrayBuffer,
  metadata: MilkyWayCatalogMetadata = MILKY_WAY_CATALOG_METADATA,
): DecodedMilkyWayTracerCatalog => {
  if (arrayBuffer.byteLength !== metadata.binary.byteLength || arrayBuffer.byteLength < HEADER_BYTES) {
    throw new Error("Milky Way catalogue binary length does not match its manifest.");
  }
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  const formatVersion = view.getUint16(4, true);
  const headerBytes = view.getUint16(6, true);
  const recordCount = view.getUint32(8, true);
  const recordBytes = view.getUint32(12, true);
  const recordsOffset = view.getUint32(16, true);
  const stringTableOffset = view.getUint32(20, true);
  const stringTableBytes = view.getUint32(24, true);
  const floatsPerRecord = view.getUint32(28, true);
  const galactocentricSunDistanceKpc = view.getFloat32(32, true);
  const armCodeCount = view.getUint32(36, true);
  const segmentCount = view.getUint32(40, true);

  if (
    magic !== MAGIC ||
    formatVersion !== metadata.binary.version ||
    headerBytes !== HEADER_BYTES ||
    recordBytes !== RECORD_BYTES ||
    recordsOffset !== HEADER_BYTES ||
    recordCount !== metadata.binary.recordCount ||
    floatsPerRecord !== metadata.binary.floatFields.length ||
    armCodeCount !== metadata.build.armCodeCount ||
    segmentCount !== metadata.build.fittedSegmentCount ||
    Math.abs(galactocentricSunDistanceKpc - metadata.transform.galactocentricSunDistanceKpc) > 1e-5 ||
    stringTableOffset !== recordsOffset + recordCount * recordBytes ||
    stringTableOffset + stringTableBytes !== arrayBuffer.byteLength
  ) {
    throw new Error("Milky Way catalogue binary header is inconsistent with its manifest.");
  }

  const positionsKpc = new Float32Array(recordCount * 3);
  const uncertaintySegmentsKpc = new Float32Array(recordCount * 6);
  const segmentIndices = new Uint8Array(recordCount);
  const markerWeights = new Float32Array(recordCount);
  const fractionalParallaxErrors = new Float32Array(recordCount);
  const names = new Array<string>(recordCount);
  const stringBytes = bytes.subarray(stringTableOffset, stringTableOffset + stringTableBytes);
  const maxDisplayDistanceKpc = metadata.build.maximumNominalDistanceKpc;

  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = recordsOffset + index * recordBytes;
    const nameOffset = view.getUint32(recordOffset, true);
    const armCodeIndex = view.getUint8(recordOffset + 12);
    const segmentIndex = view.getUint8(recordOffset + 13);
    const flags = view.getUint16(recordOffset + 14, true);
    const distanceKpc = floatAt(view, recordOffset, 12);
    const distanceLowKpc = floatAt(view, recordOffset, 13);
    const storedDistanceHighKpc = floatAt(view, recordOffset, 14);
    const heliocentricXKpc = floatAt(view, recordOffset, 15);
    const heliocentricYKpc = floatAt(view, recordOffset, 16);
    const heliocentricZKpc = floatAt(view, recordOffset, 17);
    const fractionalError = floatAt(view, recordOffset, 18);
    const markerWeight = floatAt(view, recordOffset, 19);
    if (
      !Number.isFinite(distanceKpc) || distanceKpc <= 0 ||
      !Number.isFinite(distanceLowKpc) || distanceLowKpc <= 0 ||
      !Number.isFinite(heliocentricXKpc) || !Number.isFinite(heliocentricYKpc) || !Number.isFinite(heliocentricZKpc) ||
      !Number.isFinite(fractionalError) || fractionalError <= 0 ||
      armCodeIndex >= metadata.build.armCodes.length ||
      (segmentIndex !== 255 && segmentIndex >= metadata.armModel.segments.length)
    ) {
      throw new Error(`Milky Way catalogue record ${index} is invalid.`);
    }

    const positionOffset = index * 3;
    positionsKpc[positionOffset] = galactocentricSunDistanceKpc - heliocentricXKpc;
    positionsKpc[positionOffset + 1] = heliocentricZKpc;
    positionsKpc[positionOffset + 2] = heliocentricYKpc;
    const lowScale = distanceLowKpc / distanceKpc;
    const distanceHighKpc = flags & 1 && Number.isFinite(storedDistanceHighKpc)
      ? storedDistanceHighKpc
      : maxDisplayDistanceKpc;
    const highScale = Math.min(distanceHighKpc, maxDisplayDistanceKpc) / distanceKpc;
    const segmentOffset = index * 6;
    uncertaintySegmentsKpc[segmentOffset] = galactocentricSunDistanceKpc - heliocentricXKpc * lowScale;
    uncertaintySegmentsKpc[segmentOffset + 1] = heliocentricZKpc * lowScale;
    uncertaintySegmentsKpc[segmentOffset + 2] = heliocentricYKpc * lowScale;
    uncertaintySegmentsKpc[segmentOffset + 3] = galactocentricSunDistanceKpc - heliocentricXKpc * highScale;
    uncertaintySegmentsKpc[segmentOffset + 4] = heliocentricZKpc * highScale;
    uncertaintySegmentsKpc[segmentOffset + 5] = heliocentricYKpc * highScale;
    segmentIndices[index] = segmentIndex;
    markerWeights[index] = markerWeight;
    fractionalParallaxErrors[index] = fractionalError;
    names[index] = readNullTerminatedUtf8(stringBytes, nameOffset);
  }

  return {
    recordCount,
    positionsKpc,
    uncertaintySegmentsKpc,
    segmentIndices,
    markerWeights,
    fractionalParallaxErrors,
    names,
    armCodes: metadata.build.armCodes,
  };
};

const sha256Hex = async (arrayBuffer: ArrayBuffer) => {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const resolveCatalogUrl = () => {
  const base = typeof window === "undefined" ? "http://localhost/" : new URL(import.meta.env.BASE_URL, window.location.origin).href;
  return new URL(MILKY_WAY_CATALOG_METADATA.binary.url.replace(/^\//, ""), base).href;
};

let catalogPromise: Promise<DecodedMilkyWayTracerCatalog> | null = null;

export const loadMilkyWayTracerCatalog = () => {
  if (catalogPromise) return catalogPromise;
  catalogPromise = fetch(resolveCatalogUrl(), { headers: { Accept: "application/octet-stream" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Milky Way tracer asset failed (${response.status} ${response.statusText}).`);
      const arrayBuffer = await response.arrayBuffer();
      const digest = await sha256Hex(arrayBuffer);
      if (digest && digest !== MILKY_WAY_CATALOG_METADATA.binary.sha256) {
        throw new Error("Milky Way tracer asset failed its SHA-256 provenance check.");
      }
      return decodeMilkyWayTracerBinary(arrayBuffer);
    })
    .catch((error) => {
      catalogPromise = null;
      throw error;
    });
  return catalogPromise;
};
