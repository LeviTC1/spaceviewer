import type { SkyObjectId } from "./objects";

export const getSkyMapPath = (objectId?: SkyObjectId | null) => {
  const normalized = objectId?.trim();
  return normalized ? `/skymap?${new URLSearchParams({ object: normalized }).toString()}` : "/skymap";
};

export const readSkyMapObjectId = (searchValue: string): SkyObjectId | null => {
  const objectId = new URLSearchParams(searchValue).get("object")?.trim();
  return objectId || null;
};
