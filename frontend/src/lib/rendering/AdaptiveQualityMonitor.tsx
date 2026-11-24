import { useEffect, useRef, type FC } from "react";
import { useFrame } from "@react-three/fiber";
import {
  createAdaptiveQualityFrameSample,
  recordAdaptiveQualityFrame,
  type AdaptiveQualityReport,
  type AdaptiveQualitySurface,
} from "./adaptiveQuality";
import type { AstroQualityTier } from "./qualityManager";

interface AdaptiveQualityMonitorProps {
  enabled: boolean;
  surface: AdaptiveQualitySurface;
  tier: AstroQualityTier;
  onDegrade: (report: AdaptiveQualityReport) => void;
}

const AdaptiveQualityMonitor: FC<AdaptiveQualityMonitorProps> = ({ enabled, surface, tier, onDegrade }) => {
  const sampleRef = useRef(createAdaptiveQualityFrameSample(tier));
  const onDegradeRef = useRef(onDegrade);

  useEffect(() => {
    onDegradeRef.current = onDegrade;
  }, [onDegrade]);

  useEffect(() => {
    sampleRef.current = createAdaptiveQualityFrameSample(tier);
  }, [enabled, tier]);

  useFrame((_, deltaSeconds) => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      sampleRef.current = createAdaptiveQualityFrameSample(tier);
      return;
    }
    const result = recordAdaptiveQualityFrame(sampleRef.current, deltaSeconds);
    sampleRef.current = result.sample;
    if (result.decision) {
      onDegradeRef.current({ surface, ...result.decision });
    }
  });

  return null;
};

export default AdaptiveQualityMonitor;
