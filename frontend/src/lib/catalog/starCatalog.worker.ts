/// <reference lib="webworker" />

import {
  decodeStarCatalogBinary,
  validateStarCatalogChunkMetadata,
  validateStarCatalogManifest,
} from "./starCatalogBinary";
import type { StarCatalogManifest, StarCatalogManifestChunk } from "./starCatalogTypes";
import type { StarCatalogViewFilterRequest } from "./starCatalogTypes";
import { filterStarCatalogView, type StarCatalogFilterChunkInput } from "./starCatalogFilter";
import {
  clampGaiaPropagationJulianYear,
  GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
  propagateStarCatalogPositions,
  type StarCatalogPropagationColumns,
} from "./starCatalogPropagation";

interface DecodeRequest {
  type: "decode";
  requestId: number;
  buffer: ArrayBuffer;
  metadataText: string;
  manifest: StarCatalogManifest;
  chunk: StarCatalogManifestChunk;
  targetJulianYear?: number;
}

interface PropagateRequest {
  type: "propagate";
  requestId: number;
  targetJulianYear: number;
}

interface FilterRequest {
  type: "filter";
  requestId: number;
  filter: StarCatalogViewFilterRequest;
}

type WorkerRequest = DecodeRequest | PropagateRequest | FilterRequest;

const propagationColumnsByChunk = new Map<string, StarCatalogPropagationColumns>();
const filterChunksById = new Map<string, StarCatalogFilterChunkInput>();

const copyPropagationColumns = (columns: StarCatalogPropagationColumns): StarCatalogPropagationColumns => ({
  x: columns.x.slice(),
  y: columns.y.slice(),
  z: columns.z.slice(),
  distanceLy: columns.distanceLy.slice(),
  raDeg: columns.raDeg.slice(),
  decDeg: columns.decDeg.slice(),
  pmRaMasYr: columns.pmRaMasYr.slice(),
  pmDecMasYr: columns.pmDecMasYr.slice(),
  radialVelocityKmS: columns.radialVelocityKmS.slice(),
});

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "filter") {
      const result = filterStarCatalogView([...filterChunksById.values()], request.filter);
      self.postMessage(
        { type: "filtered", requestId: request.requestId, result },
        result.chunks.map((chunk) => chunk.indices.buffer),
      );
      return;
    }
    if (request.type === "propagate") {
      const targetJulianYear = clampGaiaPropagationJulianYear(request.targetJulianYear);
      const chunks = [...propagationColumnsByChunk.entries()].map(([chunkId, columns]) => {
        const retainedRenderPositions = propagateStarCatalogPositions(columns, targetJulianYear);
        const filterChunk = filterChunksById.get(chunkId);
        if (filterChunk) filterChunk.renderPositions = retainedRenderPositions;
        return { chunkId, renderPositions: retainedRenderPositions.slice() };
      });
      self.postMessage(
        { type: "propagated", requestId: request.requestId, targetJulianYear, chunks },
        chunks.map((chunk) => chunk.renderPositions.buffer),
      );
      return;
    }
    const manifest = validateStarCatalogManifest(request.manifest);
    const metadata = validateStarCatalogChunkMetadata(JSON.parse(request.metadataText), request.chunk, manifest);
    const targetJulianYear = request.targetJulianYear ?? GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
    const decoded = decodeStarCatalogBinary(request.buffer, request.chunk, metadata, targetJulianYear);
    propagationColumnsByChunk.set(decoded.chunkId, copyPropagationColumns(decoded.columns));
    filterChunksById.set(decoded.chunkId, {
      chunkId: decoded.chunkId,
      renderPositions: decoded.renderPositions.slice(),
      apparentMagnitudeG: decoded.columns.apparentMagnitudeG.slice(),
    });
    self.postMessage(
      { type: "decoded", requestId: request.requestId, decoded },
      [request.buffer, decoded.renderPositions.buffer],
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Unknown star catalogue decode failure.",
    });
  }
};

export {};
