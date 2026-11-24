import { API_URL } from "../config";
import type { SourceHealth } from "../models/SourceStatus";
import { sourceLabel } from "../models/SourceStatus";
import type { SearchResult } from "./mapSearchItem";

export interface ImageResult {
  success: boolean;
  id: string;
  imageUrl: string;
  fullRes?: string;
  metadata: unknown;
}

interface SearchResponse {
  success?: boolean;
  query?: string;
  results?: SearchResult[] | { results?: SearchResult[]; hasMore?: boolean };
  hasMore?: boolean;
  sourceStatus?: SourceHealth[];
}

export interface SearchTargetsResult {
  success: boolean;
  query: string;
  results: SearchResult[];
  hasMore: boolean;
  sourceStatus: SourceHealth[];
}

const safeJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
};

let pageUnloading = false;
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    pageUnloading = true;
  });
  window.addEventListener("beforeunload", () => {
    pageUnloading = true;
  });
  window.addEventListener("pageshow", () => {
    pageUnloading = false;
  });
}

export const searchTargets = async (
  query: string,
  page = 1,
  source = "all",
): Promise<SearchTargetsResult> => {
  try {
    const response = await fetch(
      `${API_URL}/search?target=${encodeURIComponent(query)}&page=${page}&source=${encodeURIComponent(source)}`,
    );
    if (!response.ok) {
      throw new Error("Search failed");
    }

    const data = await safeJson<SearchResponse>(response);
    const nestedResults = !Array.isArray(data.results) && data.results && "results" in data.results ? data.results.results : null;
    const normalizedResults = Array.isArray(data.results) ? data.results : Array.isArray(nestedResults) ? nestedResults : [];
    const nestedHasMore =
      !Array.isArray(data.results) && data.results && "hasMore" in data.results ? Boolean(data.results.hasMore) : false;
    const normalizedHasMore = typeof data.hasMore === "boolean" ? data.hasMore : nestedHasMore;

    return {
      success: data.success ?? true,
      query: data.query ?? query,
      results: normalizedResults,
      hasMore: normalizedHasMore,
      sourceStatus: Array.isArray(data.sourceStatus) ? data.sourceStatus : [],
    };
  } catch (error) {
    // Leaving the page cancels in-flight requests; that is not an error worth reporting.
    if (!pageUnloading) console.error("searchTargets error", error);
    const requestedSources = source === "all" ? ["nasa", "sdss", "ps1"] : source.split(",").map((item) => item.trim()).filter(Boolean);
    return {
      success: false,
      query,
      results: [],
      hasMore: false,
      sourceStatus: requestedSources.map((sourceKey) => ({
        source: sourceKey,
        label: sourceLabel(sourceKey),
        status: "error",
        count: 0,
        message: "Search request failed.",
        checkedAt: new Date().toISOString(),
      })),
    };
  }
};

export const fetchImage = async (id: string): Promise<ImageResult> => {
  try {
    const response = await fetch(`${API_URL}/image/${id}`);
    if (!response.ok) {
      throw new Error("Image fetch failed");
    }

    const data = await safeJson<ImageResult>(response);
    return data;
  } catch (error) {
    console.error("fetchImage error", error);
    return { success: false, id, imageUrl: "", metadata: null };
  }
};
