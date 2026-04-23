import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

interface RenderActivityOptions {
  label: string;
  active?: boolean;
  reasons?: string[];
  diagnostics?: Record<string, number | string | boolean | null | undefined>;
}

type PerfGlobal = Window & {
  __SPACEVIEWER_PERF__?: Record<
    string,
    {
      mode: "active" | "idle";
      reasons: string[];
      diagnostics: Record<string, number | string | boolean | null | undefined>;
      updatedAt: string;
    }
  >;
};

export const useRenderActivity = ({
  label,
  active = false,
  reasons = [],
  diagnostics = {},
}: RenderActivityOptions) => {
  const { invalidate } = useThree();
  const burstUntilRef = useRef(0);
  const activeRef = useRef(active);
  const reasonsKey = reasons.join("|");
  const stableDiagnostics = useMemo(() => diagnostics, [diagnostics]);

  const updateDiagnostics = useCallback(
    (mode: "active" | "idle", nextReasons: string[]) => {
      if (!import.meta.env.DEV || typeof window === "undefined") return;
      const perfWindow = window as PerfGlobal;
      perfWindow.__SPACEVIEWER_PERF__ ??= {};
      perfWindow.__SPACEVIEWER_PERF__[label] = {
        mode,
        reasons: nextReasons,
        diagnostics: stableDiagnostics,
        updatedAt: new Date().toISOString(),
      };
    },
    [label, stableDiagnostics],
  );

  const requestRender = useCallback(
    (durationMs = 0, reason = "invalidate") => {
      if (durationMs > 0) {
        burstUntilRef.current = Math.max(burstUntilRef.current, performance.now() + durationMs);
      }
      updateDiagnostics(durationMs > 0 ? "active" : activeRef.current ? "active" : "idle", [
        ...(activeRef.current ? reasons : []),
        reason,
      ]);
      invalidate();
    },
    [invalidate, reasons, updateDiagnostics],
  );

  useEffect(() => {
    activeRef.current = active;
    updateDiagnostics(active ? "active" : "idle", active ? reasons : []);
    invalidate();
  }, [active, invalidate, reasonsKey, updateDiagnostics]);

  useFrame(() => {
    const burstActive = performance.now() < burstUntilRef.current;
    if (activeRef.current || burstActive) {
      invalidate();
    }
  });

  return { invalidate, requestRender };
};
