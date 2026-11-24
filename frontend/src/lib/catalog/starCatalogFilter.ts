import type {
  StarCatalogViewFilterRequest,
  StarCatalogViewFilterResult,
} from "./starCatalogTypes";

export interface StarCatalogFilterChunkInput {
  chunkId: string;
  renderPositions: Float32Array;
  apparentMagnitudeG: Float32Array;
}

const DEFAULT_FRUSTUM_PADDING = 1.08;

const validateRequest = (request: StarCatalogViewFilterRequest) => {
  if (request.viewProjectionMatrix.length !== 16 || request.viewProjectionMatrix.some((value) => !Number.isFinite(value))) {
    throw new Error("Star catalogue view filtering requires a finite 4x4 view-projection matrix.");
  }
  if (!Number.isFinite(request.positionScale) || request.positionScale <= 0) {
    throw new Error("Star catalogue view filtering requires a positive position scale.");
  }
  if (!Number.isFinite(request.magnitudeLimitG)) {
    throw new Error("Star catalogue view filtering requires a finite Gaia G magnitude limit.");
  }
  if (!(Number.isFinite(request.pointBudget) || request.pointBudget === Number.POSITIVE_INFINITY) || request.pointBudget < 0) {
    throw new Error("Star catalogue view filtering requires a non-negative point budget.");
  }
  const frustumPadding = request.frustumPadding ?? DEFAULT_FRUSTUM_PADDING;
  if (!Number.isFinite(frustumPadding) || frustumPadding < 1 || frustumPadding > 2) {
    throw new Error("Star catalogue frustum padding must be between 1 and 2.");
  }
  return frustumPadding;
};

const isInsideClipFrustum = (
  positions: Float32Array,
  index: number,
  matrix: number[],
  positionScale: number,
  padding: number,
) => {
  const offset = index * 3;
  const x = positions[offset] * positionScale;
  const y = positions[offset + 1] * positionScale;
  const z = positions[offset + 2] * positionScale;
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  const clipZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  const clipW = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  if (clipW <= 0) return false;
  const paddedW = clipW * padding;
  return clipX >= -paddedW && clipX <= paddedW && clipY >= -paddedW && clipY <= paddedW && clipZ >= -clipW && clipZ <= clipW;
};

export const filterStarCatalogView = (
  chunks: StarCatalogFilterChunkInput[],
  request: StarCatalogViewFilterRequest,
): StarCatalogViewFilterResult => {
  const frustumPadding = validateRequest(request);
  const candidateIndices: Uint32Array[] = [];
  const candidateCounts = new Uint32Array(chunks.length);
  const magnitudeEligibleByChunk = new Uint32Array(chunks.length);
  let totalRecords = 0;
  let magnitudeEligibleRecords = 0;
  let frustumVisibleRecords = 0;

  chunks.forEach((chunk, chunkIndex) => {
    const recordCount = chunk.apparentMagnitudeG.length;
    if (chunk.renderPositions.length !== recordCount * 3) {
      throw new Error(`Star catalogue filter chunk ${chunk.chunkId} has mismatched position and magnitude columns.`);
    }
    totalRecords += recordCount;
    const candidates = new Uint32Array(recordCount);
    let candidateCount = 0;
    for (let index = 0; index < recordCount; index += 1) {
      const magnitude = chunk.apparentMagnitudeG[index];
      if (!Number.isFinite(magnitude) || magnitude > request.magnitudeLimitG) continue;
      magnitudeEligibleRecords += 1;
      magnitudeEligibleByChunk[chunkIndex] += 1;
      if (!isInsideClipFrustum(
        chunk.renderPositions,
        index,
        request.viewProjectionMatrix,
        request.positionScale,
        frustumPadding,
      )) continue;
      candidates[candidateCount] = index;
      candidateCount += 1;
    }
    candidateIndices.push(candidates);
    candidateCounts[chunkIndex] = candidateCount;
    frustumVisibleRecords += candidateCount;
  });

  const finiteBudget = Number.isFinite(request.pointBudget)
    ? Math.max(0, Math.floor(request.pointBudget))
    : frustumVisibleRecords;
  const renderedRecords = Math.min(frustumVisibleRecords, finiteBudget);
  const selectedByChunk = chunks.map((_, index) => new Uint32Array(Math.min(candidateCounts[index], renderedRecords)));
  const selectedCounts = new Uint32Array(chunks.length);
  const candidateOffsets = new Uint32Array(chunks.length);

  for (let selected = 0; selected < renderedRecords; selected += 1) {
    let brightestChunk = -1;
    let brightestMagnitude = Number.POSITIVE_INFINITY;
    let brightestIndex = Number.POSITIVE_INFINITY;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const candidateOffset = candidateOffsets[chunkIndex];
      if (candidateOffset >= candidateCounts[chunkIndex]) continue;
      const recordIndex = candidateIndices[chunkIndex][candidateOffset];
      const magnitude = chunks[chunkIndex].apparentMagnitudeG[recordIndex];
      if (
        magnitude < brightestMagnitude ||
        (magnitude === brightestMagnitude && (chunkIndex < brightestChunk || (chunkIndex === brightestChunk && recordIndex < brightestIndex)))
      ) {
        brightestChunk = chunkIndex;
        brightestMagnitude = magnitude;
        brightestIndex = recordIndex;
      }
    }
    if (brightestChunk < 0) break;
    const outputOffset = selectedCounts[brightestChunk];
    selectedByChunk[brightestChunk][outputOffset] = brightestIndex;
    selectedCounts[brightestChunk] = outputOffset + 1;
    candidateOffsets[brightestChunk] += 1;
  }

  return {
    chunks: chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      indices: selectedByChunk[index].slice(0, selectedCounts[index]),
      magnitudeEligibleRecords: magnitudeEligibleByChunk[index],
      frustumVisibleRecords: candidateCounts[index],
      renderedRecords: selectedCounts[index],
    })),
    diagnostics: {
      totalRecords,
      magnitudeEligibleRecords,
      frustumVisibleRecords,
      renderedRecords,
      magnitudeCulledRecords: totalRecords - magnitudeEligibleRecords,
      frustumCulledRecords: magnitudeEligibleRecords - frustumVisibleRecords,
      budgetCulledRecords: frustumVisibleRecords - renderedRecords,
      magnitudeLimitG: request.magnitudeLimitG,
      pointBudget: finiteBudget,
      frustumPadding,
    },
  };
};
