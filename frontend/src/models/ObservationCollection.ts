import type { SpaceImage } from "./SpaceImage";

export interface ObservationCollectionItem {
  key: string;
  savedAt: string;
  image: SpaceImage;
}

export interface ObservationCollection {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  items: ObservationCollectionItem[];
}
