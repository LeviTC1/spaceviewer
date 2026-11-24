// Device-level preferences shared by every surface. Stored keys are the ones SpaceViewer has always
// used, so existing visitors keep their choices.

export const PREFERENCES_EVENT = "spaceviewer:preferences-updated";
const REDUCE_MOTION_KEY = "spaceviewer.reduceMotion";

const systemReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** The in-app toggle wins; when it was never set, follow the operating system. */
export const readReduceMotion = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(REDUCE_MOTION_KEY);
    return stored === null ? systemReducedMotion() : stored === "true";
  } catch {
    return systemReducedMotion();
  }
};

export const applyReduceMotion = (enabled = readReduceMotion()) => {
  if (typeof document !== "undefined") document.body.classList.toggle("reduce-motion", enabled);
};

export const writeReduceMotion = (enabled: boolean) => {
  try {
    window.localStorage.setItem(REDUCE_MOTION_KEY, String(enabled));
  } catch {
    // best effort
  }
  applyReduceMotion(enabled);
  window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT));
};
