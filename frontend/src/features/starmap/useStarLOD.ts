import { useMemo } from "react";
import type { NearbyStar } from "../../data/nearbyStars";
import { getStarBrightness } from "./starRenderer";

export const useStarLOD = (stars: NearbyStar[], cameraDistance: number) => {
  return useMemo(() => {
    if (!stars.length) return stars;
    let minBrightness = 0;
    if (cameraDistance > 220) {
      minBrightness = 0.8;
    } else if (cameraDistance > 150) {
      minBrightness = 0.6;
    } else if (cameraDistance > 90) {
      minBrightness = 0.4;
    } else if (cameraDistance > 60) {
      minBrightness = 0.25;
    }

    const filtered = stars.filter((star) => getStarBrightness(star) >= minBrightness);
    if (filtered.length) {
      return filtered;
    }
    return stars.slice(0, Math.max(1, Math.round(stars.length * 0.2)));
  }, [stars, cameraDistance]);
};
