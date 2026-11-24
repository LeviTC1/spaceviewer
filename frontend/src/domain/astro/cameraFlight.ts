export type CameraFlightSurface = "solar" | "skymap";

export interface CameraFlightState {
  surface: CameraFlightSurface;
  label: string;
}

export interface CameraFlightMotionPreference {
  systemReducedMotion: boolean;
  appReducedMotion: boolean;
}

export const shouldReduceCameraFlightMotion = ({
  systemReducedMotion,
  appReducedMotion,
}: CameraFlightMotionPreference) => systemReducedMotion || appReducedMotion;

export const shouldReduceCameraFlightMotionInBrowser = () =>
  typeof window !== "undefined" &&
  shouldReduceCameraFlightMotion({
    systemReducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
    appReducedMotion:
      document.body.classList.contains("reduce-motion") ||
      (() => {
        try {
          return window.localStorage.getItem("spaceviewer.reduceMotion") === "true";
        } catch {
          return false;
        }
      })(),
  });

export const createCameraFlightState = (
  surface: CameraFlightSurface,
  label: string,
): CameraFlightState => ({ surface, label });
