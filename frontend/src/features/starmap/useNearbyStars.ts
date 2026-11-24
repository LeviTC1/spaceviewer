import { useNearbyStarCatalog } from "./nearbyStarCatalogStore";

export const useNearbyStars = () => {
  return useNearbyStarCatalog().stars;
};

export { setNearbyStarCatalogEpoch, useNearbyStarCatalog } from "./nearbyStarCatalogStore";
