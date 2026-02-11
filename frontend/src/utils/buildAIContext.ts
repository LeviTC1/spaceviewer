import type { SpaceImage } from "../models/SpaceImage";

const clean = (value?: string) => (value ? value.trim() : "");

export const buildAIContext = (image: SpaceImage): string => {
  const title = clean(image.title) || "Untitled";
  const date = clean(image.date) || "Unknown";
  const center = clean(image.center);
  const mission = clean(image.mission);
  const photographer = clean(image.photographer) || "Unknown";
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];

  const description = clean(image.description);
  const descriptionFallback = keywords.length ? `${title}. Keywords: ${keywords.join(", ")}` : title;
  const resolvedDescription = description || descriptionFallback;

  const keywordFallback = [title, center].filter(Boolean).join(", ");
  const resolvedKeywords = keywords.length ? keywords.join(", ") : keywordFallback || title;

  const missionCenter = [mission, center].filter(Boolean).join(" / ") || center || mission || "Unknown";

  return [
    `Title: ${title}`,
    `Description: ${resolvedDescription}`,
    `Keywords: ${resolvedKeywords}`,
    `Mission/Center: ${missionCenter}`,
    `Date: ${date}`,
    `Photographer: ${photographer}`,
  ].join("\n");
};
