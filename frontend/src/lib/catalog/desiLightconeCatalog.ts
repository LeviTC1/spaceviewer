import generatedMetadata from "../../generated/desiLightconeCatalog.generated.json";

export interface DesiLightconeCatalogMetadata {
  schemaVersion: number;
  catalog: {
    id: string;
    version: string;
    title: string;
    sourceTitle: string;
    releaseDate: string;
    retrievedAt: string;
    sourceUrl: string;
    dataReleaseUrl: string;
    dataModelUrl: string;
    samplePaper: string;
    samplePaperDoi: string;
    samplePaperUrl: string;
    credit: string;
    licenceId: string;
    licenceStatus: string;
    licenceUrl: string;
    acknowledgmentsUrl: string;
  };
  selection: {
    sourceSample: string;
    sourceSampleDefinition: string;
    sourceRecordCount: number;
    selectedRecordCount: number;
    skyFootprint: {
      raMinDeg: number;
      raMaxDeg: number;
      decMinDeg: number;
      decMaxDeg: number;
      redshiftMin: number;
      redshiftMax: number;
      frame: string;
    };
    predicate: string;
    selectionBoundary: string;
    displayPopulation: string;
  };
  coordinates: {
    angularFrame: string;
    radialObservable: string;
    coordinateConvention: string;
    displayBasis: string;
    sceneUnitsPerMpc: number;
    cosmology: {
      name: string;
      h0KmSPerMpc: number;
      omegaM: number;
      omegaLambda: number;
      speedOfLightKmS: number;
    };
    distanceEquation: string;
    interpretationBoundary: string;
    distanceRangeMpc: { minimum: number; maximum: number };
  };
  uncertainty: {
    sourceBoundary: string;
    statisticalBoundary: string;
    systematicBoundary: string;
  };
  weights: {
    visualUse: string;
    combined: DesiWeightSummary;
    completeness: DesiWeightSummary;
    imagingSystematics: DesiWeightSummary;
    redshiftFailure: DesiWeightSummary;
    fkp: DesiWeightSummary;
    fracTlobsTiles: DesiWeightSummary;
  };
  referenceNofZ: {
    source: string;
    populationBoundary: string;
    bins: Array<{
      zMid: number;
      zLow: number;
      zHigh: number;
      numberDensityH3Mpc3: number;
      weightedCount: number;
      volumeMpc3HMinus3: number;
    }>;
  };
  binary: {
    url: string;
    format: string;
    magic: string;
    version: number;
    headerBytes: number;
    recordBytes: number;
    floatsPerRecord: number;
    recordCount: number;
    byteLength: number;
    sha256: string;
    recordOrder: string;
    floatFields: string[];
  };
  build: {
    scriptVersion: string;
    sourceSha256: string;
    sourceRecordCount: number;
    selectedRecordCount: number;
    photometricSystemCounts: Record<string, number>;
    tileCountRange: { minimum: number; maximum: number };
  };
}

export interface DesiWeightSummary {
  minimum: number;
  median: number;
  maximum: number;
}

export interface DecodedDesiLightconeCatalog {
  recordCount: number;
  positionsScene: Float32Array;
  redshifts: Float32Array;
  colors: Float32Array;
  targetIds: BigUint64Array;
  completenessWeights: Float32Array;
}

export const DESI_LIGHTCONE_CATALOG_METADATA = generatedMetadata as DesiLightconeCatalogMetadata;

const MAGIC = "SVLC";
const HEADER_BYTES = 96;
const RECORD_BYTES = 72;
const FLOAT_OFFSET = 12;
const FLOAT_BYTES = 4;
const floatAt = (view: DataView, recordOffset: number, fieldIndex: number) =>
  view.getFloat32(recordOffset + FLOAT_OFFSET + fieldIndex * FLOAT_BYTES, true);

const redshiftColor = (normalized: number) => {
  const stops = [
    [0.38, 0.93, 1],
    [0.38, 0.62, 1],
    [0.68, 0.45, 1],
    [1, 0.45, 0.76],
  ];
  const scaled = Math.max(0, Math.min(0.999_999, normalized)) * (stops.length - 1);
  const start = Math.floor(scaled);
  const fraction = scaled - start;
  return stops[start].map((value, axis) => value + (stops[start + 1][axis] - value) * fraction);
};

