import type { MetadataQuality, SpaceImage } from "../models/SpaceImage";

const hasText = (value?: string) => Boolean(value?.trim());

export const buildMetadataQuality = (image: SpaceImage): MetadataQuality => {
  const factors: string[] = [];
  const missing: string[] = [];
  let score = 0;

  const add = (points: number, factor: string) => {
    score += points;
    factors.push(factor);
  };

  if (hasText(image.title) && image.title !== "Untitled") add(8, "title");
  else missing.push("title");

  if ((image.description?.trim().length ?? 0) >= 80) add(14, "description");
  else if (hasText(image.description)) add(8, "short description");
  else missing.push("description");

  if (image.imageUrl || image.thumbnailUrl) add(14, "preview asset");
  else missing.push("preview asset");

  if (image.fullRes) add(8, "full-resolution asset");
  else missing.push("full-resolution asset");

  if (hasText(image.date) && image.date !== "Unknown") add(10, "date");
  else missing.push("date");

  if (image.archiveId || image.nasaId || image.id) add(8, "archive id");
  else missing.push("archive id");

  if (image.sourceUrl || image.archiveUrl) add(10, "source URL");
  else missing.push("source URL");

  if (image.mission || image.instrument || image.center) add(12, "mission or instrument");
  else missing.push("mission or instrument");

  if ((image.keywords?.length ?? 0) >= 4) add(8, "keywords");
  else if (image.keywords?.length) add(4, "limited keywords");
  else missing.push("keywords");

  if (image.dimensions?.width && image.dimensions?.height) add(8, "dimensions");
  else missing.push("dimensions");

  const boundedScore = Math.max(0, Math.min(100, score));
  const label = boundedScore >= 74 ? "Rich" : boundedScore >= 46 ? "Good" : "Limited";

  return {
    score: boundedScore,
    label,
    factors,
    missing,
  };
};
