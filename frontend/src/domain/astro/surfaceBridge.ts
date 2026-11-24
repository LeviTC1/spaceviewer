import type { AstroQualityTier } from "../../lib/rendering/qualityManager";

export const ASTRO_SURFACE_BRIDGE_VERSION = "1";

const EARTH_QUALITY_BY_ASTRO_TIER: Record<AstroQualityTier, "auto" | "high" | "lite"> = {
  ultra: "high",
  high: "high",
  balanced: "auto",
  low: "lite",
};

export interface EarthViewerBridgeOptions {
  baseUrl: string;
  returnUrl: string;
  timestamp: Date;
  quality: AstroQualityTier;
  mode?: "earth-orbit" | "moon" | "true-scale";
}

const assertHttpUrl = (value: string, label: string) => {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${label} must use http or https.`);
  }
  return url;
};

export const buildEarthViewerBridgeUrl = ({
  baseUrl,
  returnUrl,
  timestamp,
  quality,
  mode = "earth-orbit",
}: EarthViewerBridgeOptions) => {
  const target = assertHttpUrl(baseUrl, "EarthViewer URL");
  const safeReturnUrl = assertHttpUrl(returnUrl, "Return URL");
  target.searchParams.set("bridge", ASTRO_SURFACE_BRIDGE_VERSION);
  target.searchParams.set("scene", "1");
  target.searchParams.set("space", mode);
  target.searchParams.set("moon", "1");
  target.searchParams.set("scale", mode === "true-scale" ? "true" : "cinematic");
  target.searchParams.set("lat", "18");
  target.searchParams.set("lon", "-25");
  target.searchParams.set("d", "3.15");
  target.searchParams.set("t", timestamp.toISOString());
  target.searchParams.set("rate", "0");
  target.searchParams.set("q", EARTH_QUALITY_BY_ASTRO_TIER[quality]);
  target.searchParams.set("return", safeReturnUrl.toString());
  return target.toString();
};

