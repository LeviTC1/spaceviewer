import { useEffect, useState } from "react";

export interface CameraBookmark {
  id: string;
  name: string;
  position: [number, number, number];
  target: [number, number, number];
}

const STORAGE_KEY = "spaceviewer.solar.bookmarks";

const loadBookmarks = (): CameraBookmark[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CameraBookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to load bookmarks", error);
    return [];
  }
};

const persist = (bookmarks: CameraBookmark[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (error) {
    console.warn("Unable to save bookmarks", error);
  }
};

export const useCameraBookmarks = () => {
  const [bookmarks, setBookmarks] = useState<CameraBookmark[]>([]);

  useEffect(() => {
    setBookmarks(loadBookmarks());
  }, []);

  const saveBookmark = (name: string, position: [number, number, number], target: [number, number, number]) => {
    const next: CameraBookmark = {
      id: `bm-${Date.now()}`,
      name,
      position,
      target,
    };
    setBookmarks((prev) => {
      const updated = [next, ...prev].slice(0, 12);
      persist(updated);
      return updated;
    });
  };

  const removeBookmark = (id: string) => {
    setBookmarks((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      persist(updated);
      return updated;
    });
  };

  return { bookmarks, saveBookmark, removeBookmark };
};
