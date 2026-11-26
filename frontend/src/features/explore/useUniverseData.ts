// Catalogue pipeline for the explorer. Reuses the SkyMap layer system (streamed Gaia DR3 chunks, NASA
// Exoplanet Archive sectors, OpenNGC sectors, LVDB, curated deep-sky seeds) and turns the resulting
// SkyObjects into physically positioned UniverseEntities.

import { useEffect, useMemo, useState } from "react";
import { PREFERENCES_EVENT, readReduceMotion } from "../../shell/preferences";
import { setNearbyStarCatalogEpoch, useNearbyStarCatalog } from "../starmap/useNearbyStars";
import { createSkyLayerRegistry, resolveSkyLayerDataForTime, type SkyLayerData } from "../skymap/core/layers";
import { createSkyObjectRegistry } from "../skymap/core/objectRegistry";
import { createInitialSkyMapState } from "../skymap/core/state";
import { createSkyMapTimeState } from "../skymap/core/time";
import { createDeepSpaceLayerData } from "../skymap/layers/deepSpaceLayer";
import { createExoplanetSystemsLayerData } from "../skymap/layers/exoplanetSystemsLayer";
import { createGalacticStructureLayerData } from "../skymap/layers/galacticStructureLayer";
import { createInterstellarProbesLayerData } from "../skymap/layers/interstellarProbesLayer";
import { createLocalGroupLayerData } from "../skymap/layers/localGroupLayer";
import { createLocalStarLayerData } from "../skymap/layers/localStarsLayer";
import { SKYMAP_LAYER_DEFINITIONS } from "../skymap/layers/registry";
import { createSolarSystemLayerData } from "../skymap/layers/solarSystemLayer";
import { useNearbyExoplanets } from "../skymap/useNearbyExoplanets";
import { useOpenNgcCatalog } from "../skymap/useOpenNgcCatalog";
import { useStreamedSolarEphemeris } from "../../domain/solar";
import { dateToJulianYear, quantizeGaiaPropagationJulianYear } from "../../lib/catalog/starCatalogPropagation";
import { buildUniverseIndex } from "./engine/universeModel";
import { brightStarEntities, useSkyCulture } from "./skyCulture";
import { spacecraftEntities, useSpacecraft } from "./spacecraft";
import { namedMinorBodyEntities, useMinorBodies } from "./minorBodies";

export interface CatalogueStatus {
  id: string;
  label: string;
  status: "idle" | "loading" | "streaming" | "ready" | "fallback" | "error";
  detail: string;
}

