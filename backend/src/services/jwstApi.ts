import axios from "axios";

const NASA_SEARCH_URL = "https://images-api.nasa.gov/search";
const NASA_ASSET_URL = "https://images-api.nasa.gov/asset";
const NASA_TIMEOUT_MS = 12000;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const ASSET_CACHE_TTL_MS = 60 * 60 * 1000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface NasaItem {
  data?: Array<Record<string, unknown>>;
  links?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ImageData {
  id: string;
  imageUrl: string;
  fullRes: string;
  metadata: unknown;
}

interface SearchResponse {
  collection: {
    items: NasaItem[];
    metadata?: { total_hits?: number };
  };
}

interface AssetResponse {
  collection: {
    items: Array<{ href: string }>;
  };
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

const searchCache = new Map<string, CacheEntry<{ results: NasaItem[]; hasMore: boolean }>>();
const assetCache = new Map<string, CacheEntry<ImageData>>();

const pruneExpiredEntries = <T>(cache: Map<string, CacheEntry<T>>) => {
  const now = Date.now();
  let expired = 0;
  cache.forEach((entry, key) => {
    if (entry.expiresAt <= now) {
      cache.delete(key);
      expired += 1;
    }
  });
  return expired;
};

const getCacheStats = <T>(cache: Map<string, CacheEntry<T>>) => {
  pruneExpiredEntries(cache);
  const now = Date.now();
  const expirations = Array.from(cache.values()).map((entry) => entry.expiresAt - now);
  return {
    entries: cache.size,
    nextExpiryMs: expirations.length ? Math.min(...expirations) : null,
  };
};

export const getNasaServiceDiagnostics = () => ({
  endpoint: {
    search: NASA_SEARCH_URL,
    asset: NASA_ASSET_URL,
  },
  timeoutMs: NASA_TIMEOUT_MS,
  cache: {
    search: {
      ttlMs: SEARCH_CACHE_TTL_MS,
      ...getCacheStats(searchCache),
    },
    asset: {
      ttlMs: ASSET_CACHE_TTL_MS,
      ...getCacheStats(assetCache),
    },
  },
});

const readCache = <T>(cache: Map<string, CacheEntry<T>>, key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
};

const writeCache = <T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) => {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
};

export const fetchSearchResults = async (query: string, page = 1): Promise<{ results: NasaItem[]; hasMore: boolean }> => {
  const cacheKey = `${query.trim().toLowerCase()}::${page}`;
  const cached = readCache(searchCache, cacheKey);
  if (cached) {
    return { results: [...cached.results], hasMore: cached.hasMore };
  }

  await delay(150);
  try {
    const response = await axios.get<SearchResponse>(NASA_SEARCH_URL, {
      params: { q: query, media_type: "image", page },
      timeout: NASA_TIMEOUT_MS,
    });

    const results = response.data?.collection?.items ?? [];

    const totalHits = response.data?.collection?.metadata?.total_hits ?? 0;
    const hasMore = page * 100 < totalHits; // NASA returns 100 items max per page

    const payload = { results, hasMore };
    writeCache(searchCache, cacheKey, payload, SEARCH_CACHE_TTL_MS);
    return payload;
  } catch (error) {
    console.error("fetchSearchResults error", error);
    throw error;
  }
};

export const fetchImageData = async (id: string): Promise<ImageData> => {
  const cached = readCache(assetCache, id);
  if (cached) {
    return cached;
  }

  try {
    const response = await axios.get<AssetResponse>(`${NASA_ASSET_URL}/${id}`, {
      timeout: NASA_TIMEOUT_MS,
    });
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

    const payload = {
      id,
      imageUrl: preview,
      fullRes,
      metadata: {
        source: "NASA Image and Video Library",
        nasaId: id,
      },
    };
    writeCache(assetCache, id, payload, ASSET_CACHE_TTL_MS);
    return payload;
  } catch (error) {
    console.error("fetchImageData error", error);
    throw error;
  }
};
