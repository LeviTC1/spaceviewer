// Saved views: an exact observation (object, moment, playback and camera) kept on this device.

export interface SavedView {
  id: string;
  targetId: string;
  name: string;
  category: string;
  /** Relative URL that reopens the observation exactly. */
  href: string;
  timeMs: number;
  savedAt: number;
  /** Small JPEG data URL captured from the canvas, when available. */
  thumb?: string;
}

const KEY = "spaceviewer.savedViews.v1";
export const SAVED_VIEWS_EVENT = "spaceviewer:saved-views-updated";
const LIMIT = 48;

export const readSavedViews = (): SavedView[] => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedView =>
        Boolean(item) && typeof item.id === "string" && typeof item.href === "string" && typeof item.name === "string",
    );
  } catch {
    return [];
  }
};

const write = (views: SavedView[]) => {
  const attempt = (list: SavedView[]) => window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  try {
    attempt(views);
  } catch {
    // Storage full: drop thumbnails from older views and try again.
    try {
      attempt(views.map((view, index) => (index < 8 ? view : { ...view, thumb: undefined })));
    } catch {
      // Give up quietly; saved views are best-effort.
    }
  }
  window.dispatchEvent(new CustomEvent(SAVED_VIEWS_EVENT));
};

export const saveView = (view: Omit<SavedView, "id" | "savedAt">): SavedView => {
  const entry: SavedView = { ...view, id: `view-${Date.now().toString(36)}`, savedAt: Date.now() };
  write([entry, ...readSavedViews()]);
  return entry;
};

export const removeSavedView = (id: string) => write(readSavedViews().filter((view) => view.id !== id));
