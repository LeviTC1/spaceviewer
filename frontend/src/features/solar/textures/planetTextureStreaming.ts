export type PlanetTextureLodLevel = "far" | "mid" | "near";

export interface PlanetTextureStreamingState {
  selected: boolean;
  hovered: boolean;
  lodLevel: PlanetTextureLodLevel;
}

/**
 * Far and mid-distance bodies retain their authored colour hint until the user
 * approaches or interacts with them. This keeps the Solar boot path from
 * requesting every planet surface while preserving an immediate fallback.
 */
export const shouldRequestPlanetSurfaceTexture = ({
  selected,
  hovered,
  lodLevel,
}: PlanetTextureStreamingState) => selected || hovered || lodLevel === "near";
