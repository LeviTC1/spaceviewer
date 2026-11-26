// A real survey photograph of the selected galaxy, nebula or cluster, hung in 3D exactly where the
// object is and exactly as large as it looks from Earth. From near our line of sight it lines up with
// the sky; as you fly round the object the flat photograph fades and the volumetric model takes over,
// because a photograph only knows what the object looks like from here.

import { useFrame } from "@react-three/fiber";
import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, LinearFilter, LinearMipmapLinearFilter, Matrix4, type Mesh, NoColorSpace, PlaneGeometry, ShaderMaterial, Texture, Vector3 } from "three";
import { placeObjectKm, pixelRadiusOf } from "../engine/engineState";
import { getEntityRenderWorld, SKY_SPHERE_RADIUS_KM, skyBasis, type UniverseEntity } from "../engine/universeModel";
import { hasSkyPhoto, requestSkyPhoto, setSkyPhotoStatus, skyPhotoFovDeg } from "../skyPhoto";
import { useEngine } from "./EngineContext";

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
uniform vec3 uFloor;
varying vec2 vUv;
void main() {
  // ImageBitmap textures are not flipped on upload: row 0 (north) is v = 0.
  vec3 c = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  // Subtract the photographic sky background so only the object's light is added to space.
  c = max(vec3(0.0), c - uFloor) / max(vec3(0.05), vec3(1.0) - uFloor);
  vec2 d = abs(vUv - 0.5) * 2.0;
  // Soft square edge plus a round falloff, so the field's foreground stars never outline a square.
  float edge = (1.0 - smoothstep(0.7, 1.0, d.x)) * (1.0 - smoothstep(0.7, 1.0, d.y)) * (1.0 - smoothstep(0.62, 1.0, length(d)));
  gl_FragColor = vec4(c, uOpacity * edge);
}
`;

const plane = new PlaneGeometry(1, 1);
const DEG = Math.PI / 180;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const SkyPhoto: FC<{ entity: UniverseEntity & { sky: { raDeg: number; decDeg: number } } }> = ({ entity }) => {
  const engine = useEngine();
  const meshRef = useRef<Mesh | null>(null);
  const [photo, setPhoto] = useState<{ texture: Texture; floor: [number, number, number] } | null>(null);
  const fovDeg = skyPhotoFovDeg(entity);
  const size = engine.quality === "low" ? 768 : 1024;
  const shown = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let texture: Texture | null = null;
    setSkyPhotoStatus({ entityId: entity.id, state: "loading", fovDeg });
    void requestSkyPhoto({ raDeg: entity.sky.raDeg, decDeg: entity.sky.decDeg, fovDeg, size }).then((response) => {
      if (cancelled) {
        if (response.ok) response.bitmap.close();
        return;
      }
      if (!response.ok) {
        setSkyPhotoStatus({ entityId: entity.id, state: "error", fovDeg });
        return;
      }
      texture = new Texture(response.bitmap);
      texture.flipY = false;
      texture.colorSpace = NoColorSpace;
      texture.generateMipmaps = true;
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      setPhoto({ texture, floor: response.floor });
      setSkyPhotoStatus({ entityId: entity.id, state: "ready", fovDeg });
    });
    return () => {
      cancelled = true;
      if (texture) {
        (texture.image as ImageBitmap | undefined)?.close?.();
        texture.dispose();
      }
      setPhoto(null);
      shown.current = 0;
      setSkyPhotoStatus({ entityId: null, state: "idle", fovDeg: 0 });
    };
  }, [entity, fovDeg, size]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uMap: { value: null }, uOpacity: { value: 0 }, uFloor: { value: new Vector3() } },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => {
    material.uniforms.uMap.value = photo?.texture ?? null;
    if (photo) material.uniforms.uFloor.value.set(...photo.floor);
  }, [material, photo]);

  // Orientation is fixed in the world: image right = west, up = celestial north, facing back towards us.
  const rotation = useMemo(() => {
    const { L, N, E } = skyBasis(entity.sky.raDeg, entity.sky.decDeg);
    return new Matrix4().makeBasis(new Vector3(-E[0], -E[1], -E[2]), new Vector3(...N), new Vector3(-L[0], -L[1], -L[2]));
  }, [entity]);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (!photo) {
      mesh.visible = false;
      engine.photoId = null;
      engine.photoWeight = 0;
      return;
    }
    const world = getEntityRenderWorld(entity, engine.simTimeMs, engine.cameraWorld);
    const fromCamera = [world[0] - engine.cameraWorld[0], world[1] - engine.cameraWorld[1], world[2] - engine.cameraWorld[2]];
    const cameraDistance = Math.hypot(fromCamera[0], fromCamera[1], fromCamera[2]);
    let sizeKm: number;
    let alignment = 1;
    let proximity = 1;
    if (entity.direction) {
      // Direction-only objects sit on the celestial sphere around the camera: always seen "from here".
      sizeKm = 2 * SKY_SPHERE_RADIUS_KM * Math.tan((fovDeg / 2) * DEG);
    } else {
      const sunDistance = Math.hypot(world[0], world[1], world[2]);
      sizeKm = 2 * sunDistance * Math.tan((fovDeg / 2) * DEG);
      // How far off our (the Sun's) line of sight the camera views the object from.
      const cos = (fromCamera[0] * world[0] + fromCamera[1] * world[1] + fromCamera[2] * world[2]) / Math.max(1e-30, cameraDistance * sunDistance);
      const offAxisDeg = Math.acos(Math.min(1, Math.max(-1, cos))) / DEG;
      alignment = 1 - smooth(5, 25, offAxisDeg);
      // Up close the flat print would hang in front of the volume like a poster: hand over to the model.
      proximity = smooth(1.1, 2.2, cameraDistance / Math.max(1, entity.extentKm));
    }
    // Too small on screen to add anything over the marker.
    const halfPx = pixelRadiusOf(engine, sizeKm / 2, cameraDistance);
    const legible = smooth(10, 36, halfPx);
    const target = alignment * proximity * legible * Math.pow(10, 0.4 * Math.min(0, engine.exposure));
    // Ease in once loaded so it develops rather than pops.
    shown.current += (target - shown.current) * Math.min(1, delta * 2.5);
    material.uniforms.uOpacity.value = shown.current;
    placeObjectKm(engine, mesh, world, sizeKm);
    mesh.quaternion.setFromRotationMatrix(rotation);
    mesh.visible = shown.current > 0.004;
    engine.photoId = entity.id;
    engine.photoWeight = shown.current;
  });

  useEffect(
    () => () => {
      if (engine.photoId === entity.id) {
        engine.photoId = null;
        engine.photoWeight = 0;
      }
    },
    [engine, entity],
  );

  return <mesh ref={meshRef} geometry={plane} material={material} renderOrder={-6} frustumCulled={false} visible={false} />;
};

/** Mounts a survey photograph for the selected deep-sky object. */
export const SkyPhotoLayer: FC<{ selectedId: string | null }> = ({ selectedId }) => {
  const engine = useEngine();
  const entity = selectedId ? engine.index.byId.get(selectedId) : undefined;
  if (!hasSkyPhoto(entity)) return null;
  return <SkyPhoto key={entity.id} entity={entity} />;
};
