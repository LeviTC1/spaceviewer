import { decodeStarCatalogBinary, validateStarCatalogChunkMetadata, validateStarCatalogManifest } from "./starCatalogBinary";
import type {
  DecodedStarCatalogChunk,
  StarCatalogViewFilterRequest,
  StarCatalogViewFilterResult,
  StarCatalogPropagationResult,
  StarCatalogLoadProgress,
  StarCatalogManifest,
  StarCatalogManifestChunk,
  StarCatalogPriorityDirection,
} from "./starCatalogTypes";
import { filterStarCatalogView } from "./starCatalogFilter";
import {
  GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
  propagateStarCatalogPositions,
  quantizeGaiaPropagationJulianYear,
} from "./starCatalogPropagation";

const MAX_MAIN_THREAD_FALLBACK_BYTES = 64 * 1024;
const MAX_CONCURRENT_SPATIAL_CHUNKS = 4;

interface WorkerResponse {
  type: "decoded" | "propagated" | "filtered" | "error";
  requestId: number;
  decoded?: DecodedStarCatalogChunk;
  targetJulianYear?: number;
  chunks?: StarCatalogPropagationResult["chunks"];
  result?: StarCatalogViewFilterResult;
  message?: string;
}

export interface StarCatalogLoaderOptions {
  fetchImpl?: typeof fetch;
  workerFactory?: () => Worker;
  verifyIntegrity?: boolean;
  maxMainThreadFallbackBytes?: number;
}

export interface StarCatalogLoadHandlers {
  onManifest?: (manifest: StarCatalogManifest) => void;
  onChunk?: (chunk: DecodedStarCatalogChunk, progress: StarCatalogLoadProgress) => void;
  onProgress?: (progress: StarCatalogLoadProgress) => void;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const verifyContentIntegrity = async (content: ArrayBuffer, expected: string, label: string) => {
  if (!expected.startsWith("sha256-") || !globalThis.crypto?.subtle) return;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", content);
  const actual = `sha256-${toBase64(new Uint8Array(digest))}`;
  if (actual !== expected) throw new Error(`Integrity verification failed for ${label}.`);
};

const resolveManifestUrl = (manifestUrl: string) => {
  if (typeof globalThis.location !== "undefined") {
    return new URL(manifestUrl, globalThis.location.href).toString();
  }
  return new URL(manifestUrl).toString();
};

const resolveAssetUrl = (assetUrl: string, manifestUrl: string) => new URL(assetUrl, manifestUrl).toString();

const normalizePriorityDirection = (
  direction: StarCatalogPriorityDirection | null,
): StarCatalogPriorityDirection | null => {
  if (!direction || ![direction.x, direction.y, direction.z].every(Number.isFinite)) return null;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length <= 1e-9) return null;
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
};

export class StarCatalogLoader {
  private readonly fetchImpl: typeof fetch;
  private readonly workerFactory: (() => Worker) | null;
  private readonly shouldVerifyIntegrity: boolean;
  private readonly maxMainThreadFallbackBytes: number;
  private worker: Worker | null = null;
  private workerFailed = false;
  private nextRequestId = 1;
  private targetJulianYear = GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
  private priorityDirection: StarCatalogPriorityDirection | null = null;
  private decodedChunks = new Map<string, DecodedStarCatalogChunk>();
  private pendingDecodes = new Map<number, { resolve: (chunk: DecodedStarCatalogChunk) => void; reject: (error: Error) => void }>();
  private pendingPropagations = new Map<number, { resolve: (result: StarCatalogPropagationResult) => void; reject: (error: Error) => void }>();
  private pendingFilters = new Map<number, { resolve: (result: StarCatalogViewFilterResult) => void; reject: (error: Error) => void }>();

