import { useEffect, useSyncExternalStore } from "react";
import type { NearbyStar } from "../../data/nearbyStars";
import { StarCatalogLoader } from "../../lib/catalog/StarCatalogLoader";
import type {
  DecodedStarCatalogChunk,
  StarCatalogLoadProgress,
  StarCatalogManifest,
  StarCatalogPriorityDirection,
  StarCatalogViewFilterRequest,
} from "../../lib/catalog/starCatalogTypes";
import {
  dateToJulianYear,
  GAIA_PROPAGATION_MAX_JULIAN_YEAR,
  GAIA_PROPAGATION_MIN_JULIAN_YEAR,
  GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
  propagateGaiaSixParameterCovariance,
  quantizeGaiaPropagationJulianYear,
} from "../../lib/catalog/starCatalogPropagation";

export type NearbyStarCatalogStatus = "idle" | "loading" | "streaming" | "ready" | "fallback" | "error";
export type NearbyStarPropagationStatus = "catalog-epoch" | "updating" | "propagated" | "unavailable" | "error";

export interface NearbyStarPropagationState {
  status: NearbyStarPropagationStatus;
  requestedEpochJulianYear: number;
  renderEpochJulianYear: number;
  minimumJulianYear: number;
  maximumJulianYear: number;
  radialVelocityRecordCount: number;
  radialVelocityFallbackRecordCount: number;
  message: string;
  error: string | null;
}

export interface NearbyStarCatalogState {
  status: NearbyStarCatalogStatus;
  stars: NearbyStar[];
  chunks: DecodedStarCatalogChunk[];
  manifest: StarCatalogManifest | null;
  progress: StarCatalogLoadProgress;
  message: string;
  error: string | null;
  propagation: NearbyStarPropagationState;
}

const EMPTY_PROGRESS: StarCatalogLoadProgress = {
  loadedChunks: 0,
  totalChunks: 0,
  loadedRecords: 0,
  totalRecords: 0,
  loadedBytes: 0,
  totalBytes: 0,
  activeChunkId: null,
  schedulingMode: "manifest-order",
  priorityDirectionIcrs: null,
};

const createInitialPropagationState = (): NearbyStarPropagationState => ({
  status: "catalog-epoch",
  requestedEpochJulianYear: GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
  renderEpochJulianYear: GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
  minimumJulianYear: GAIA_PROPAGATION_MIN_JULIAN_YEAR,
  maximumJulianYear: GAIA_PROPAGATION_MAX_JULIAN_YEAR,
  radialVelocityRecordCount: 0,
  radialVelocityFallbackRecordCount: 0,
  message: "Gaia positions are at the J2016.0 catalogue epoch.",
  error: null,
});

let snapshot: NearbyStarCatalogState = {
  status: "idle",
  stars: [],
  chunks: [],
  manifest: null,
  progress: EMPTY_PROGRESS,
  message: "Star catalogue is waiting to load.",
  error: null,
  propagation: createInitialPropagationState(),
};
let loadPromise: Promise<void> | null = null;
let loader: StarCatalogLoader | null = null;
let recoveryStars: NearbyStar[] = [];
let propagationRequestToken = 0;
let requestedPropagationEpoch = GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
let requestedPriorityDirection: StarCatalogPriorityDirection | null = null;
const listeners = new Set<() => void>();

const publish = (next: NearbyStarCatalogState) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

const finiteOrUndefined = (value: number) => (Number.isFinite(value) ? value : undefined);

