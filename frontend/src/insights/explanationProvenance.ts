import type { SpaceImage } from "../models/SpaceImage";
import type { AiMode } from "./generateSummary";

export interface ExplanationProvenance {
  methodLabel: string;
  modeLabel: string;
  confidenceLabel: "High" | "Medium" | "Low";
  confidenceScore: number;
  evidence: string[];
  missing: string[];
  caveats: string[];
}

const hasText = (value?: string) => Boolean(value?.trim());

const sourceLabel = (source?: string) => {
  switch (source) {
    case "nasa":
      return "NASA Image Library";
    case "sdss":
      return "SDSS";
    case "ps1":
      return "Pan-STARRS";
    case "skymap":
      return "SkyMap object record";
    case "local":
      return "Local fixture";
    default:
      return source ? source.toUpperCase() : "source metadata";
  }
};

export const buildExplanationProvenance = (image: SpaceImage, mode: AiMode): ExplanationProvenance => {
  const evidence: string[] = [];
  const missing = new Set<string>(image.metadataQuality?.missing ?? []);
  const caveats = new Set<string>();

  if (hasText(image.title) && image.title !== "Untitled") evidence.push("title");
  else missing.add("title");

  if ((image.description?.trim().length ?? 0) >= 80) evidence.push("long description");
  else if (hasText(image.description)) {
    evidence.push("short description");
    caveats.add("Description is brief, so the explanation may miss context.");
  } else {
    missing.add("description");
  }

  if (image.keywords?.length) evidence.push(`${image.keywords.length} keyword${image.keywords.length === 1 ? "" : "s"}`);
  else missing.add("keywords");

  if (image.mission || image.instrument) evidence.push("mission/instrument");
  else if (image.center) evidence.push("source center");
  else missing.add("mission or instrument");

  if (hasText(image.date) && image.date !== "Unknown") evidence.push("observation date");
  else missing.add("date");

  if (image.archiveId || image.nasaId || image.sourceUrl || image.archiveUrl) evidence.push(`${sourceLabel(image.source)} provenance`);
  else missing.add("source URL");

  if (image.dimensions?.width && image.dimensions?.height) evidence.push("image dimensions");

  const baseScore =
    image.metadataQuality?.score ??
    Math.min(100, evidence.length * 13 + (hasText(image.description) ? 10 : 0) + (image.keywords?.length ? 8 : 0));
  const confidenceScore = Math.max(0, Math.min(100, Math.round(baseScore)));
  const confidenceLabel = confidenceScore >= 74 ? "High" : confidenceScore >= 46 ? "Medium" : "Low";

  caveats.add("No remote model call is made here; this text is generated deterministically from available metadata.");
  caveats.add("Object type, rarity, and context are heuristic labels, not archive-certified classifications.");

  if (confidenceLabel === "Low") {
    caveats.add("Sparse metadata means the explanation should be treated as a starting point.");
  }

  return {
    methodLabel: "Deterministic metadata summary",
    modeLabel: mode === "beginner" ? "Beginner explanation" : "Scientific notes",
    confidenceLabel,
    confidenceScore,
    evidence: Array.from(new Set(evidence)).slice(0, 7),
    missing: Array.from(missing).slice(0, 8),
    caveats: Array.from(caveats).slice(0, 4),
  };
};
