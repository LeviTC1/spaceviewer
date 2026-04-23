import { useEffect, useState } from "react";
import {
  persistCameraBookmarks,
  readCameraBookmarks,
  type CameraBookmark,
  type CameraBookmarkContext,
  type CameraVector,
} from "./cameraBookmarks";

export type { CameraBookmark } from "./cameraBookmarks";

export const useCameraBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);

  useEffect(() => {
    setBookmarks(readCameraBookmarks());
  }, []);

  const saveBookmark = (
    name: string,
    position: CameraVector,
    target: CameraVector,
    context: CameraBookmarkContext = {},
  ) => {
    const next: CameraBookmark = {
      id: `bm-${Date.now()}`,
      name,
      position,
      target,
      createdAt: new Date().toISOString(),
      ...context,
    };
    setBookmarks((prev) => {
      const updated = [next, ...prev].slice(0, 12);
      persistCameraBookmarks(updated);
      return updated;
    });
  };

  const removeBookmark = (id: string) => {
    setBookmarks((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      persistCameraBookmarks(updated);
      return updated;
    });
  };

  return { bookmarks, saveBookmark, removeBookmark };
};
