export type RendererBackendId = "webgl2" | "webgpu" | "unavailable";
export type DepthBufferStrategy = "reverse-z" | "standard";

export const ASTRONOMICAL_WEBGL_OPTIONS = {
  reversedDepthBuffer: true,
} as const;

export interface RendererBackendCapabilities {
  active: RendererBackendId;
  webgpuAvailable: boolean;
  webgl2Available: boolean;
  fallbackAvailable: boolean;
  reversedDepthBufferAvailable: boolean;
  depthBufferStrategy: DepthBufferStrategy;
}

interface RendererCapabilityEvidence {
  webgpuAvailable: boolean;
  webgl2Available: boolean;
  reversedDepthBufferAvailable: boolean;
}

export const resolveDepthBufferStrategy = (reversedDepthBufferActive: boolean): DepthBufferStrategy =>
  reversedDepthBufferActive ? "reverse-z" : "standard";

export const resolveRendererBackendCapabilities = ({
  webgpuAvailable,
  webgl2Available,
  reversedDepthBufferAvailable,
}: RendererCapabilityEvidence): RendererBackendCapabilities => {
  const usableReversedDepthBuffer = webgl2Available && reversedDepthBufferAvailable;
  return {
    active: webgl2Available ? "webgl2" : "unavailable",
    webgpuAvailable,
    webgl2Available,
    fallbackAvailable: webgl2Available,
    reversedDepthBufferAvailable: usableReversedDepthBuffer,
    depthBufferStrategy: resolveDepthBufferStrategy(usableReversedDepthBuffer),
  };
};

export const detectRendererBackendCapabilities = (): RendererBackendCapabilities => {
  if (typeof document === "undefined" || typeof navigator === "undefined") {
    return resolveRendererBackendCapabilities({
      webgpuAvailable: false,
      webgl2Available: false,
      reversedDepthBufferAvailable: false,
    });
  }
  const webgpuAvailable = "gpu" in navigator;
  const canvas = document.createElement("canvas");
  const webgl2Context = canvas.getContext("webgl2");
  return resolveRendererBackendCapabilities({
    webgpuAvailable,
    webgl2Available: Boolean(webgl2Context),
    reversedDepthBufferAvailable: Boolean(webgl2Context?.getExtension("EXT_clip_control")),
  });
};

export interface RendererBackend {
  readonly id: RendererBackendId;
  readonly capabilities: RendererBackendCapabilities;
  readonly label: string;
}

export const createRendererBackend = (): RendererBackend => {
  const capabilities = detectRendererBackendCapabilities();
  return {
    id: capabilities.active,
    capabilities,
    label:
      capabilities.active === "webgl2"
        ? `Three.js WebGL 2 · ${capabilities.depthBufferStrategy === "reverse-z" ? "reverse-Z" : "standard depth"}`
        : "Renderer unavailable",
  };
};