  constructor(options: StarCatalogLoaderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.workerFactory =
      options.workerFactory ??
      (typeof Worker === "undefined"
        ? null
        : () => new Worker(new URL("./starCatalog.worker.ts", import.meta.url), { type: "module" }));
    this.shouldVerifyIntegrity = options.verifyIntegrity ?? true;
    this.maxMainThreadFallbackBytes = options.maxMainThreadFallbackBytes ?? MAX_MAIN_THREAD_FALLBACK_BYTES;
  }

  setPriorityDirection(direction: StarCatalogPriorityDirection | null) {
    this.priorityDirection = normalizePriorityDirection(direction);
  }

  private selectNextChunk(chunks: StarCatalogManifestChunk[]) {
    const coreChunk = chunks.find((chunk) => chunk.importanceTier === "core");
    if (coreChunk) return coreChunk;
    if (!this.priorityDirection) return chunks[0];
    const direction = this.priorityDirection;
    return chunks.reduce((best, candidate) => {
      const bestCenter = best.spatialCell?.recordCentroidUnitIcrs;
      const candidateCenter = candidate.spatialCell?.recordCentroidUnitIcrs;
      if (!bestCenter || !candidateCenter) return best;
      const bestScore = bestCenter.x * direction.x + bestCenter.y * direction.y + bestCenter.z * direction.z;
      const candidateScore =
        candidateCenter.x * direction.x + candidateCenter.y * direction.y + candidateCenter.z * direction.z;
      return candidateScore > bestScore ? candidate : best;
    });
  }

  private getSchedulingState() {
    return {
      schedulingMode: this.priorityDirection ? "view-adjacent" : "manifest-order",
      priorityDirectionIcrs: this.priorityDirection ? { ...this.priorityDirection } : null,
    } as const;
  }

