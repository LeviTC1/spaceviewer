import { LoadingManager, TextureLoader } from "three";

export const solarTextureManager = new LoadingManager();
export const solarTextureLoader = new TextureLoader(solarTextureManager);
solarTextureLoader.setCrossOrigin("anonymous");
