import axios from "axios";

const NASA_SEARCH_URL = "https://images-api.nasa.gov/search";
const NASA_ASSET_URL = "https://images-api.nasa.gov/asset";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface SpaceResult {
  id: string;
  title: string;
  instrument: string;
  date: string;
  thumbnailUrl: string;
}

export interface ImageData {
  id: string;
  imageUrl: string;
  fullRes: string;
  metadata: unknown;
}

interface SearchResponse {
  collection: {
    items: Array<{
      data: Array<{ nasa_id: string; title: string; date_created: string }>;
      links: Array<{ href: string }>;
    }>;
    metadata?: { total_hits?: number };
  };
}

interface AssetResponse {
  collection: {
    items: Array<{ href: string }>;
  };
}

export const fetchSearchResults = async (query: string, page = 1): Promise<{ results: SpaceResult[]; hasMore: boolean }> => {
  await delay(150);
  try {
    const response = await axios.get<SearchResponse>(NASA_SEARCH_URL, {
      params: { q: query, media_type: "image", page },
    });

    const items = response.data?.collection?.items ?? [];
    const results = items
      .map((item: any) => {
        const metadata = Array.isArray(item.data) ? item.data[0] : null;
        const link = Array.isArray(item.links) ? item.links[0] : null;
        if (!metadata || !link) {
          return null;
        }

        const id = metadata.nasa_id;
        const title = metadata.title ?? "Untitled";
        const dateString = metadata.date_created ? metadata.date_created.slice(0, 10) : "Unknown";
        const thumbnailUrl = link.href;

        if (!id || !thumbnailUrl) {
          return null;
        }

        return {
          id,
          title,
          instrument: "NASA Image Library",
          date: dateString,
          thumbnailUrl,
        };
      })
      .filter((item: SpaceResult | null) => item !== null) as SpaceResult[];

    const totalHits = response.data?.collection?.metadata?.total_hits ?? 0;
    const hasMore = page * 100 < totalHits; // NASA returns 100 items max per page

    return { results, hasMore };
  } catch (error) {
    console.error("fetchSearchResults error", error);
    return { results: [], hasMore: false };
  }
};

export const fetchImageData = async (id: string): Promise<ImageData> => {
  try {
    const response = await axios.get<AssetResponse>(`${NASA_ASSET_URL}/${id}`);
    const items: Array<{ href: string }> = response.data?.collection?.items ?? [];
    if (!items.length) {
      throw new Error("No asset results returned");
    }

    const imageCandidates = items.filter((item) => /\.(jpg|jpeg|png)$/i.test(item.href));
    if (!imageCandidates.length) {
      throw new Error("No valid image URL");
    }

    const sorted = imageCandidates.sort((a, b) => {
      const sizeA = parseInt(a.href.match(/~orig|~large|~small/) ? "2" : "1", 10);
      const sizeB = parseInt(b.href.match(/~orig|~large|~small/) ? "2" : "1", 10);
      return sizeB - sizeA;
    });

    const fullRes = sorted[0].href;
    const preview = sorted[1]?.href ?? sorted[0].href;

    return {
      id,
      imageUrl: preview,
      fullRes,
      metadata: {
        source: "NASA Image and Video Library",
        nasaId: id,
      },
    };
  } catch (error) {
    console.error("fetchImageData error", error);
    throw error;
  }
};
