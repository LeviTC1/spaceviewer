import type { SearchResult } from "./mapSearchItem";
import type { NasaItem } from "./mapNasaItem";
import type { SpaceImage } from "../models/SpaceImage";

const STRONG_SPACE_TERMS = [
  "nebula",
  "galaxy",
  "star",
  "supernova",
  "exoplanet",
  "planet",
  "lunar",
  "moon",
  "solar",
  "sun",
  "rocket",
  "launch",
  "spacecraft",
  "lander",
  "rover",
  "satellite",
  "iss",
  "international space station",
  "astronaut",
  "crew",
  "spacewalk",
  "eva",
  "capsule",
  "payload",
  "orbital",
  "comet",
  "asteroid",
  "meteor",
  "cosmic",
  "deep field",
  "cluster",
  "orbit",
  "ring",
  "rings",
  "interstellar",
  "milky way",
  "andromeda",
  "quasar",
  "black hole",
  "eclipse",
  "aurora",
  "constellation",
  "atmosphere",
  "plasma",
  "dust",
  "gas",
  "infrared",
  "ultraviolet",
  "x-ray",
  "gamma",
];

const WEAK_SPACE_TERMS = [
  "jwst",
  "james webb",
  "webb",
  "hubble",
  "telescope",
  "observatory",
  "space",
  "nasa",
  "mission",
];

const EVENT_TERMS = [
  "ceremony",
  "activities",
  "activity",
  "competition",
  "stamp",
  "issuance",
  "press",
  "conference",
  "briefing",
  "award",
  "awards",
  "celebration",
  "anniversary",
  "gala",
  "summit",
  "workshop",
  "meeting",
  "panel",
  "speech",
  "robot",
  "robotic",
  "robotics",
  "mining",
  "contest",
  "challenge",
  "expo",
  "exhibition",
  "showcase",
  "demonstration",
  "demo",
  "student",
  "students",
  "team",
  "teams",
  "mentor",
  "mentors",
  "training",
  "lab",
  "laboratory",
  "facility",
  "podium",
  "crowd",
  "auditorium",
  "stage",
  "portrait",
  "group photo",
  "staff",
  "team",
  "employees",
  "intern",
  "outreach",
  "education",
  "student",
  "school",
  "classroom",
  "headquarters",
  "hq",
  "office",
  "visitor",
  "tour",
  "event",
  "ribbon cutting",
  "signing",
  "commencement",
];

const BLOCKED_CENTER_TERMS = ["ksc", "kennedy space center", "nasa hq", "headquarters", "nasa headquarters", "hq"];

const safeString = (value: unknown): string => (typeof value === "string" ? value : "");

const joinKeywords = (value: unknown): string => {
  if (!Array.isArray(value)) return "";
  return value.map((entry) => (typeof entry === "string" ? entry : String(entry))).join(" ");
};

const buildNasaText = (item: NasaItem): string => {
  const data = Array.isArray(item?.data) ? (item.data[0] ?? {}) : {};
  const parts = [
    safeString(data.title),
    safeString(data.description),
    joinKeywords(data.keywords),
    safeString(data.center),
    safeString(data.mission),
    safeString(data.instrument),
    safeString(data.location),
    safeString(data.photographer),
  ];
  return parts.join(" ").toLowerCase();
};

const buildSpaceImageText = (image: SpaceImage): string => {
  const parts = [
    image.title,
    image.description,
    Array.isArray(image.keywords) ? image.keywords.join(" ") : "",
    image.center,
    image.mission,
    image.instrument,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
};

const countMatches = (text: string, terms: string[]): number =>
  terms.reduce((count, term) => (text.includes(term) ? count + 1 : count), 0);

export const isBlockedCenter = (center?: string, mission?: string, instrument?: string): boolean => {
  const values = [center, mission, instrument]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());
  return values.some((value) => BLOCKED_CENTER_TERMS.some((term) => value.includes(term)));
};

const isLikelyNonSpaceNasaItem = (item: NasaItem): boolean => {
  const data = Array.isArray(item?.data) ? (item.data[0] ?? {}) : {};
  const center = safeString(data.center).toLowerCase();
  const mission = safeString(data.mission).toLowerCase();
  const instrument = safeString(data.instrument).toLowerCase();
  const text = buildNasaText(item);
  if (!text.trim()) return false;

  if (isBlockedCenter(center, mission, instrument)) return true;

  const strongScore = countMatches(text, STRONG_SPACE_TERMS);
  if (strongScore > 0) return false;

  const weakScore = countMatches(text, WEAK_SPACE_TERMS);
  const eventScore = countMatches(text, EVENT_TERMS);

  if (eventScore >= 1) return true;
  if (eventScore === 0 && weakScore === 0) return false;

  return false;
};

export const isLikelyNonSpaceImage = (image: SpaceImage): boolean => {
  if (isBlockedCenter(image.center, image.mission, image.instrument)) return true;
  const text = buildSpaceImageText(image);
  if (!text.trim()) return false;
  const strongScore = countMatches(text, STRONG_SPACE_TERMS);
  if (strongScore > 0) return false;
  const eventScore = countMatches(text, EVENT_TERMS);
  return eventScore >= 1;
};

export const filterSearchResults = (results: SearchResult[]): SearchResult[] => {
  return results.filter((result) => {
    const sourceKey = String(result.source ?? "").toLowerCase();
    if (!sourceKey.includes("nasa")) return true;
    return !isLikelyNonSpaceNasaItem(result.item as NasaItem);
  });
};

export const filterSpaceImages = (images: SpaceImage[]): SpaceImage[] =>
  images.filter((image) => !isLikelyNonSpaceImage(image));
