import { API_BASE_URL } from "../config";

// Strongly typed API helpers + mock fallbacks.
export interface SpaceResult {
  id: string;
  title: string;
  instrument: string;
  date: string;
  thumbnailUrl: string;
}

export interface ImageResult {
  success: boolean;
  id: string;
  imageUrl: string;
  metadata: unknown;
}

export interface AnalysisRegion {
  x: number;
  y: number;
  r: number;
}

export interface AnalysisData {
  detectedObjects: number;
  highlightedRegions: AnalysisRegion[];
}

interface SearchResponse {
  success?: boolean;
  query?: string;
  results?: SpaceResult[] | { results?: SpaceResult[]; hasMore?: boolean };
  hasMore?: boolean;
}

const mockResults: SpaceResult[] = [
  {
    id: "jwst-demo-1",
    title: "Carina Nebula, deep field",
    instrument: "NIRCam",
    date: "2025-05-01",
    thumbnailUrl: "https://images-assets.nasa.gov/image/PIA25581/PIA25581~orig.jpg",
  },
  {
    id: "jwst-demo-2",
    title: "Pillars of Creation, infrared",
    instrument: "MIRI",
    date: "2025-03-22",
    thumbnailUrl: "https://images-assets.nasa.gov/image/PIA25574/PIA25574~orig.jpg",
  },
  {
    id: "jwst-demo-3",
    title: "Compact galaxy cluster",
    instrument: "NIRSpec",
    date: "2025-02-11",
    thumbnailUrl: "https://images-assets.nasa.gov/image/PIA25575/PIA25575~orig.jpg",
  },
];

const mockAnalysis: AnalysisData = {
  detectedObjects: 3,
  highlightedRegions: [
    { x: 10, y: 20, r: 48 },
    { x: 40, y: 65, r: 32 },
    { x: 70, y: 30, r: 40 },
  ],
};

const safeJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
};

export const searchTargets = async (
  query: string,
  page = 1,
): Promise<{ success: boolean; query: string; results: SpaceResult[]; hasMore: boolean }> => {
  try {
    const response = await fetch(`${API_BASE_URL}/search?target=${encodeURIComponent(query)}&page=${page}`);
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
    };
  } catch (error) {
    console.error("searchTargets error", error);
    return { success: false, query, results: [], hasMore: false };
  }
};

export const fetchImage = async (id: string): Promise<ImageResult> => {
  try {
    const response = await fetch(`${API_BASE_URL}/image/${id}`);
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

export const runAnalysis = async (id: string): Promise<AnalysisData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/analyze/${id}`, {
      method: "POST",
    });
    if (!response.ok) throw new Error("Analysis failed");
    const data = await safeJson<{ analysis?: AnalysisData }>(response);
    return data.analysis ?? mockAnalysis;
  } catch (error) {
    console.warn("Falling back to mock analysis", error);
    return mockAnalysis;
  }
};
