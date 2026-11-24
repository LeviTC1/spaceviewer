import { useCallback, useEffect, useRef, type FC } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  resolveDepthBufferStrategy,
  type DepthBufferStrategy,
} from "../../domain/astro/rendererBackend";

type WebGLDiagnosticEvent = "mounted" | "unmounted" | "contextlost" | "contextrestored" | "sample";

interface WebGLDiagnosticsEntry {
  mounted: boolean;
  mounts: number;
  unmounts: number;
  contextLost: number;
  contextRestored: number;
  canvasCount: number;
  depthBufferStrategy: DepthBufferStrategy;
  lastEvent: WebGLDiagnosticEvent;
  updatedAt: string;
  rendererInfo?: {
    geometries: number;
    textures: number;
    calls: number;
    triangles: number;
    points: number;
    lines: number;
    fps?: number;
    frameMs?: number;
  };
}

type WebGLDiagnosticsWindow = Window & {
  __SPACEVIEWER_WEBGL__?: Record<string, WebGLDiagnosticsEntry>;
};

const getCurrentCanvasCount = (label: string) =>
  typeof document === "undefined" ? 0 : document.querySelectorAll(`[data-spaceviewer-webgl="${label}"]`).length;

const updateWebGLDiagnostics = (
  label: string,
  event: WebGLDiagnosticEvent,
  depthBufferStrategy: DepthBufferStrategy,
  rendererInfo?: WebGLDiagnosticsEntry["rendererInfo"],
) => {
  if (typeof window === "undefined") return;
  const diagnosticsWindow = window as WebGLDiagnosticsWindow;
  diagnosticsWindow.__SPACEVIEWER_WEBGL__ ??= {};
  const previous = diagnosticsWindow.__SPACEVIEWER_WEBGL__[label];
  diagnosticsWindow.__SPACEVIEWER_WEBGL__[label] = {
    mounted:
      event === "sample"
        ? previous?.mounted ?? true
        : event === "mounted" || event === "contextrestored",
    mounts: (previous?.mounts ?? 0) + (event === "mounted" ? 1 : 0),
    unmounts: (previous?.unmounts ?? 0) + (event === "unmounted" ? 1 : 0),
    contextLost: (previous?.contextLost ?? 0) + (event === "contextlost" ? 1 : 0),
    contextRestored: (previous?.contextRestored ?? 0) + (event === "contextrestored" ? 1 : 0),
    canvasCount: getCurrentCanvasCount(label),
    depthBufferStrategy,
    lastEvent: event,
    updatedAt: new Date().toISOString(),
    rendererInfo,
  };
};

interface WebGLCanvasLifecycleProps {
  label: string;
}

const WebGLCanvasLifecycle: FC<WebGLCanvasLifecycleProps> = ({ label }) => {
  const { gl } = useThree();
  const depthBufferStrategy = resolveDepthBufferStrategy(gl.capabilities.reversedDepthBuffer === true);
  const sampleRef = useRef({ startedAt: 0, frames: 0 });
  const getRendererInfo = useCallback(
    (fps?: number, frameMs?: number) => ({
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      points: gl.info.render.points,
      lines: gl.info.render.lines,
      fps,
      frameMs,
    }),
    [gl],
  );

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute("data-spaceviewer-webgl", label);
    canvas.setAttribute("data-spaceviewer-depth-strategy", depthBufferStrategy);

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      updateWebGLDiagnostics(label, "contextlost", depthBufferStrategy, getRendererInfo());
    };

    const handleContextRestored = () => {
      updateWebGLDiagnostics(label, "contextrestored", depthBufferStrategy, getRendererInfo());
      gl.info.reset();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);
    updateWebGLDiagnostics(label, "mounted", depthBufferStrategy, getRendererInfo());

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      gl.renderLists.dispose();
      gl.info.reset();
      canvas.removeAttribute("data-spaceviewer-webgl");
      canvas.removeAttribute("data-spaceviewer-depth-strategy");
      updateWebGLDiagnostics(label, "unmounted", depthBufferStrategy, getRendererInfo());
    };
  }, [depthBufferStrategy, getRendererInfo, gl, label]);

  useFrame(() => {
    const now = performance.now();
    const sample = sampleRef.current;
    if (!sample.startedAt) sample.startedAt = now;
    sample.frames += 1;
    const elapsedMs = now - sample.startedAt;
    if (elapsedMs < 1000) return;
    const fps = (sample.frames * 1000) / elapsedMs;
    updateWebGLDiagnostics(
      label,
      "sample",
      depthBufferStrategy,
      getRendererInfo(fps, 1000 / Math.max(fps, 0.001)),
    );
    sample.startedAt = now;
    sample.frames = 0;
  });

  return null;
};

export default WebGLCanvasLifecycle;