const decodedChunkToStars = (chunk: DecodedStarCatalogChunk): NearbyStar[] =>
  chunk.metadata.navigationRecords.map((metadata) => {
    const index = metadata.binaryIndex;
    const radialVelocityKmS = finiteOrUndefined(chunk.columns.radialVelocityKmS[index]);
    const radialVelocityErrorKmS = finiteOrUndefined(chunk.columns.radialVelocityErrorKmS[index]);
    const propagatedCovariance = propagateGaiaSixParameterCovariance({
      referenceEpochJulianYear: GAIA_REFERENCE_EPOCH_JULIAN_YEAR,
      targetJulianYear: chunk.renderEpochJulianYear,
      raDeg: chunk.columns.raDeg[index],
      decDeg: chunk.columns.decDeg[index],
      parallaxMas: chunk.columns.parallaxMas[index],
      pmRaMasYr: chunk.columns.pmRaMasYr[index],
      pmDecMasYr: chunk.columns.pmDecMasYr[index],
      radialVelocityKmS,
      radialVelocityErrorKmS,
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
    return {
    id: metadata.id,
    sourceId: metadata.sourceId,
    name: metadata.name,
    aliases: metadata.aliases,
    distanceLy: chunk.columns.distanceLy[index],
    x: chunk.renderPositions[index * 3],
    y: chunk.renderPositions[index * 3 + 1],
    z: chunk.renderPositions[index * 3 + 2],
    temperature: finiteOrUndefined(chunk.columns.temperatureK[index]),
    apparentMagnitudeG: chunk.columns.apparentMagnitudeG[index],
    colorIndexBpRp: finiteOrUndefined(chunk.columns.colorIndexBpRp[index]),
    referenceEpochJulianYear: 2016,
    renderEpochJulianYear: chunk.renderEpochJulianYear,
    raDeg: chunk.columns.raDeg[index],
    raErrorMas: chunk.columns.raErrorMas[index],
    decDeg: chunk.columns.decDeg[index],
    decErrorMas: chunk.columns.decErrorMas[index],
    parallaxMas: chunk.columns.parallaxMas[index],
    parallaxErrorMas: chunk.columns.parallaxErrorMas[index],
    pmRaMasYr: chunk.columns.pmRaMasYr[index],
    pmRaErrorMasYr: chunk.columns.pmRaErrorMasYr[index],
    pmDecMasYr: chunk.columns.pmDecMasYr[index],
    pmDecErrorMasYr: chunk.columns.pmDecErrorMasYr[index],
    radialVelocityKmS,
    radialVelocityErrorKmS,
    radialVelocityApplied: typeof radialVelocityKmS === "number",
    propagatedAngularUncertaintyMas: propagatedCovariance.angularEllipse.rmsMas,
    propagatedAngularUncertaintySemiMajorMas: propagatedCovariance.angularEllipse.semiMajorMas,
    propagatedAngularUncertaintySemiMinorMas: propagatedCovariance.angularEllipse.semiMinorMas,
    propagatedAngularUncertaintyPositionAngleDeg: propagatedCovariance.angularEllipse.positionAngleDeg,
    propagatedPositionUncertaintySemiMajorLy: propagatedCovariance.positionEllipsoid.semiMajorLy,
    propagatedPositionUncertaintySemiIntermediateLy: propagatedCovariance.positionEllipsoid.semiIntermediateLy,
    propagatedPositionUncertaintySemiMinorLy: propagatedCovariance.positionEllipsoid.semiMinorLy,
    propagatedPositionUncertaintyRadialLy: propagatedCovariance.positionEllipsoid.radialSigmaLy,
    propagatedPositionUncertaintyTransverseRmsLy: propagatedCovariance.positionEllipsoid.transverseRmsLy,
    propagatedCovarianceModel: propagatedCovariance.model,
    propagatedCovarianceRadialVelocityTreatment: propagatedCovariance.radialVelocityTreatment,
    ruwe: finiteOrUndefined(chunk.columns.ruwe[index]),
    sourceKind: "gaia-dr3" as const,
    catalogChunkId: chunk.chunkId,
    exoplanetHostCrossmatch: metadata.exoplanetHostCrossmatch,
    importance: metadata.importance,
    sourceRow: metadata.sourceRow,
    };
  });

const formatProgressMessage = (progress: StarCatalogLoadProgress) => {
  if (!progress.totalChunks) return "Reading star catalogue manifest.";
  if (progress.loadedChunks === progress.totalChunks) {
    return `${progress.loadedRecords.toLocaleString()} Gaia DR3 sources loaded from ${progress.loadedChunks} binary chunks.`;
  }
  const queueLabel = progress.schedulingMode === "view-adjacent" ? "live view-priority queue" : "manifest queue";
  return `Streaming ${progress.activeChunkId ?? "next chunk"} from the ${queueLabel}: ${progress.loadedRecords.toLocaleString()}/${progress.totalRecords.toLocaleString()} sources loaded.`;
};

const loadFallback = async (reason: string) => {
  try {
    const fallback = await import("../../data/nearbyStars");
    publish({
      ...snapshot,
      status: "fallback",
      stars: fallback.NEARBY_STARS,
      chunks: [],
      progress: {
        loadedChunks: 0,
        totalChunks: 0,
        loadedRecords: fallback.NEARBY_STARS.length,
        totalRecords: fallback.NEARBY_STARS.length,
        loadedBytes: 0,
        totalBytes: 0,
        activeChunkId: null,
        schedulingMode: "manifest-order",
        priorityDirectionIcrs: null,
      },
      message: `Binary catalogue unavailable; using the bundled ${fallback.NEARBY_STARS.length}-star recovery seed.`,
      error: reason,
      propagation: {
        ...snapshot.propagation,
        status: "unavailable",
        message: "The recovery seed has no reviewed proper-motion model and remains static.",
        error: reason,
      },
    });
  } catch (error) {
    publish({
      ...snapshot,
      status: "error",
      stars: [],
      chunks: [],
      message: "The nearby-star catalogue could not be loaded.",
      error: error instanceof Error ? error.message : reason,
      propagation: {
        ...snapshot.propagation,
        status: "error",
        message: "Stellar epoch propagation is unavailable because the catalogue did not load.",
        error: error instanceof Error ? error.message : reason,
      },
    });
  }
};

export const startNearbyStarCatalogLoad = () => {
  if (loadPromise) return loadPromise;
  loader = new StarCatalogLoader();
  loader.setPriorityDirection(requestedPriorityDirection);
  if (requestedPropagationEpoch !== GAIA_REFERENCE_EPOCH_JULIAN_YEAR) {
    void loader.setTargetJulianYear(requestedPropagationEpoch).catch(() => undefined);
  }
  publish({
    ...snapshot,
    status: "loading",
    message: "Reading star catalogue manifest.",
    error: null,
  });
  loadPromise = import("../../data/nearbyStars")
    .then((fallback) => {
      recoveryStars = fallback.NEARBY_STARS;
      return loader?.load(
        "/catalogs/nearby-stars/manifest.json",
        {
          onManifest: (manifest) => {
            publish({
              ...snapshot,
              manifest,
              progress: {
                ...EMPTY_PROGRESS,
                totalChunks: manifest.build.chunkCount,
                totalRecords: manifest.build.recordCount,
                totalBytes: manifest.build.totalBinaryBytes,
                activeChunkId: manifest.chunks[0]?.id ?? null,
                schedulingMode: requestedPriorityDirection ? "view-adjacent" : "manifest-order",
                priorityDirectionIcrs: requestedPriorityDirection,
              },
              message: `Streaming ${manifest.catalog.title}.`,
              propagation: {
                ...snapshot.propagation,
                radialVelocityRecordCount: manifest.build.propagation.radialVelocityRecordCount,
                radialVelocityFallbackRecordCount: manifest.build.propagation.radialVelocityFallbackRecordCount,
              },
            });
          },
          onChunk: (chunk, progress) => {
            const chunks = [...snapshot.chunks, chunk].sort((left, right) => left.chunkIndex - right.chunkIndex);
            const stars = [...recoveryStars, ...chunks.flatMap(decodedChunkToStars)];
            const renderEpochJulianYear = chunk.renderEpochJulianYear;
            publish({
              ...snapshot,
              status: progress.loadedChunks === progress.totalChunks ? "ready" : "streaming",
              chunks,
              stars,
              progress,
              message: formatProgressMessage(progress),
              propagation: {
                ...snapshot.propagation,
                status: renderEpochJulianYear === GAIA_REFERENCE_EPOCH_JULIAN_YEAR ? "catalog-epoch" : "propagated",
                requestedEpochJulianYear: requestedPropagationEpoch,
                renderEpochJulianYear,
                message: renderEpochJulianYear === GAIA_REFERENCE_EPOCH_JULIAN_YEAR
                  ? "Gaia positions are at the J2016.0 catalogue epoch."
                  : `Gaia space motions are rendered at J${renderEpochJulianYear.toFixed(2)}.`,
                error: null,
              },
            });
          },
          onProgress: (progress) => {
            publish({
              ...snapshot,
              status: progress.loadedChunks ? "streaming" : "loading",
              progress,
              message: formatProgressMessage(progress),
            });
          },
        },
      );
    })
    .then(() => {
      publish({
        ...snapshot,
        status: "ready",
        message: formatProgressMessage(snapshot.progress),
      });
    })
    .catch((error) => loadFallback(error instanceof Error ? error.message : "Unknown binary catalogue failure."));
  return loadPromise;
};

export const setNearbyStarCatalogEpoch = async (dateOrJulianYear: Date | string | number) => {
  const targetJulianYear = quantizeGaiaPropagationJulianYear(
    typeof dateOrJulianYear === "number" ? dateOrJulianYear : dateToJulianYear(dateOrJulianYear),
  );
  requestedPropagationEpoch = targetJulianYear;
  if (
    snapshot.propagation.requestedEpochJulianYear === targetJulianYear &&
    snapshot.propagation.renderEpochJulianYear === targetJulianYear &&
    snapshot.propagation.status !== "error"
  ) return;

  const requestToken = ++propagationRequestToken;
  publish({
    ...snapshot,
    propagation: {
      ...snapshot.propagation,
      status: snapshot.status === "fallback" ? "unavailable" : "updating",
      requestedEpochJulianYear: targetJulianYear,
      message: snapshot.status === "fallback"
        ? "The recovery seed has no reviewed proper-motion model and remains static."
        : `Propagating loaded Gaia space-motion chunks to J${targetJulianYear.toFixed(2)} in the catalogue Worker.`,
      error: null,
    },
  });
  if (!loader || snapshot.status === "fallback" || snapshot.status === "error") return;

  try {
    const result = await loader.setTargetJulianYear(targetJulianYear);
    if (requestToken !== propagationRequestToken) return;
    const propagatedById = new Map(result.chunks.map((chunk) => [chunk.chunkId, chunk.renderPositions]));
    const chunks = snapshot.chunks.map((chunk) => {
      const renderPositions = propagatedById.get(chunk.chunkId);
      return renderPositions
        ? { ...chunk, renderPositions, renderEpochJulianYear: result.targetJulianYear }
        : chunk;
    });
    const stars = [...recoveryStars, ...chunks.flatMap(decodedChunkToStars)];
    const hasLoadedChunks = chunks.length > 0;
    publish({
      ...snapshot,
      chunks,
      stars,
      propagation: {
        ...snapshot.propagation,
        status: hasLoadedChunks
          ? result.targetJulianYear === GAIA_REFERENCE_EPOCH_JULIAN_YEAR ? "catalog-epoch" : "propagated"
          : "updating",
        requestedEpochJulianYear: result.targetJulianYear,
        renderEpochJulianYear: hasLoadedChunks ? result.targetJulianYear : snapshot.propagation.renderEpochJulianYear,
        message: hasLoadedChunks
          ? result.targetJulianYear === GAIA_REFERENCE_EPOCH_JULIAN_YEAR
            ? "Gaia positions are restored to the J2016.0 catalogue epoch."
            : `Gaia space motions are rendered at J${result.targetJulianYear.toFixed(2)}.`
          : `Gaia chunks will decode directly at J${result.targetJulianYear.toFixed(2)} as they stream.`,
        error: null,
      },
    });
  } catch (error) {
    if (requestToken !== propagationRequestToken) return;
    const message = error instanceof Error ? error.message : "Unknown Gaia proper-motion propagation failure.";
    publish({
      ...snapshot,
      propagation: {
        ...snapshot.propagation,
        status: "error",
        message: "Gaia proper-motion propagation failed; the last valid position buffers remain visible.",
        error: message,
      },
    });
  }
};

export const subscribeNearbyStarCatalog = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getNearbyStarCatalogSnapshot = () => snapshot;

export const filterNearbyStarCatalogView = (request: StarCatalogViewFilterRequest) => {
  if (!loader) return Promise.reject(new Error("Star catalogue loader is not ready for view filtering."));
  return loader.filterView(request);
};

export const updateNearbyStarCatalogPriorityDirection = (direction: StarCatalogPriorityDirection | null) => {
  requestedPriorityDirection = direction;
  loader?.setPriorityDirection(direction);
};

export const useNearbyStarCatalog = () => {
  const state = useSyncExternalStore(
    subscribeNearbyStarCatalog,
    getNearbyStarCatalogSnapshot,
    getNearbyStarCatalogSnapshot,
  );
  useEffect(() => {
    void startNearbyStarCatalogLoad();
  }, []);
  return state;
};

export const resetNearbyStarCatalogForTests = () => {
  loader?.dispose();
  loader = null;
  loadPromise = null;
  recoveryStars = [];
  propagationRequestToken = 0;
  requestedPropagationEpoch = GAIA_REFERENCE_EPOCH_JULIAN_YEAR;
  requestedPriorityDirection = null;
  snapshot = {
    status: "idle",
    stars: [],
    chunks: [],
    manifest: null,
    progress: EMPTY_PROGRESS,
    message: "Star catalogue is waiting to load.",
    error: null,
    propagation: createInitialPropagationState(),
  };
  listeners.clear();
};
