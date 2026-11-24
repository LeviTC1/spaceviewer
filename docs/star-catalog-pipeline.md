# Gaia DR3 stellar catalogue pipeline

SpaceViewer now renders a versioned 15,448-source Gaia DR3 visualization subset through independently cacheable binary chunks decoded in a Web Worker. The full point population stays in typed Worker/GPU buffers. React receives 832 bounded Gaia navigation records—the ordinary brightness/spatial sample plus every one of the 497 exact exoplanet-host matches—alongside the existing 55-record common-name seed overlay.

## Authority and selection

- Upstream table: `gaiadr3.gaia_source` from the ESA Gaia Archive TAP service
- Release: Gaia Data Release 3
- Reference epoch: J2016.0, TCB
- Source frame: ICRS astrometry transformed offline into Sun-centred Cartesian light-years
- Catalogue credit: ESA/Gaia/DPAC
- Data status: open and free to use with credit, as recorded by the official Gaia DR3 credit instructions
- Retrieval receipt: `frontend/catalog-source/gaia-dr3-nearby-100pc-g9.receipt.json`
- Reproducible compressed source snapshot: `frontend/catalog-source/gaia-dr3-nearby-100pc-g9.csv.gz`

The development query selects:

- positive parallax of at least 10 mas;
- parallax signal-to-noise of at least 10;
- Gaia G magnitude at most 9;
- five- or six-parameter astrometric solutions (`31` or `95`);
- records not marked `duplicated_source`.

This is a visualization subset, not a statistically complete 100 pc census. Distance is the naïve inverse of positive parallax. SpaceViewer does not currently apply the Gaia parallax zero-point correction or a Bayesian distance prior. The renderer propagates the published proper-motion components and, for 13,492 of 15,448 sources, Gaia DR3 radial velocity from J2016.0 across the bounded 1900–2100 SkyMap interval. The other 1,956 records use a visible zero-radial-velocity fallback. Selected Gaia navigation records now receive a full six-parameter linearized covariance transformation within that uniform-rectilinear model; this does not make the underlying selection or distance inference complete.

Primary references:

