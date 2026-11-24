# SkyMap cinematic atlas architecture

## Product rule

The active SkyMap is a cinematic atlas, not a dashboard with a dark canvas behind it. Galaxium informed the interaction and composition targets only: a luminous Milky Way, crisp photometric stars, broad orbit context, restrained labels, and compact floating controls. No Galaxium code or proprietary assets are used.

`frontend/src/features/skymap/GalaxiumSkyMapViewport.tsx` is the active renderer. The previous Rust/WASM renderer and the older React Three Fiber map are retained only as inactive migration history and are not imported by the route.

## Physical inputs and display scale

The renderer consumes the existing canonical SpaceViewer layers and catalogue chunks. The inner Solar System retains linear AU ratios through Jupiter. Beyond Jupiter, body markers use a disclosed navigation compression so the outer planets remain discoverable in the opening frame, while orbit guides use a gentler compression to preserve their much larger visual hierarchy. Stellar records stay in their catalogue coordinate frame and use the existing navigable compression:

```text
inner solar: 4 scene units * distanceAU
outer body: innerScale / (1 + (distanceAU - 5.2) * 0.020)
outer orbit: innerScale / (1 + (distanceAU - 5.2) * 0.018)
stellar:     28 + log2(1 + distanceLy) * 9.5
```

This is explicitly a mixed-domain navigation projection, not a claim that AU and light-year layers share one continuous screen scale.

## Rendering pipeline

The active browser path is Three.js through React Three Fiber with:

- ESA/Gaia/DPAC's licensed Gaia EDR3 all-sky colour map on an observer-centred sphere, with a restrained display-grade shader; the asset is credited in the live viewport and sourced from ESA's equirectangular all-sky release;
- magnitude-sized, temperature-coloured point buffers for the streamed Gaia catalogue;
- separate interactive object markers and solar orbit buffers;
- ACES filmic tone mapping plus bounded bloom;
- a compact stellar core and corona at close focus, instead of inflating stars into planet-like spheres;
- damped orbital navigation and primitive-keyed focus flights that remain stable while catalogue chunks stream.

The untouched launch camera also carries explicitly non-interactive, cross-scale orientation labels for the Solar neighbourhood, Sagittarius A*, Voyager 2, the Magellanic Clouds, and a small set of Galactic-centre and local-stellar landmarks. They are opening-frame composition cues rather than claims that those objects share one physical projection, and they disappear as soon as the visitor takes manual camera control or focuses an object.

React continues to own catalogue streaming, canonical object identity, search, dossier content, URL selection, and accessibility. GPU resources are explicitly disposed when geometries change or the viewport unmounts.

## Legacy WebGPU path

The Rust/wgpu proof remains in `frontend/engine/spaceviewer-wgpu` for reference, but it is not on the live route. It was removed from active use because its compatibility presentation could report a healthy renderer while producing the visually empty map this reconstruction replaces. A future WebGPU migration should reproduce this verified visual baseline before becoming the default.
