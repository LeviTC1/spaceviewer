export type SourceHealthState = "loaded" | "partial" | "empty" | "skipped" | "unavailable" | "error";

export interface SourceHealth {
  source: string;
  label: string;
  status: SourceHealthState;
  count: number;
  message?: string;
  hasMore?: boolean;
  checkedAt?: string;
}

export const SOURCE_LABELS: Record<string, string> = {
  nasa: "NASA",
  sdss: "SDSS",
  ps1: "Pan-STARRS",
};

export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? source.toUpperCase();