- [Gaia DR3 documentation](https://gea.esac.esa.int/archive/documentation/GDR3/)
- [Gaia DR3 `gaia_source` data model and source-ID/HEALPix encoding](https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html)
- [Gaia astrometric transformations and epoch propagation](https://gea.esac.esa.int/archive/documentation/GEDR3/Data_processing/chap_cu3ast/sec_cu3ast_intro/ssec_cu3ast_intro_tansforms.html)
- [Gaia within-source astrometric correlations](https://gea.esac.esa.int/archive/documentation/GDR3/Data_processing/chap_cu3ast/sec_cu3ast_quality/ssec_cu3ast_quality_corr.html)
- [Gaia DR3 credit and citation instructions](https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/)
- [ESA Gaia Archive programmatic-access guidance](https://www.cosmos.esa.int/web/gaia-users/archive/programmatic-access)

## Rebuild commands

From `frontend`:

```bash
npm run catalog:fetch
npm run catalog:build
npm run catalog:check
npm run catalog:measure -- --base-url=http://localhost:5174 --quality=balanced
```

`catalog:fetch` is deliberately explicit and networked. It posts the recorded ADQL query to the ESA TAP endpoint, verifies the returned columns, sorts by the 64-bit Gaia source identifier, and writes a gzip snapshot plus checksum/provenance receipt. Neither the production app nor ordinary builds depend on ESA availability.

`catalog:build` verifies both source checksums and the selection invariants, derives ICRS Cartesian positions, partitions the catalogue, and writes deterministic assets under `frontend/public/catalogs/nearby-stars`. `catalog:check` rebuilds in memory and fails when an expected asset is missing or stale.

## Progressive partition

The loader requests 49 chunks through a live priority queue:

1. `bright-core-g6`: all-sky records with G ≤ 6;
2. `sky-00` through `sky-47`: fainter records in the 48 nested HEALPix level-one cells encoded by Gaia `source_id`.

The official Gaia source-ID encoding is used directly: the level-one HEALPix index is the 64-bit source identifier shifted right by 57 bits. The builder derives a normalized ICRS record centroid and the maximum record separation for every cell, records both values in the manifest, and validates all 48 cells as a gap-free partition. The bright core arrives alone. The remaining cells stream in four-cell batches ranked by descending dot product between their source-record centroid and the live camera-forward direction; a camera turn of at least 1.5 degrees reprioritizes the next pending batch without producing React state on every frame. If no camera direction has arrived, manifest order remains the deterministic fallback.

The ordinary navigation overlay uses the fixed brightness/spatial budget: four records per level-one cell replace sixteen per former level-zero parent. A second deterministic rule retains all 497 exact NASA Exoplanet Archive host matches even when they fall outside that brightness slice, producing 832 unique Gaia navigation records in the current snapshot. Low quality keeps the bright core and distributes its remaining point budget proportionally across all 48 sky cells, avoiding a one-sided sequential truncation.

## Binary format v3

Format ID: `spaceviewer-star-columns-v3`

Each `.svsc` chunk has a 192-byte little-endian header followed by aligned column arrays:

- source identity: `sourceIdHigh`, `sourceIdLow` (`Uint32`, lossless reconstruction of the Gaia 64-bit ID);
- scientific CPU position: `x`, `y`, `z`, `distanceLy` (`Float64`);
- catalogue astrometry: RA/Dec and their errors, parallax and error, proper-motion components and errors (`Float32`);
- line-of-sight motion: Solar-system-barycentric radial velocity and uncertainty in km/s (`Float32`, `NaN` when Gaia publishes no pair);
- all ten published within-source correlations among RA, Dec, parallax, `pmra` and `pmdec` (`Float32`);
- photometry/quality: G magnitude, BP-RP, GSP-Phot temperature where supplied, RUWE (`Float32`);
- `brightnessProxy` (`Float32`), explicitly a non-scientific display transfer while source G remains authoritative.

The Worker derives a separate Float32 position buffer for GPU upload. Missing optional Gaia values remain `NaN` in scientific columns; the renderer substitutes a neutral display colour only in its separate GPU attribute. The manifest also pins the runtime propagation contract, validity window, radial-velocity assumption and uncertainty limitations so these semantics cannot drift silently away from the code.

## Bounded epoch propagation

Gaia defines `pmra` as `mu_alpha* = mu_alpha cos(dec)`, the local tangent-plane component in the direction of increasing right ascension, and `pmdec` as the component in the direction of increasing declination. For target epoch `T`, SpaceViewer computes the uniform rectilinear position

`b(T) = b(J2016.0) + [distance * (p * pmra + q * pmdec) + r * radialVelocity] * (T - 2016.0)`

where `p` and `q` are the ICRS tangent basis vectors, `r` is the line-of-sight unit vector, proper motions are converted from mas/yr to radians/yr, and radial velocity is converted from km/s to light-years per Julian year. Gaia defines the published radial velocity in the Solar-system barycentric frame; the current Sun-centred rendering frame treats it as the line-of-sight velocity without a further frame transformation. When the catalogue value/error pair is unavailable, the runtime applies exactly zero radial velocity and discloses that fallback on the selected object.

The model is intentionally limited to J1900–J2100, matching the SkyMap date control. Worker updates are quantized to one-twelfth of a Julian year: direct date jumps update immediately, while playback avoids rebuilding position buffers for visually insignificant day-scale changes. A request token discards stale results when the user changes time again before an earlier Worker calculation returns.

The navigation subset receives coordinates from the same propagated Float32 buffers as the full point cloud, so selection and fly-to targets do not remain pinned to J2016.0. The GPU geometry keeps one stable position attribute per chunk and updates it in place; epoch changes do not rebuild complete geometries.

## Six-parameter covariance transformation

Selected Gaia navigation records use the parameter vector `(alpha*, delta, parallax, mu_alpha*, mu_delta, mu_r)`. Radial proper motion is derived from the published Solar-system-barycentric radial velocity as `mu_r = radialVelocity * parallax / 4.740470464`, with compatible mas and Julian-year units.

The initial `5 × 5` astrometric covariance uses all ten Gaia within-source correlations. When Gaia publishes a radial-velocity/error pair, the runtime augments it to `6 × 6` using the independent-spectroscopic-velocity terms documented in Gaia equations 4.20–4.21. The complete epoch transform follows the uniform-rectilinear equations 4.7–4.17. Forward automatic differentiation evaluates all 36 terms of its Jacobian, then applies `C(T) = J C(J2016.0) Jᵀ`.

The selected-star dossier projects the propagated angular block into a one-sigma major/minor ellipse with position angle. It also maps the propagated `(alpha*, delta, parallax)` covariance into heliocentric ICRS Cartesian light-years and diagonalises the resulting `3 × 3` matrix to report the three one-sigma covariance-ellipsoid axes. This avoids implying that the axis lengths alone define a 68% three-dimensional confidence volume. The covariance calculation runs only for the bounded navigation records, never per frame or per full-catalogue point.

For the 1,956 sources without a radial-velocity/error pair, the transform keeps the sixth parameter but its initial variance is zero. The result is visibly labelled conditional on the existing 0 km/s fallback. Gaia recommends using a suitable stellar velocity-dispersion prior when radial velocity is unknown; SpaceViewer does not invent one without a controlled source and population model.

The model still omits light-time, non-single-star acceleration solutions, the Gaia parallax zero-point correction, Bayesian distance inference and between-source correlations. Those limitations stay visible in the layer description, time panel and per-object model note.

Per-chunk metadata contains only a bounded navigation subset with a `binaryIndex`. It does not duplicate strings for every source. The root manifest records selection, derivation caveats, byte sizes, Cartesian bounds, spatial scheduling centroids and SHA-256 Subresource-Integrity values for every binary and metadata file.

## Worker-side view LOD

The catalogue Worker retains the current propagated Float32 positions and source Gaia G magnitudes after decode. Solar and SkyMap submit a throttled column-major view-projection matrix, the scene position scale, quality-tier magnitude limit and point budget. The Worker then:

1. rejects records fainter than the quality limit;
2. evaluates the remaining positions against the true clip-space frustum with 1.08 horizontal/vertical padding to avoid edge popping;
3. applies one global bright-first budget across all magnitude-sorted chunks;
4. transfers compact `Uint32Array` record indices back to the renderer.

The GPU keeps full scientific position, colour and display-brightness attributes stable. Only each geometry's index buffer and draw range change as the camera moves, so view changes do not copy or rebuild every point attribute. Camera sampling uses refs and is limited to one request per 180 ms; only completed filter results update React. A magnitude-ordered point-budget plan remains the explicit failure fallback.

Ultra and High admit the source subset's full G ≤ 9 range, Balanced uses G ≤ 8.7, and Low uses G ≤ 8.0. Gaia G is the Earth-observed catalogue magnitude used here as display LOD; it is not recomputed as apparent brightness from the staged camera position. Search, fly-to and selection remain complete because the bounded navigation set is rendered by the separate interactive star overlay even when a full-catalogue point is outside the current view LOD.

Live diagnostics are exposed under `window.__SPACEVIEWER_CATALOG_FILTER__` and in the SkyMap HUD, including total, magnitude-eligible, frustum-visible and rendered counts. The measurement script records the same contract in committed JSON evidence.

## Screen-space navigation labels

The separate bounded navigation overlay remains complete enough for search and selection, but its visible labels are not rendered as an object-per-catalogue-source layer. SkyMap first selects semantically eligible landmarks, then projects their label anchors through the live camera and runs a deterministic screen-space rectangle pass.

Candidates are ranked by interaction state and source label priority. Selected, hovered and focused objects are pinned; lower-priority contextual candidates are rejected when their estimated DOM rectangle intersects an accepted label or falls outside the padded viewport. Ultra, High, Balanced and Low cap the accepted set at 20, 16, 12 and 8 labels respectively.

The layout samples only rendered frames at a 120 ms cadence and compares accepted IDs before changing React state. Camera movement therefore does not rebuild the label tree every frame. HTML labels are centre-anchored, fixed in screen size and pointer-passive.

Pure tests cover ranking, pinned collisions, viewport clipping and quality budgets. Browser smoke reads the final `.skymap-star-label` DOM rectangles in Balanced mode and fails if more than 12 are visible or any two rendered rectangles overlap.

## Browser runtime

`StarCatalogLoader` performs these steps:

1. validate manifest provenance, source/build counts and chunk aggregates;
2. fetch the bright core, then four-cell view-priority batches of binary and bounded metadata sidecars;
3. verify SHA-256 integrity through Web Crypto;
4. transfer the binary buffer to `starCatalog.worker.ts`;
5. validate/decode all typed columns and derive the target-epoch Float32 GPU position buffer off the main thread;
6. retain compact propagation columns inside the Worker after the source binary transfers to the main thread;
7. publish chunks progressively through the singleton catalogue store;
8. recalculate loaded chunks when the quantized SkyMap epoch changes, while new chunks decode directly at the latest requested epoch;
9. retain current propagated positions and G magnitudes in the Worker for view filtering;
10. transfer compact visible-record indices into stable indexed point geometries in Solar and SkyMap;
11. expose only bounded navigation records to search, selection, labels and the details panel.

Chunks larger than 64 KiB require the Worker in production. If the manifest, network, integrity or Worker path fails, the UI reports `fallback` and uses the small named seed rather than silently claiming the Gaia catalogue loaded.

## Current measured evidence

The committed manifest records:

- 15,448 Gaia sources;
- 832 Gaia navigation records: the bounded brightness/spatial selection plus every one of the 497 exact exoplanet-host matches;
- 49 chunks: one all-sky bright core and 48 HEALPix level-one cells;
- 13,492 sources with published radial velocity and uncertainty (87.34%);
- 1,956 sources with the explicit zero-radial-velocity fallback;
- 2,295,712 binary bytes;
- 2,511,168 bytes for the reproducible gzip source snapshot.

Fresh local headless Chromium at 1440×940, Balanced:

- catalogue ready in about 3.10 s on the local development server;
- 99 requests: one manifest, 49 binary chunks and 49 bounded metadata files;
- 2,499,644 transfer bytes;
- 12,784 sources pass G ≤ 8.7, 2,518 are inside the measured padded frustum, and all 2,518 are rendered;
- 3,487 total point primitives including other staged point layers;
- 126 draw calls, 146 geometries, zero console errors and one canvas;
- roughly 14 FPS in the software/headless sample, which is diagnostic only and not a headed hardware-GPU claim.

Low mode admitted 8,060 sources at G ≤ 8.0, found 1,695 inside the measured frustum, produced 2,284 total point primitives, reached catalogue-ready in about 1.95 s and reported roughly 16 FPS in the same software/headless environment. Exact reports are committed under `docs/metrics/`.

The six-parameter continuation's focused coverage independently finite-differences all 36 automatic derivatives, rejects a manifest that weakens the covariance contract, and evaluates every one of the current 832 Gaia navigation records at J2100 to require finite positive ellipsoid axes. The complete desktop/mobile smoke matrix exercises both a published-RVS solution and a conditional zero-radial fallback. Headed 1440×940 and 390×844 checks show one canvas, no horizontal overflow or error overlay. The full point buffers and Worker binary format are unchanged by the exact host cross-match; only bounded navigation metadata grows.

## Remaining work

1. Evaluate light-time and non-single-star acceleration solutions only where they materially affect the bounded 1900–2100 experience.
2. Source a controlled stellar-population velocity-dispersion model before broadening the missing-radial-velocity confidence regions beyond their disclosed conditional fallback.
3. Measure HTTP compression/CDN caching in a production preview; local Vite transfer sizes are not deployment evidence, and the 49-cell layout should be profiled there before another partition-level increase.
4. Evaluate Arrow IPC and WebGPU compute only against a materially larger catalogue and measured bottlenecks.
5. Cross-match a reviewed common-name catalogue so named navigation no longer depends on the separate legacy seed overlay. The separate exact NASA Exoplanet Archive `gaia_dr3_id` host cross-match is complete for the 497 matching sources in this renderer subset.
