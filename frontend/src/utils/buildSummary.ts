import type { SpaceImage } from "../models/SpaceImage";

const clean = (value?: string) => (value ? value.trim() : "");

const takeFirstSentence = (text: string) => {
  const match = text.match(/(.+?[.!?])(\s|$)/);
  return match ? match[1] : text;
};

const truncate = (text: string, maxLength: number) => {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
};

export const buildSummary = (image: SpaceImage): string => {
  const title = clean(image.title) || "Untitled observation";
  const date = clean(image.date);
  const instrument = clean(image.instrument);
  const mission = clean(image.mission);
  const center = clean(image.center);
  const photographer = clean(image.photographer);
  const keywords = Array.isArray(image.keywords) ? image.keywords.map(clean).filter(Boolean) : [];
  const description = clean(image.description);

  const sourceBits = [instrument, mission, center].filter(Boolean);
  const source = sourceBits.length ? sourceBits.join(" / ") : "NASA Image Library";
  const dateLabel = date && date !== "Unknown" ? ` on ${date}` : "";

  let summary = `${title} — observed${dateLabel} via ${source}.`;

  if (description) {
    summary += ` ${truncate(takeFirstSentence(description), 240)}`;
  } else if (keywords.length) {
    summary += ` Key themes include ${keywords.slice(0, 4).join(", ")}.`;
  } else {
    summary += " Additional metadata is limited, but the observation is preserved in the NASA archives.";
  }

  if (photographer) {
    summary += ` Credit: ${photographer}.`;
  }

  return summary.replace(/\s+/g, " ").trim();
};