export const decodeDesiLightconeBinary = (
  arrayBuffer: ArrayBuffer,
  requestedCount = DESI_LIGHTCONE_CATALOG_METADATA.binary.recordCount,
  metadata: DesiLightconeCatalogMetadata = DESI_LIGHTCONE_CATALOG_METADATA,
): DecodedDesiLightconeCatalog => {
  if (arrayBuffer.byteLength !== metadata.binary.byteLength || arrayBuffer.byteLength < HEADER_BYTES) {
    throw new Error("DESI light-cone binary length does not match its manifest.");
  }
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, 4));
  const version = view.getUint16(4, true);
  const headerBytes = view.getUint16(6, true);
  const storedCount = view.getUint32(8, true);
  const recordBytes = view.getUint32(12, true);
  const recordsOffset = view.getUint32(16, true);
  const floatsPerRecord = view.getUint32(20, true);
  const sourceRecordCount = view.getUint32(24, true);
  const h0 = view.getFloat32(32, true);
  const omegaM = view.getFloat32(36, true);
  const sceneUnitsPerMpc = view.getFloat32(40, true);
  if (
    magic !== MAGIC ||
    version !== metadata.binary.version ||
    headerBytes !== HEADER_BYTES ||
    recordBytes !== RECORD_BYTES ||
    recordsOffset !== HEADER_BYTES ||
    floatsPerRecord !== metadata.binary.floatsPerRecord ||
    storedCount !== metadata.binary.recordCount ||
    sourceRecordCount !== metadata.selection.sourceRecordCount ||
    Math.abs(h0 - metadata.coordinates.cosmology.h0KmSPerMpc) > 1e-4 ||
    Math.abs(omegaM - metadata.coordinates.cosmology.omegaM) > 1e-5 ||
    Math.abs(sceneUnitsPerMpc - metadata.coordinates.sceneUnitsPerMpc) > 1e-6 ||
    recordsOffset + storedCount * recordBytes !== arrayBuffer.byteLength
  ) {
    throw new Error("DESI light-cone binary header is inconsistent with its manifest.");
  }

  const recordCount = Math.max(1, Math.min(storedCount, Math.floor(requestedCount)));
  const positionsScene = new Float32Array(recordCount * 3);
  const redshifts = new Float32Array(recordCount);
  const colors = new Float32Array(recordCount * 3);
  const targetIds = new BigUint64Array(recordCount);
  const completenessWeights = new Float32Array(recordCount);
  const { redshiftMin, redshiftMax } = metadata.selection.skyFootprint;

  for (let index = 0; index < recordCount; index += 1) {
    const recordOffset = recordsOffset + index * recordBytes;
    const targetId = view.getBigUint64(recordOffset, true);
    const raDeg = floatAt(view, recordOffset, 0);
    const decDeg = floatAt(view, recordOffset, 1);
    const redshift = floatAt(view, recordOffset, 2);
    const distanceMpc = floatAt(view, recordOffset, 3);
    const localXMpc = floatAt(view, recordOffset, 4);
    const localYMpc = floatAt(view, recordOffset, 5);
    const localZMpc = floatAt(view, recordOffset, 6);
    const weightComp = floatAt(view, recordOffset, 11);
    if (
      targetId === 0n ||
      !Number.isFinite(raDeg) || raDeg < metadata.selection.skyFootprint.raMinDeg || raDeg > metadata.selection.skyFootprint.raMaxDeg ||
      !Number.isFinite(decDeg) || decDeg < metadata.selection.skyFootprint.decMinDeg || decDeg > metadata.selection.skyFootprint.decMaxDeg ||
      !Number.isFinite(redshift) || redshift < redshiftMin || redshift > redshiftMax ||
      !Number.isFinite(distanceMpc) || distanceMpc <= 0 ||
      !Number.isFinite(localXMpc) || !Number.isFinite(localYMpc) || !Number.isFinite(localZMpc) ||
      !Number.isFinite(weightComp) || weightComp <= 0
    ) {
      throw new Error(`DESI light-cone record ${index} is invalid.`);
    }
    const positionOffset = index * 3;
    positionsScene[positionOffset] = localXMpc * sceneUnitsPerMpc;
    positionsScene[positionOffset + 1] = localYMpc * sceneUnitsPerMpc;
    positionsScene[positionOffset + 2] = localZMpc * sceneUnitsPerMpc;
    redshifts[index] = redshift;
    targetIds[index] = targetId;
    completenessWeights[index] = weightComp;
    const color = redshiftColor((redshift - redshiftMin) / (redshiftMax - redshiftMin));
    colors.set(color, positionOffset);
  }
  return { recordCount, positionsScene, redshifts, colors, targetIds, completenessWeights };
};

const sha256Hex = async (arrayBuffer: ArrayBuffer) => {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const resolveCatalogUrl = () => {
  const base = typeof window === "undefined" ? "http://localhost/" : new URL(import.meta.env.BASE_URL, window.location.origin).href;
  return new URL(DESI_LIGHTCONE_CATALOG_METADATA.binary.url.replace(/^\//, ""), base).href;
};

let binaryPromise: Promise<ArrayBuffer> | null = null;
const loadBinary = () => {
  if (binaryPromise) return binaryPromise;
  binaryPromise = fetch(resolveCatalogUrl(), { headers: { Accept: "application/octet-stream" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`DESI light-cone asset failed (${response.status} ${response.statusText}).`);
      const arrayBuffer = await response.arrayBuffer();
      const digest = await sha256Hex(arrayBuffer);
      if (digest && digest !== DESI_LIGHTCONE_CATALOG_METADATA.binary.sha256) {
        throw new Error("DESI light-cone asset failed its SHA-256 provenance check.");
      }
      return arrayBuffer;
    })
    .catch((error) => {
      binaryPromise = null;
      throw error;
    });
  return binaryPromise;
};

export const loadDesiLightconeCatalog = async (requestedCount: number) =>
  decodeDesiLightconeBinary(await loadBinary(), requestedCount);