  private getWorker() {
    if (!this.workerFactory || this.workerFailed) return null;
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      if (response.type === "decoded") {
        const pending = this.pendingDecodes.get(response.requestId);
        if (!pending) return;
        this.pendingDecodes.delete(response.requestId);
        if (response.decoded) pending.resolve(response.decoded);
        else pending.reject(new Error(response.message ?? "Star catalogue worker decode failed."));
        return;
      }
      if (response.type === "propagated") {
        const pending = this.pendingPropagations.get(response.requestId);
        if (!pending) return;
        this.pendingPropagations.delete(response.requestId);
        if (typeof response.targetJulianYear === "number" && response.chunks) {
          pending.resolve({ targetJulianYear: response.targetJulianYear, chunks: response.chunks });
        } else pending.reject(new Error(response.message ?? "Star catalogue worker propagation failed."));
        return;
      }
      if (response.type === "filtered") {
        const pending = this.pendingFilters.get(response.requestId);
        if (!pending) return;
        this.pendingFilters.delete(response.requestId);
        if (response.result) pending.resolve(response.result);
        else pending.reject(new Error(response.message ?? "Star catalogue worker view filtering failed."));
        return;
      }
      const error = new Error(response.message ?? "Star catalogue worker failed.");
      const decode = this.pendingDecodes.get(response.requestId);
      if (decode) {
        this.pendingDecodes.delete(response.requestId);
        decode.reject(error);
      }
      const propagation = this.pendingPropagations.get(response.requestId);
      if (propagation) {
        this.pendingPropagations.delete(response.requestId);
        propagation.reject(error);
      }
      const filter = this.pendingFilters.get(response.requestId);
      if (filter) {
        this.pendingFilters.delete(response.requestId);
        filter.reject(error);
      }
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Star catalogue worker crashed.");
      this.pendingDecodes.forEach((pending) => pending.reject(error));
      this.pendingPropagations.forEach((pending) => pending.reject(error));
      this.pendingFilters.forEach((pending) => pending.reject(error));
      this.pendingDecodes.clear();
      this.pendingPropagations.clear();
      this.pendingFilters.clear();
      worker.terminate();
      this.worker = null;
      this.workerFailed = true;
    };
    this.worker = worker;
    return worker;
  }

  private decodeWithWorker(
    buffer: ArrayBuffer,
    metadataText: string,
    manifest: StarCatalogManifest,
    chunk: StarCatalogManifestChunk,
  ) {
    const worker = this.getWorker();
    if (!worker) return null;
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise<DecodedStarCatalogChunk>((resolve, reject) => {
      this.pendingDecodes.set(requestId, { resolve, reject });
      worker.postMessage(
        { type: "decode", requestId, buffer, metadataText, manifest, chunk, targetJulianYear: this.targetJulianYear },
        [buffer],
      );
    });
  }

  private propagateWithWorker(targetJulianYear: number) {
    const worker = this.getWorker();
    if (!worker) return null;
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise<StarCatalogPropagationResult>((resolve, reject) => {
      this.pendingPropagations.set(requestId, { resolve, reject });
      worker.postMessage({ type: "propagate", requestId, targetJulianYear });
    });
  }

  private filterWithWorker(filter: StarCatalogViewFilterRequest) {
    const worker = this.getWorker();
    if (!worker) return null;
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise<StarCatalogViewFilterResult>((resolve, reject) => {
      this.pendingFilters.set(requestId, { resolve, reject });
      worker.postMessage({ type: "filter", requestId, filter });
    });
  }

  private applyPropagationResult(result: StarCatalogPropagationResult) {
    result.chunks.forEach((propagated) => {
      const existing = this.decodedChunks.get(propagated.chunkId);
      if (!existing) return;
      this.decodedChunks.set(propagated.chunkId, {
        ...existing,
        renderPositions: propagated.renderPositions,
        renderEpochJulianYear: result.targetJulianYear,
      });
    });
    return result;
  }

  async setTargetJulianYear(targetJulianYear: number) {
    const target = quantizeGaiaPropagationJulianYear(targetJulianYear);
    this.targetJulianYear = target;
    const workerPropagation = this.propagateWithWorker(target);
    if (workerPropagation) return this.applyPropagationResult(await workerPropagation);
    const chunks = [...this.decodedChunks.values()].map((chunk) => ({
      chunkId: chunk.chunkId,
      renderPositions: propagateStarCatalogPositions(chunk.columns, target),
    }));
    return this.applyPropagationResult({ targetJulianYear: target, chunks });
  }

  async filterView(filter: StarCatalogViewFilterRequest) {
    const workerFilter = this.filterWithWorker(filter);
    if (workerFilter) return workerFilter;
    return filterStarCatalogView(
      [...this.decodedChunks.values()].map((chunk) => ({
        chunkId: chunk.chunkId,
        renderPositions: chunk.renderPositions,
        apparentMagnitudeG: chunk.columns.apparentMagnitudeG,
      })),
      filter,
    );
  }

  private async loadChunk(
    manifest: StarCatalogManifest,
    manifestUrl: string,
    chunk: StarCatalogManifestChunk,
    signal?: AbortSignal,
  ) {
    const [binaryResponse, metadataResponse] = await Promise.all([
      this.fetchImpl(resolveAssetUrl(chunk.binaryUrl, manifestUrl), { signal }),
      this.fetchImpl(resolveAssetUrl(chunk.metadataUrl, manifestUrl), { signal }),
    ]);
    if (!binaryResponse.ok || !metadataResponse.ok) {
      throw new Error(`Failed to fetch star catalogue chunk ${chunk.id}.`);
    }
    const [buffer, metadataText] = await Promise.all([binaryResponse.arrayBuffer(), metadataResponse.text()]);
    if (this.shouldVerifyIntegrity) {
      const metadataBytes = new TextEncoder().encode(metadataText);
      await Promise.all([
        verifyContentIntegrity(buffer, chunk.binaryIntegrity, `${chunk.id} binary`),
        verifyContentIntegrity(metadataBytes.buffer, chunk.metadataIntegrity, `${chunk.id} metadata`),
      ]);
    }
    if (signal?.aborted) throw new DOMException("Star catalogue load aborted.", "AbortError");

    const workerDecode = this.decodeWithWorker(buffer, metadataText, manifest, chunk);
    let decoded: DecodedStarCatalogChunk;
    if (workerDecode) decoded = await workerDecode;
    else {
      if (buffer.byteLength > this.maxMainThreadFallbackBytes) {
        throw new Error(`Worker decoding is required for star catalogue chunk ${chunk.id}.`);
      }
      const metadata = validateStarCatalogChunkMetadata(JSON.parse(metadataText), chunk, manifest);
      decoded = decodeStarCatalogBinary(buffer, chunk, metadata, this.targetJulianYear);
    }
    this.decodedChunks.set(decoded.chunkId, decoded);
    return decoded;
  }

  async load(manifestUrl: string, handlers: StarCatalogLoadHandlers = {}, signal?: AbortSignal) {
    const resolvedManifestUrl = resolveManifestUrl(manifestUrl);
    const response = await this.fetchImpl(resolvedManifestUrl, { signal });
    if (!response.ok) throw new Error(`Failed to fetch star catalogue manifest (${response.status}).`);
    const manifest = validateStarCatalogManifest(await response.json());
    handlers.onManifest?.(manifest);

    let loadedRecords = 0;
    let loadedBytes = 0;
    const chunks: DecodedStarCatalogChunk[] = [];
    const pendingChunks = [...manifest.chunks];
    while (pendingChunks.length) {
      if (signal?.aborted) throw new DOMException("Star catalogue load aborted.", "AbortError");
      const batchSize = pendingChunks.some((chunk) => chunk.importanceTier === "core")
        ? 1
        : Math.min(MAX_CONCURRENT_SPATIAL_CHUNKS, pendingChunks.length);
      const batchDefinitions: StarCatalogManifestChunk[] = [];
      for (let batchIndex = 0; batchIndex < batchSize; batchIndex += 1) {
        const nextChunk = this.selectNextChunk(pendingChunks);
        pendingChunks.splice(pendingChunks.indexOf(nextChunk), 1);
        batchDefinitions.push(nextChunk);
      }
      handlers.onProgress?.({
        loadedChunks: chunks.length,
        totalChunks: manifest.chunks.length,
        loadedRecords,
        totalRecords: manifest.build.recordCount,
        loadedBytes,
        totalBytes: manifest.build.totalBinaryBytes,
        activeChunkId: batchDefinitions[0].id,
        ...this.getSchedulingState(),
      });
      const decodedBatch = await Promise.all(
        batchDefinitions.map((chunkDefinition) =>
          this.loadChunk(manifest, resolvedManifestUrl, chunkDefinition, signal),
        ),
      );
      decodedBatch.forEach((chunk, batchIndex) => {
        chunks.push(chunk);
        loadedRecords += chunk.recordCount;
        loadedBytes += chunk.byteLength;
        const activeChunkId = batchDefinitions[batchIndex + 1]?.id ??
          (pendingChunks.length ? this.selectNextChunk(pendingChunks).id : null);
        const progress = {
          loadedChunks: chunks.length,
          totalChunks: manifest.chunks.length,
          loadedRecords,
          totalRecords: manifest.build.recordCount,
          loadedBytes,
          totalBytes: manifest.build.totalBinaryBytes,
          activeChunkId,
          ...this.getSchedulingState(),
        } satisfies StarCatalogLoadProgress;
        handlers.onChunk?.(chunk, progress);
        handlers.onProgress?.(progress);
      });
    }
    return { manifest, chunks };
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    const error = new Error("Star catalogue loader disposed.");
    this.pendingDecodes.forEach((pending) => pending.reject(error));
    this.pendingPropagations.forEach((pending) => pending.reject(error));
    this.pendingFilters.forEach((pending) => pending.reject(error));
    this.pendingDecodes.clear();
    this.pendingPropagations.clear();
    this.pendingFilters.clear();
    this.decodedChunks.clear();
    this.priorityDirection = null;
  }
}