/** `epochDateIso` is coarse (day resolution) so catalogue work is not redone every frame. */
export const useUniverseData = (epochDateIso: string, eager: boolean) => {
  const stars = useNearbyStarCatalog();
  const starsReady = stars.status === "ready" || stars.status === "fallback";
  const exoplanets = useNearbyExoplanets(starsReady || eager, eager ? 0 : 1_200);
  const openNgc = useOpenNgcCatalog(starsReady || eager, eager ? 0 : 2_400);
  const sky = useSkyCulture(starsReady || eager);
  const spacecraft = useSpacecraft(true);
  const minor = useMinorBodies(starsReady || eager);
  const solarEphemeris = useStreamedSolarEphemeris(epochDateIso, { includeOrbits: false });
  const registry = useMemo(() => createSkyLayerRegistry(SKYMAP_LAYER_DEFINITIONS), []);
  const layerStates = useMemo(() => createInitialSkyMapState(registry.definitions).layers, [registry.definitions]);

  const epochYear = quantizeGaiaPropagationJulianYear(dateToJulianYear(epochDateIso));
  useEffect(() => {
    void setNearbyStarCatalogEpoch(epochYear);
  }, [epochYear]);

  const layerData = useMemo<SkyLayerData[]>(() => {
    void solarEphemeris.revision;
    return [
      createLocalStarLayerData(stars.stars, {
        version: stars.manifest?.catalog.version,
        catalogRecordCount: stars.manifest?.build.recordCount,
        chunkDefinitions: stars.manifest?.chunks,
        loadedChunkIds: stars.chunks.length ? new Set(stars.chunks.map((chunk) => chunk.chunkId)) : undefined,
        error: stars.status === "error" ? stars.error : null,
      }),
      createSolarSystemLayerData(),
      createInterstellarProbesLayerData(),
      createExoplanetSystemsLayerData(exoplanets.systems, exoplanets.manifest, exoplanets.loadedChunkIds, exoplanets.status, exoplanets.error),
      createGalacticStructureLayerData(),
      createLocalGroupLayerData(),
      ...createDeepSpaceLayerData(openNgc.objects, openNgc.manifest, openNgc.loadedChunkIds, openNgc.status, openNgc.error),
    ];
  }, [
    exoplanets.error,
    exoplanets.loadedChunkIds,
    exoplanets.manifest,
    exoplanets.status,
    exoplanets.systems,
    openNgc.error,
    openNgc.loadedChunkIds,
    openNgc.manifest,
    openNgc.objects,
    openNgc.status,
    solarEphemeris.revision,
    stars.chunks,
    stars.error,
    stars.manifest,
    stars.status,
    stars.stars,
  ]);

  const timeState = useMemo(() => createSkyMapTimeState(new Date(epochDateIso)), [epochDateIso]);
  const objects = useMemo(() => {
    const resolved = resolveSkyLayerDataForTime(registry, layerData, timeState);
    const skyRegistry = createSkyObjectRegistry(registry, resolved, layerStates);
    return skyRegistry.records.map((record) => record.object);
  }, [layerData, layerStates, registry, timeState]);

  const culture = sky.culture;
  const index = useMemo(
    () =>
      buildUniverseIndex(objects, (entities) => [
        ...(culture ? brightStarEntities(culture, entities) : []),
        ...(spacecraft ? spacecraftEntities(spacecraft, entities) : []),
        ...namedMinorBodyEntities(minor.named),
      ]),
    [culture, minor.named, objects, spacecraft],
  );

  const statuses: CatalogueStatus[] = [
    {
      id: "gaia",
      label: "Gaia DR3 stars",
      status: stars.status,
      detail: `${stars.progress.loadedRecords.toLocaleString("en-GB")} of ${stars.progress.totalRecords.toLocaleString("en-GB")} stars`,
    },
    {
      id: "exoplanets",
      label: "NASA Exoplanet Archive",
      status: exoplanets.status,
      detail: `${exoplanets.systems.length.toLocaleString("en-GB")} systems`,
    },
    {
      id: "openngc",
      label: "OpenNGC deep sky",
      status: openNgc.status,
      detail: `${openNgc.objects.length.toLocaleString("en-GB")} objects`,
    },
    {
      id: "bright-stars",
      label: "Hipparcos bright stars & IAU figures",
      status: sky.culture ? "ready" : "loading",
      detail: sky.culture ? `${(sky.bright[0]?.count ?? 0).toLocaleString("en-GB")} stars Gaia cannot measure · ${sky.culture.constellations.length} constellations` : "After the nearby stars",
    },
    {
      id: "minor-bodies",
      label: "JPL Small-Body Database orbits",
      status: minor.orbits ? "ready" : "loading",
      detail: minor.orbits ? `${minor.orbits.count.toLocaleString("en-GB")} asteroids, Trojans, centaurs and Kuiper Belt objects` : "After the nearby stars",
    },
    {
      id: "spacecraft",
      label: "JPL Horizons spacecraft & CelesTrak orbits",
      status: spacecraft ? "ready" : "loading",
      detail: spacecraft ? `${spacecraft.missions.length} missions · ${spacecraft.orbiters.length} Earth orbiters${spacecraft.orbiters.some((orbiter) => orbiter.live) ? " (live elements)" : ""}` : "Loading trajectories",
    },
    {
      id: "ephemeris",
      label: "VSOP87 planetary positions",
      status: solarEphemeris.positionsReady ? "ready" : solarEphemeris.status === "fallback" ? "fallback" : "loading",
      detail: solarEphemeris.positionsReady ? `VSOP87C ${solarEphemeris.activeYear ?? ""}` : "Keplerian elements until the ephemeris block arrives",
    },
  ];

  return { index, starChunks: stars.chunks, statuses, starsStatus: stars.status, brightChunks: sky.bright, skyCulture: sky.culture, minorOrbits: minor.orbits };
};

export const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() => readReduceMotion());
  useEffect(() => {
    const update = () => setReduced(readReduceMotion());
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    query?.addEventListener("change", update);
    window.addEventListener(PREFERENCES_EVENT, update);
    return () => {
      query?.removeEventListener("change", update);
      window.removeEventListener(PREFERENCES_EVENT, update);
    };
  }, []);
  return reduced;
};
