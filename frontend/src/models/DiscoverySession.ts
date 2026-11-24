import type { SourceHealth } from "./SourceStatus";

export type DiscoveryIntensity = "balanced" | "deep" | "extreme";

export interface DiscoverySourceStat {
  source: string;
  label: string;
  count: number;
}

export interface DiscoverySession {
  id: string;
  name: string;
  intensity: DiscoveryIntensity;
  createdAt: string;
  summary: string;
  themes: string[];
  queries: string[];
  resultCount: number;
  batchCount: number;
  sourceMix: DiscoverySourceStat[];
  sourceHealth: SourceHealth[];
  rationaleById: Record<string, string[]>;
}
