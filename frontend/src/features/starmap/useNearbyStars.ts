import { useEffect, useState } from "react";
import type { NearbyStar } from "../../data/nearbyStars";

export const useNearbyStars = () => {
  const [stars, setStars] = useState<NearbyStar[]>([]);

  useEffect(() => {
    let active = true;
    import("../../data/nearbyStars")
      .then((mod) => {
        if (active) {
          setStars(mod.NEARBY_STARS);
        }
      })
      .catch(() => {
        if (active) {
          setStars([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return stars;
};
