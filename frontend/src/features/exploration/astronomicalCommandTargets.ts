import type { SolarLaunchTarget } from "../solar/solarRoutes";
import { SMALL_BODIES } from "../solar/smallBodies/smallBodyData";
import { NEARBY_STARS } from "../../data/nearbyStars";
import { GALACTIC_STRUCTURE_OBJECTS } from "../skymap/layers/galacticStructureLayer";
import { COSMOLOGICAL_STRUCTURE_OBJECTS } from "../skymap/layers/cosmologicalStructureLayer";

export type AstronomicalCommandDestination =
  | { surface: "solar"; target: SolarLaunchTarget }
  | { surface: "skymap"; objectId: string };

export interface AstronomicalCommandTarget {
  id: string;
  label: string;
  meta: string;
  badge: string;
  keywords: string;
  destination: AstronomicalCommandDestination;
}

const smallBodyTargets: AstronomicalCommandTarget[] = SMALL_BODIES.map((body) => ({
  id: `solar-object:small-body:${body.id}`,
  label: body.name,
  meta: `Open ${body.catalogName} in Solar Explorer`,
  badge: body.kind === "comet" ? "Comet" : "Dwarf planet",
  keywords: [
    body.id,
    body.name,
    body.catalogName,
    body.kind,
    body.source.orbitClassName,
    ...body.aliases,
    ...body.facts,
    "solar explorer",
  ].join(" "),
  destination: {
    surface: "solar",
    target: { kind: "small-body", smallBodyId: body.id, navigationMode: "planetary" },
  },
}));

const namedStarTargets: AstronomicalCommandTarget[] = [...NEARBY_STARS]
  .sort((left, right) => right.importance - left.importance || left.name.localeCompare(right.name))
  .map((star) => ({
    id: `skymap-object:star:${star.id}`,
    label: star.name,
    meta: `Focus in SkyMap · ${star.distanceLy.toFixed(2)} ly · curated navigation seed`,
    badge: "Star",
    keywords: [
      star.id,
      star.sourceId,
      star.name,
      star.spectralType,
      ...star.aliases,
      "nearby star",
      "stellar neighbourhood",
      "SkyMap",
    ].filter(Boolean).join(" "),
    destination: { surface: "skymap", objectId: `star:${star.id}` },
  }));

const structureTargets: AstronomicalCommandTarget[] = [
  ...GALACTIC_STRUCTURE_OBJECTS,
  ...COSMOLOGICAL_STRUCTURE_OBJECTS,
].map((target) => ({
  id: `skymap-object:${target.id}`,
  label: target.name,
  meta: target.search?.description ?? "Open the scientific structure layer in SkyMap",
  badge: target.kind === "cosmological-feature" ? "Cosmos" : "Galactic",
  keywords: [
    target.id,
    target.name,
    ...(target.search?.aliases ?? []),
    ...(target.search?.tags ?? []),
    ...(target.search?.keywords ?? []),
    "SkyMap",
  ].join(" "),
  destination: { surface: "skymap", objectId: target.id },
}));

export const ASTRONOMICAL_COMMAND_TARGETS = [
  ...smallBodyTargets,
  ...namedStarTargets,
  ...structureTargets,
];
