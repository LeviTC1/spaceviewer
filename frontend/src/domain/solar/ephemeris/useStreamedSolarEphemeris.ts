import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  SOLAR_DAY_MS,
  SOLAR_DOMAIN_EPOCH_MS,
  resolveSolarDaysSinceEpoch,
} from "../solarEphemeris";
import type { SolarTimeInput } from "../solarTypes";
import {
  getStreamedSolarEphemerisSnapshot,
  requestStreamedVsop87cEphemeris,
  subscribeStreamedSolarEphemeris,
} from "./streamedVsop87c";

interface StreamedSolarEphemerisOptions {
  includeOrbits?: boolean;
}

export const useStreamedSolarEphemeris = (
  time: SolarTimeInput,
  options: StreamedSolarEphemerisOptions = {},
) => {
  const includeOrbits = options.includeOrbits ?? true;
  const daysSinceEpoch = resolveSolarDaysSinceEpoch(time);
  const timeRef = useRef(daysSinceEpoch);
  const requestedYear = new Date(
    SOLAR_DOMAIN_EPOCH_MS + daysSinceEpoch * SOLAR_DAY_MS,
  ).getUTCFullYear();

  useEffect(() => {
    timeRef.current = daysSinceEpoch;
  }, [daysSinceEpoch]);

  useEffect(() => {
    const request = () => {
      void requestStreamedVsop87cEphemeris(timeRef.current, { includeOrbits });
    };

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(request, { timeout: 1_500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(request, 250);
    return () => window.clearTimeout(timeoutId);
  }, [includeOrbits, requestedYear]);

  return useSyncExternalStore(
    subscribeStreamedSolarEphemeris,
    getStreamedSolarEphemerisSnapshot,
    getStreamedSolarEphemerisSnapshot,
  );
};
