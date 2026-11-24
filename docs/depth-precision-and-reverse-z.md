# Depth precision and reverse-Z

## Contract

SpaceViewer's Solar Explorer and SkyMap both request the `reversedDepthBuffer` option supported by the installed Three.js r182 WebGL renderer. Three.js only enables that path when the created WebGL 2 context exposes `EXT_clip_control`. If the extension is absent, the same renderer continues with its standard depth buffer; reverse-Z is an enhancement, not a boot requirement.

The shared policy lives in `frontend/src/domain/astro/rendererBackend.ts`. It keeps three facts separate:

1. reverse-Z is requested by SpaceViewer;
2. `EXT_clip_control` is available to the probed WebGL 2 context;
3. the mounted renderer actually reports `capabilities.reversedDepthBuffer`.

The third value is authoritative for a live canvas. `WebGLCanvasLifecycle` publishes it as either `reverse-z` or `standard` on `data-spaceviewer-depth-strategy` and in the corresponding `window.__SPACEVIEWER_WEBGL__` diagnostic entry.

## Why both floating origin and reverse-Z exist

The techniques solve different precision problems.

- Camera-relative floating-origin projection subtracts the relevant origin in JavaScript before scene values enter Float32 GPU buffers. It protects large-coordinate arithmetic across the typed astronomical frame layer.
- Reverse-Z changes how depth precision is distributed between each camera's near and far plane. It improves occlusion stability across the wide Solar and SkyMap viewing ranges when the browser and GPU expose the required extension.

Neither feature turns compressed educational spacing, logarithmic Local Group distance, the OpenNGC angular shell, or DESI redshift-derived radius into one universal physical ruler. Renderer placement remains downstream of the scientific coordinate and reference-frame contracts.

## Fallback and failure behavior

SpaceViewer deliberately does not enable logarithmic depth as a second fallback. The installed Three.js implementation describes reverse-Z as the faster and more accurate path and guards it through `EXT_clip_control`; using standard depth when unavailable avoids maintaining another shader permutation across custom atmosphere, ring-shadow, eclipse and point-rendering materials.

An unavailable extension therefore produces `standard`, not an error. A missing diagnostic value, an unknown strategy, a canvas/diagnostic mismatch, a context loss or multiple live canvases is a test failure.

## Verification

- `astroEngine.test.ts` covers reverse-Z selection, standard fallback and an impossible extension-without-WebGL case.
- `smoke-check.mjs` validates the live strategy on both surfaces during renderer mount/unmount/remount coverage.
- Browser QA opens True AU Solar Explorer and the DESI cosmological view, confirms one visible canvas, checks the active data attribute, rejects the Vite error overlay and inspects desktop plus 390 x 844 framing.

The current in-app Chromium context activates `reverse-z`. That observation is device-specific and must not be generalized into a universal browser-support claim.
