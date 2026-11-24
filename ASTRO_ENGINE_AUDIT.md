# SpaceViewer astronomical engine audit

Date: 2026-09-02  
Scope: `/Users/levicurrington/Documents/spaceviewer-main` plus the adjacent Earth surface application at `/Users/levicurrington/Documents/EarthViewer`

## Executive finding

SpaceViewer is already the correct integration shell for solar, stellar, deep-space and archive-imagery exploration. EarthViewer is a separate, substantially newer Earth renderer and should remain a separate deployable surface until the two applications share compatible React, React Three Fiber and Three.js versions. The immediate integration architecture is therefore:

1. a typed astronomical domain layer inside SpaceViewer;
2. a stable URL hand-off contract between SpaceViewer and EarthViewer;
3. a consistent scale-domain/quality/navigation language across both apps;
4. renderer packages kept separate behind a `RendererBackend` contract until a measured migration is justified.

This avoids placing two incompatible renderer runtimes in one browser bundle while still making Earth-to-Solar-to-stellar travel one navigable product journey.

## Repository reconnaissance

### SpaceViewer

- Location: `/Users/levicurrington/Documents/spaceviewer-main`
- Git state at audit: new repository with no commits; every existing file is untracked and therefore treated as user-owned baseline work.
- Frontend: React 18.3, Vite 5.4, TypeScript 5.4, Three.js 0.182, React Three Fiber 8.15.
- Backend: Express 4 + TypeScript proxy for NASA Image Library, MAST name resolution, SDSS and Pan-STARRS.
- Rendering: WebGL through React Three Fiber `Canvas`; `frameloop="demand"` on Solar Explorer and SkyMap.
- Current routes: custom History API router for `/`, `/solar`, `/skymap` and `/viewer/:id`.
- Current render surfaces:
  - Solar Explorer: integrity-checked, yearly streamed VSOP87C heliocentric positions for eight planets; immediate Keplerian boot and Pluto fallback; controlled analytical states for Earth's Moon and the four Galilean moons with disclosed seed fallback elsewhere; four additional recognized dwarf planets and five comets propagated from receipted JPL SBDB osculating elements; instanced asteroid belt; planet texture LOD; demand rendering; camera bookmarks; time playback.
  - SkyMap: reducer-driven layer registry, canonical `SkyObject` records, a progressively streamed 15,448-source Gaia DR3 stellar subset, a bounded searchable navigation index, an optional 88-region IAU J2000 boundary overlay, solar bridge objects, a 3,004-record OpenNGC deep-sky selection on a disclosed angular shell and staged camera navigation.
  - Gallery/Viewer: real remote archive imagery kept separate from the 3D renderer, which is the correct product boundary.
- Coordinates already present:
  - heliocentric ecliptic positions in AU;
  - local interstellar cartesian positions in light-years;
  - ICRS and galactic frame identifiers;
  - explicit renderer-only scene units.
- Current scale handling:
  - solar distances use logarithmic or square-root educational compression;
  - SkyMap projects distinct unit types into one staged scene;
  - a typed floating-origin foundation and frame-aware cross-renderer transition coordinator now cover the implemented domains;
  - there is still no single physical coordinate scale or shared-canvas transition across every representation.
- Current performance controls:
  - demand rendering;
  - asteroid LOD and instancing;
  - two texture tiers;
  - essential-only Solar texture bootstrap plus interaction/proximity-driven body requests;
  - solar performance mode;
  - WebGL context lifecycle diagnostics;
  - route-level lazy loading and vendor chunking.
- Current production build output at baseline:
  - app shell about 191 kB minified;
  - Three vendor chunk about 1.02 MB minified;
  - VSOP87 chunk about 2.39 MB minified;
  - build warning for chunks above 500 kB.
- Current production build after streamed-ephemeris work:
  - no VSOP87 runtime JavaScript chunk;
  - Solar route chunk 135.26 kB minified / 39.95 kB gzip;
  - only the manifest, current roughly 70 kB yearly block and roughly 37 kB representative orbit guide are requested for a normal Solar session.
- Baseline verification:
  - frontend lint: zero errors, 52 pre-existing warnings;
  - frontend tests: 36/36 passed;
  - frontend production build: passed;
  - backend TypeScript build: passed;
  - browser: Home, Solar intro and interactive Solar canvas rendered without console errors or an error overlay.

### EarthViewer

- Location: `/Users/levicurrington/Documents/EarthViewer`
- Git state: not a Git repository.
- Frontend: React 19.2, Vite 8.1, TypeScript 6, Three.js 0.185, React Three Fiber 9.6.
- Renderer capabilities:
  - NASA global Earth imagery fallbacks;
  - view-dependent imagery tiles;
  - terrain displacement and camera collision;
  - optional 3D Tiles/photogrammetry;
  - propagated spacecraft in a Web Worker;
  - Earth/Moon astronomy through Astronomy Engine;
  - shared simulation clock;
  - URL-serialised scene state;
  - high/balanced/lite quality profiles and runtime health telemetry.
- Baseline verification:
  - production typecheck/build: passed;
  - browser: Earth intro and WebGL canvas rendered;
  - one warning from Three.js about deprecated `THREE.Clock`; no error overlay.

### Deployment copy

- `/Users/levicurrington/Documents/spaceviewer-deploy-20260211` is an older tracked deployment branch, not a third product surface.
- The current `spaceviewer-main` tree contains substantial later Solar, SkyMap, insight, verification and UI work and is the authoritative implementation target.

## Data and scientific-integrity findings

### Verified or structurally credible

- Major-planet positions use deterministic Float64 blocks generated offline from the pinned MIT-licensed `vsop87` 1.0.5 package and VSOP87C rectangular heliocentric ecliptic coordinates.
- Pluto is explicitly identified as a lower-precision Keplerian fallback.
- Earth's Moon and Jupiter's four Galilean moons use receipted analytical position/velocity states; other moon positions are explicitly identified as approximate parent-relative circular seed orbits.
- Ceres, Haumea, Eris, Makemake and five representative comets use exact, per-object JPL SBDB osculating-element epochs in the shared AU/ecliptic provider. Their two-body propagation is explicitly distinguished from a Horizons n-body trajectory, and canonical upstream JSON receipts are live-verifiable.
- NASA/SDSS/Pan-STARRS media search remains behind source-aware backend adapters with failure status.
- Local Group galaxies use physical heliocentric supergalactic directions and distances from LVDB `v1.1.1` behind a visibly disclosed logarithmic radial projection. The broader deep-sky layer uses measured OpenNGC J2000 directions on a fixed angular shell and explicitly leaves radial distance unknown.

### Catalogue authority and remaining review boundaries

- The primary stellar field is now a scripted, versioned Gaia DR3 visualization subset with source identifiers, epoch, astrometric uncertainties, proper motion, selection criteria, receipt, checksums and ESA/Gaia/DPAC credit. It is not a statistically complete 100 pc census: current distances use naïve inversion of positive parallax without the Gaia zero-point correction or a Bayesian prior.
- The separate 55-record common-name overlay remains a navigation seed pending a reviewed name cross-match; it is also the explicit small fallback if the streamed Gaia assets cannot load.
- The 117-object Local Group subset has one pinned CC0 LVDB source/version, checksums, uncertainty fields and references. The distinct 3,004-object broader deep-sky selection is a deterministic adaptation of OpenNGC `v20260501`, pins its release commit and source artefacts by byte length and SHA-256, and preserves catalogue fields and CC BY-SA 4.0 attribution without inventing distance.
- The optional constellation overlay is compiled from the IAU's published J2000 boundary text files, with per-file and snapshot checksums. It renders official sky regions, not non-standard stick figures, and does not redistribute the separate IAU/Sky & Telescope chart artwork.
- Planetary texture files now have a deterministic dimension/byte/SHA-256 integrity manifest, but their original source, transformation history and usage terms remain unresolved and visibly marked for review.
- The common-name overlay and unresolved texture sources must remain labelled `seed`, `curated` or `source review required`; the Gaia, LVDB and OpenNGC selections must not be advertised as complete catalogues, and no layer is a SPICE catalogue. OpenNGC positions are measured catalogue directions, while the 108-scene-unit shell is only a renderer placement and must never be interpreted as physical distance.

## Architecture decision

The new foundation uses the following responsibilities while preserving stable existing systems:

- `RendererBackend`: capability description for the active WebGL/WebGPU backend; WebGPU remains an enhancement, never a hard requirement.
- `ReferenceFrameManager`: hierarchical frame metadata and breadcrumb/path resolution.
- `ScaleDomainManager`: explicit surface, planetary, solar, stellar, galactic, Local Group/deep-space and observable-universe domains.
- `ScaleTransitionPlan`: maps domains to Earth, Solar or SkyMap renderer surfaces, derives inward/outward direction and carries the target reference-frame hierarchy through a timed representation handoff.
- `FloatingOriginSystem`: camera-relative subtraction in double-precision JavaScript before float GPU upload.
- `TimeController`: existing Solar/SkyMap clocks remain authoritative for their surfaces; the bridge transmits an ISO timestamp.
- `EphemerisProvider`: streamed VSOP87C planet blocks, the pinned local analytical satellite evaluator and the source-receipted JPL SBDB small-body adapter publish one shared AU/ecliptic state contract; visible Keplerian, osculating-two-body and circular-seed paths retain their own model IDs.

## JPL SBDB small-body continuation implemented

- Added Ceres, Haumea, Eris and Makemake without widening `PlanetId` or pretending that VSOP87, texture, atmosphere and controlled-attitude contracts exist for them.
- Added 1P/Halley, 2P/Encke, 67P/Churyumov–Gerasimenko, 109P/Swift–Tuttle and C/1995 O1 (Hale–Bopp) through the same canonical small-body adapter.
- Every object retains its JPL designation, SPK ID, orbit class, solution ID, observation arc, exact element epoch, direct API query and canonical JSON SHA-256 receipt.
- Mean anomaly advances from each record's actual epoch and the common Kepler solver now converges high-eccentricity comet states with a 32-iteration, `1e-12` tolerance ceiling.
- Solar search, selection, focus flights, date playback, deep links and browser-history restoration treat the new bodies as first-class targets.
- Dwarf-planet orbit guides remain visible by default; comet paths appear when selected. Body styling cannot feed back into scientific state.
- The comet tail is an explicitly identified anti-solar, distance-based presentation heuristic—not observed activity, dust/plasma dynamics or a forecast.
- Unit coverage pins source-epoch states, apsides, finite coordinates, tail bounds and route round-trips; `npm run ephemeris:small-bodies:check` verifies all nine live upstream records.

See `docs/small-body-ephemeris.md` for the source, time, coordinate, numerical and rendering boundaries.
- `SpatialObjectRegistry`: existing SkyMap registry remains the runtime object index; new canonical object contracts adapt existing planet/moon/star/deep records instead of replacing them.
- `QualityManager`: Ultra, High, Balanced and Low profiles with device recommendation, versioned auto/manual persistence, visible explicit override and shared sustained-frame degradation across Solar Explorer and SkyMap.
- `AttributionRegistry`: distinguishes verified source records from review-required seed assets.
- `SurfaceBridge`: serialised EarthViewer scene links with a validated return URL.

## Scale and coordinate policy

- Scientific coordinates remain in authoritative CPU units and frames.
- Scene units are never accepted as scientific measurements.
- Unit conversion is explicit and typed for kilometres, AU, light-years and parsecs.
- Renderer upload positions are camera-relative and expressed as `Float32Array` only after origin subtraction.
- Each scale domain declares its canonical frame, renderer strategy, transition overlap and scientific interpretation.
- Transitions may crossfade two representations, but labels must state when the representation is symbolic or scale-compressed.
- The current Solar and SkyMap scenes remain separate renderer domains behind one navigation journey; a future shared canvas is optional, not assumed.
- Renderer-crossing jumps use an application-level departing/arriving crossfade, while changes inside Solar Explorer or SkyMap keep the renderer's native spatial camera flight. The crossfade communicates a representation boundary; it does not claim a physically continuous scene-space ruler.

## Renderer backend decision

SpaceViewer remains on the proven React Three Fiber WebGL renderer for this slice. Three.js `WebGPURenderer` is not adopted blindly because:

- the current R3F version is built around the WebGL renderer path;
- the existing material, HTML overlay, controls and diagnostics stack is stable;
- no profiling evidence shows the renderer backend is the immediate bottleneck;
- the remaining largest route cost is the shared Three.js renderer and the catalogue/scene workload, not a demonstrated renderer-backend bottleneck; the former 2.39 MB VSOP87 theory transfer has been removed from the browser runtime.

The backend abstraction records WebGPU availability and leaves a clean migration point. A future WebGPU experiment should be isolated to the catalogue point renderer first.

## Strongest coherent implementation slice

This working slice targets:

1. typed units and hierarchical frames;
2. explicit multi-scale domains and breadcrumbs;
3. floating-origin projection utilities;
4. four real quality tiers used by both SpaceViewer 3D surfaces;
5. attribution/source-review state;
6. a visible cosmic journey rail from Earth surface through Solar and SkyMap targets;
7. a two-way SpaceViewer/EarthViewer URL bridge carrying time, quality and return context;
8. automated unit coverage plus full build/browser/smoke verification.

## Implemented and verified on 2026-09-01

- SpaceViewer shareable routes restore exact Solar and SkyMap targets, including `/solar?object=planet%3Aearth&mode=planetary&date=2026-09-01` and `/skymap?object=deep%3Agalaxy%3Aandromeda-galaxy`.
- The Earth bridge was exercised in both directions. It preserved the simulation timestamp, quality, Earth-orbit scene state and a validated return URL.
- The quality selector changes the active Canvas settings and persisted Low mode across a live browser reload.
- Adaptive quality now has one shared contract on both 3D surfaces: a 1.5-second warm-up, minimum three-second sustained-frame window, tier-specific frame budgets, one-tier-at-a-time reduction, hidden/suspended-tab rejection and a Low floor. Sampling stays in refs rather than causing per-frame React updates.
- New browsers begin in Auto, existing v1 tier choices migrate as manual overrides, and the desktop/mobile journey rail exposes monitoring, measured reduction or manual status. A manual High selection persists through reload and selecting Auto resumes monitoring.
- The Galactic and Cosmological rail destinations now open explicit scientific visualizations. Both retain visible schematic-status disclosures and do not claim generated particles are observed catalogue positions.
- Frontend lint completed with zero errors and 51 existing warnings (one fewer than the 52-warning baseline).
- SpaceViewer TypeScript checking passed; 59/59 unit tests passed; production build passed.
- The Express backend TypeScript build and `/api/health` check passed.
- EarthViewer 164/164 tests and its TypeScript/Vite production build passed.
- The full Playwright smoke suite passed Home, Gallery, Viewer, Solar, SkyMap, WebGL lifecycle, object commands, desktop and phone-width layouts, repeated Solar cold loads and texture-timeout recovery.
- Visible browser verification confirmed direct Milky Way and observable-Universe routes, one live WebGL canvas, explicit schematic disclosures, implemented outer-domain rail states, and no Vite error overlay or fresh console error.
- Final HTTP checks returned `200` for SpaceViewer, the Earth-target Solar route, the Andromeda SkyMap route, EarthViewer and backend health while all three listeners remained active.

The pre-change Home, Solar and Earth surfaces were inspected live before editing. This repository had no commits and every baseline file was untracked, so there was no immutable source state from which to create an honest reproducible before/after screenshot pair. The verification record therefore reports the live baseline observations and automated after-state evidence rather than presenting an older deployment as if it were the exact before state.

## Gaia DR3 catalogue continuation implemented

The primary stellar field now exercises an authoritative, scalable asset path instead of presenting the 55-record navigation seed as its scientific population:

- `npm run catalog:fetch` records the exact ESA TAP query, validates returned columns and writes a reproducible gzip snapshot plus checksum/provenance receipt;
- the current selection contains 15,448 Gaia DR3 sources with parallax at least 10 mas, parallax signal-to-noise at least 10, G magnitude at most 9, valid five- or six-parameter astrometry and no duplicated-source flag;
- a deterministic build validates the selection and partitions it into a bright all-sky core plus 48 Gaia source-ID-derived HEALPix level-one chunks;
- binary format v3 keeps lossless 64-bit source identity, Float64 scientific positions/distances, catalogue epoch astrometry, uncertainties, proper motion, Solar-system-barycentric radial velocity, ten within-source astrometric correlations, G/BP-RP photometry, optional temperature, RUWE and a separately labelled display brightness proxy;
- all 49 binaries and bounded metadata sidecars have SHA-256 integrity in the root manifest;
- `StarCatalogLoader` verifies integrity and transfers decoding/GPU-buffer preparation to a dedicated Vite Worker; production-sized chunks cannot silently parse on the main thread;
- the full 15,448-source population remains in typed Worker/GPU buffers while React receives 832 bounded Gaia navigation records: the ordinary brightness/spatial sample plus every exact-match exoplanet host, alongside the lazily loaded 55-record common-name seed overlay;
- every spatial manifest entry carries a normalized source-record ICRS centroid and maximum record separation; after the bright core, four-cell batches are ranked against the live camera-forward vector and the next batch is reprioritized after camera movement, with manifest order as the deterministic fallback;
- Gaia `pmra`, `pmdec` and published radial velocity now propagate both the full point cloud and bounded navigation records from J2016.0 to the quantized SkyMap epoch inside the Worker, using an explicit 1900–2100 validity interval; 13,492 sources use Gaia radial velocity and 1,956 use a disclosed zero fallback;
- stale epoch requests are discarded, new chunks decode at the latest epoch, and stable GPU attributes update in place rather than rebuilding complete geometries;
- Solar and SkyMap now submit throttled view-projection matrices to the catalogue Worker; it applies quality-tier Gaia G limits, padded clip-frustum filtering and one global bright-first budget, then transfers compact record-index buffers into stable GPU geometries;
- the catalogue LOD contract is visible in the SkyMap HUD and exposed as structured runtime diagnostics, while the separate interactive navigation overlay preserves search, selection and fly-to completeness;
- selected Gaia dossiers report the rendered epoch, measured-or-fallback radial-motion state, a six-parameter Jacobian-projected angular ellipse and one-sigma 3D ICRS position covariance axes derived from Gaia's within-source astrometric covariance;
- SkyMap exposes live catalogue progress, search and scientific dossiers; Solar and SkyMap render quality-tier magnitude/frustum/budget LOD without per-point React objects;
- build drift, corrupt headers, lossless source IDs, Float64/Float32 decoding, all 48 HEALPix cells, source-derived scheduling metadata, live pending-queue reprioritization, bounded navigation metadata, clip-frustum math, global bright-first budgets and no-refetch fallback filtering have automated coverage.

The pipeline explicitly records J2016.0/ICRS provenance, the inverse-parallax limitation, measured radial-velocity coverage and the zero fallback. See `docs/star-catalog-pipeline.md` for the source receipt, binary format, propagation/covariance model, measured evidence and continuation.

## Gaia six-parameter covariance continuation implemented

- Selected Gaia navigation stars now use the complete uniform-rectilinear parameter vector `(alpha*, delta, parallax, mu_alpha*, mu_delta, mu_r)` rather than a detached five-parameter tangent-plane approximation.
- The initial covariance includes all ten published Gaia within-source correlations. For 13,492 stars with a radial-velocity/error pair, it is augmented with the independent spectroscopic uncertainty using the Gaia-documented product terms; the other 1,956 remain explicitly conditional on the existing 0 km/s fallback without an invented velocity prior.
- Forward automatic differentiation evaluates all 36 terms of the epoch-transform Jacobian. The runtime applies `C = J C0 J^T`, projects the angular block into a one-sigma ellipse, maps the position block into ICRS Cartesian light-years and diagonalises it into three one-sigma covariance-ellipsoid axes without claiming those axes alone describe a 68% 3D confidence volume.
- The calculation is bounded to the 832 React-visible navigation records and runs only when a chunk arrives or its quantized epoch changes. The full 15,448-point render path remains Worker/GPU typed-buffer work.
- The generated manifest now pins the covariance model, radial-velocity treatment and official Gaia transform reference, so build drift fails the existing catalogue check.
- Pure coverage checks the J2016 identity Jacobian, matrix symmetry, axis ordering, radial-velocity perspective coupling, the missing-RV conditional path and Cartesian parity with the renderer's propagated position. Browser smoke requires both published-RVS and conditional-fallback dossier states.
- The independent central-difference fixture checks all 36 automatic derivatives, and the catalogue-wide test now proves finite positive covariance axes for every one of the 832 Gaia navigation records. Headed 1440×940 and 390×844 inspection confirms the RVS-backed and conditional-fallback readouts, one canvas, no horizontal overflow and no error overlay.

## Streamed VSOP87C ephemeris continuation implemented

- The pinned `vsop87` 1.0.5 implementation is now an offline development dependency rather than a browser runtime dependency.
- A deterministic builder compiles its VSOP87C output into 26 overlapping yearly Float64 position blocks for 2025-2050 plus one representative orbit-guide asset.
- The manifest records the theory and implementation URLs, exact version, implementation/licence hashes, validity, frame, units, interpolation, planet order, layout and explicit scientific limitations.
- Every binary has SHA-256 integrity, a versioned 64-byte header and strict length/layout validation. Build drift fails `npm run ephemeris:check`.
- Solar Explorer renders immediately with its disclosed Keplerian boot model. After first paint, idle loading requests only the manifest, active year and representative orbit guide; orbit loading cannot gate accurate positions.
- SkyMap uses the same singleton provider and current-year position block but does not request orbit guides.
- The provider retains at most three yearly blocks and leaves the fallback active on range, fetch, integrity or decode failure. Status and structured diagnostics expose the active model, year, resident years, transfer bytes and orbit state.
- Direct tests compare Earth and Jupiter against the pinned solver's former one-day Cartesian interpolation contract. Browser smoke delays the yearly response, proves that the canvas and controls remain interactive on the fallback, then observes the live switch to VSOP87C.
- The former 2,390.96 kB minified / 825.32 kB gzip VSOP87 JavaScript chunk is absent from production output. The current Solar route chunk is 135.26 kB minified / 39.95 kB gzip.
- Current verification passes all 158 frontend tests, zero-error lint, TypeScript, the production build and the complete desktop/mobile browser smoke matrix. The matrix includes three desktop and two 390×844 Solar cold loads plus a delayed yearly-block case that proves the Keplerian boot remains interactive before the live VSOP87C switch. Headed 1440×940 verification measures a 12 px gap and zero overlap between the right dossier and panel dock, zero horizontal overflow and no warning/error console entries.

See `docs/streamed-vsop87c-ephemeris.md` for the source receipt, binary format, runtime state machine, evidence and claim boundary.

## Planetary material and asset-integrity continuation implemented

- All 34 local Solar texture files are inventoried deterministically with dimensions, byte sizes, MIME types and SHA-256 hashes.
- The v2 manifest now carries a verified per-file source, licence, attribution, upstream hash and transformation receipt. Fifteen high-tier assets were proven byte-identical against their pinned Solar System Scope or three.js downloads; the generated audit command repeats that proof without relying on filenames.
- Solar System Scope's official texture page records CC BY 4.0 commercial reuse, the pinned three.js revisions carry the MIT notice, and the public attribution notice preserves both sets of obligations.
- Pluto's fictional pre-New Horizons map was replaced with NASA's 2017 New Horizons global colour mosaic, with NASA/JHUAPL/SwRI credit, the agency media-usage conditions, the exact source hash and the ImageMagick transformation recorded.
- The former anonymous noise image was replaced by a deterministic xorshift32 RGB data texture. Every performance asset is now a controlled resize or byte copy rather than an undocumented derivative.
- Duplicate high/performance files and the two runtime-unreferenced Earth atmosphere copies are still reported rather than silently ignored.
- Sun, planet and textured-moon details expose active input roles, the visual-approximation boundary and a direct manifest link.
- Planet material presets no longer give Mercury or Pluto a substantial generic atmosphere shell or imply gas giants are metallic/self-emissive.
- A sun-aware analytic limb shader replaces the uniform atmosphere bubble. It is explicitly not advertised as a scattering LUT.
- Saturn's strip texture is sampled radially and its rings receive an analytic planet-cast shadow, replacing the painted dark ring band.
- Solar Explorer now offers Cinematic logarithmic spacing, Educational square-root spacing and a True AU linear heliocentric ruler at 30 scene units per AU. The UI explicitly states that body radii and close moon spacing remain exaggerated.
- Scale-aware camera/fog/light envelopes make the outer system navigable, outer-planet focus now uses visible body radius rather than orbit radius, and bookmarks/direct URLs preserve `scale=realistic`.
- Headed desktop verification restored the direct True AU overview, showed the 30.0/300.0 scene-unit ruler, switched live to Cinematic and back while keeping the URL in sync, and focused Neptune at 29.879 AU without the former orbit-radius camera offset.
- True AU's non-decaying presentation light is tuned separately from the compressed modes so close planet views retain their authored surface colour instead of clipping toward white. This remains a legibility light, not a measured irradiance model.
- Close-focus planet and moon flights use a stable oblique view direction when the previous camera was nearly polar, while HTML orbit/planet/moon labels use screen-stable sizing instead of growing across the viewport at short range.
- The default desktop Mission, Scale and Timeline composition was measured and corrected so the panels do not overlap. The same assertion now runs in smoke coverage, while the 390×844 route restores the True AU control and disclosure inside Mission Control without horizontal overflow.

See `docs/planetary-rendering-and-textures.md` for asset policy and the production continuation.

## Galactic and cosmological continuation implemented

- A searchable Milky Way structure layer now bridges the Gaia DR3 local stellar subset to deep-space landmarks. Its normal renderer uses the measured Reid et al. VLBI maser catalogue and published seven-arm fit intervals described below; the older four-arm procedural volume remains only as an explicitly reported loading/error fallback.
- The Solar origin is calibrated at 8.178 kpc from the model centre. Quality tiers change fitted-density presentation budgets without changing the 199 measured tracer records or their coordinates.
- The separate observable-Universe object now renders the measured DESI DR1 redshift light cone described below. The former normalized procedural node/filament network and its nearest-neighbour links have been removed from the normal renderer.
- Both domains participate in search, filters, details, provenance, route trails, guided tour steps, LOD gating, and the global scale journey. HUD and dossier language distinguish measured points, fitted cues, survey selection, cosmology-derived radius and fallback state.
- Fresh desktop and 390×844 routes for both domains render one WebGL canvas without a Vite overlay or warning/error console entries.

See `docs/galactic-and-cosmological-visualizations.md` for source papers and claim boundaries.

## Local Group catalogue continuation implemented

- A pinned Local Volume Database `v1.1.1` combined-catalogue snapshot is receipted with source/release/licence URLs, DOI references, row counts and SHA-256 checksums.
- A deterministic build selects 117 confirmed Local Group galaxies: 54 Milky Way satellites, 42 M31 satellites, 19 field galaxies, M31 and M33.
- Every selected record validates its supergalactic-vector magnitude against the source heliocentric distance and retains available asymmetric distance errors, method/reference, host, magnitude, mass, velocity and proper-motion fields.
- Stable Andromeda, Triangulum and Magellanic route IDs are preserved while their former hand-staged duplicates are removed.
- The renderer preserves physical supergalactic direction and explicitly log-compresses 10–1,400 kpc into 74–128 scene units. Dossiers state that radial scene separations are not linear physical distances.
- Four major anchors render as inspectable meshes; 113 dwarfs and field galaxies share the point renderer. Search, the dedicated LVDB filter, host relations, routes and details all use the same canonical objects.

See `docs/local-group-catalog-and-projection.md` for the selection, source contract and projection boundary.

## SkyMap object history continuation implemented

- Every user-driven SkyMap selection writes a canonical encoded `/skymap?object=...` URL without remounting the renderer.
- Canvas clicks, search, discovery, related-object jumps, route-trail jumps, guided-tour targets and local annotations share one selection-history callback.
- Browser Back/Forward replays target selection and camera focus without pushing a duplicate history entry; returning to plain `/skymap` clears the selected target.
- Stable route helpers round-trip Solar, Gaia and LVDB object IDs and are covered by unit and Playwright history tests.

## Solar object history and copy-link continuation implemented

- Planet, moon, Sun, belt and overview selections now emit one canonical `/solar` target carrying the object, camera mode, spacing model and simulation date.
- User object selections push browser history, while date, camera and scale refinements replace the current entry; composite search, tour, event and bookmark actions therefore create one coherent navigation step rather than a chain of intermediate states.
- Browser Back/Forward reapplies the complete Solar target in place, including a return to plain overview, without remounting the WebGL canvas. The Playwright smoke check compares lifecycle counters before and after replay.
- Mission Control exposes an accessible copy-link control with copied/failed feedback and a Clipboard API fallback. The copied URL is canonicalized before it is written.
- Desktop pointer QA at 1280×720 found and fixed the open Solar search menu's stacking order over the panel dock; the same viewport and Mars-to-Europa-to-Back/Forward journey now run in smoke coverage.
- Headed verification restored Mars and Europa across Back/Forward with `date=2035-07-14`, `mode=planetary` and `scale=realistic`, then confirmed the visible copied state and one live Solar canvas.

## Cross-domain journey continuation implemented

- The seven scale domains now expose a visible target-frame breadcrumb derived from `ReferenceFrameManager`, rather than presenting the scale name without its parent hierarchy.
- `ScaleTransitionPlan` maps each domain to the Earth, Solar or SkyMap renderer surface. Moves within one renderer retain its native camera flight; only renderer-crossing jumps receive the departure/arrival handoff.
- Solar-to-stellar and stellar-to-Solar navigation now holds one frame-aware instrument over the unmount/mount boundary, then fades it over the arrived renderer. The direction, source, target and final reference-frame path remain explicit.
- Header navigation, the scale journey, command/object jumps, SkyMap-to-Solar handoffs and cross-renderer browser Back/Forward share the coordinator. Same-renderer object history still applies immediately and does not remount its canvas.
- OS and in-app reduced-motion preferences bypass the animated handoff entirely. The overlay is a short non-interactive status region and does not trap keyboard focus.
- Headed 1280×720 verification captured both Solar → Stellar and Stellar → Solar handoffs over the arriving canvas. The smoke journey also asserts the renderer lifecycle, stellar breadcrumb, Back/Forward replay and reduced-motion bypass.

See `docs/scale-domain-navigation.md` for the renderer mapping, event contract and scientific boundary.

## SkyMap screen-space label continuation implemented

- SkyMap's former priority-only 18-label slice is replaced by a deterministic screen-space rectangle planner. It projects eligible anchors through the live camera, clips off-viewport candidates and rejects lower-priority overlaps.
- Selected, hovered and focused objects are pinned ahead of contextual labels; two simultaneous interaction labels remain available even if their estimated rectangles overlap.
- Density is part of the shared quality contract: Ultra permits 20 labels, High 16, Balanced 12 and Low/mobile 8. The planner evaluates at a throttled 120 ms cadence during rendered frames and only updates React when the accepted ID set changes.
- Label HTML is centre-anchored and pointer-passive, so collision estimates match the DOM more closely and labels cannot intercept canvas selection.
- Pure layout tests cover priority, pinned labels, clipping and budgets. Browser smoke measures the actual Balanced DOM rectangles and fails on either a budget breach or a visible overlap.
- Headed 1280×720 inspection of the Proxima focus produced five legible, non-overlapping labels in the current frame while retaining the selected target.

## Solar texture-streaming continuation implemented

- The former `preloadSolarTextures()` path requested the Sun, every planet and every major moon at startup. It is replaced by `preloadSolarEssentialTextures()`, which boots only the solar presentation assets already needed by the mounted scene.
- Planet meshes retain their authored colour hint as an immediate fallback at far and mid LOD. A planet surface promotes to the cached performance/high texture path only when selected, hovered or genuinely inside its near threshold.
- Moon meshes remain parent/proximity gated by the existing visible-moon system, so an unvisited planetary system does not cause its moon texture to mount and load.
- Texture promises and successful assets continue to share the existing cache; selection promotion does not duplicate a pending or completed request.
- Pure policy tests cover far/mid fallback and selected/hovered/near promotion. The Solar history smoke flow proves that Mars and Europa request their texture only after selection, while every isolated cold load now fails if more than three planet surfaces are requested during boot.
- The loading scrim now tracks the essential boot set rather than implying that the full planetary catalogue must download before Solar Explorer is usable.

## IAU constellation-boundary continuation implemented

- A bounded-retry fetch records all 89 public IAU J2000 text paths representing the 88 official constellation regions; the two disjoint Serpens paths are preserved and normalised to `SER` without discarding their raw labels.
- The deterministic build verifies the compressed snapshot, uncompressed payload and every source text checksum, validates 1,565 RA/Dec vertices, closes every region and deduplicates shared undirected edges.
- The generated network contains 788 unique edges and 4,189 interpolation vertices on a radius-132 symbolic J2000 equatorial display sphere. The radius is explicitly not a physical distance.
- The off-by-default **Constellation boundaries** layer emits one passive line batch, avoids per-edge React objects and raycasting, remains available under object filters, and culls outside the all-sky camera band.
- UI and documentation distinguish official IAU region boundaries from unstandardised constellation stick figures. No chart image or invented figure artwork is included.
- Catalogue checks, TypeScript, all 75 unit tests, lint with zero errors, the production build, full desktop/mobile Playwright smoke coverage, and a final headed browser inspection all pass with one live SkyMap canvas.

See `docs/constellation-boundary-overlay.md` for the authoritative inputs, projection boundary and reproducible commands.

## Bidirectional time-playback continuation implemented

- Solar Explorer and SkyMap now share a bounded UTC advance primitive with explicit `forward` / `reverse` direction state and positive speed magnitudes.
- Both surfaces expose the same accessible **Playback direction** button group with pressed-state semantics; direction can change while paused or playing without changing the selected speed.
- Solar reverse playback drives the same planetary-date model as forward playback and reverses the presentation-layer planet, cloud and solar-surface rotational flow.
- SkyMap reverse playback updates the approximate Solar bridge and Gaia DR3 Worker propagation while fixed J2000 and static deep-space layers retain their disclosed time behavior.
- Both clocks clamp and pause automatically at their lower or upper date boundary rather than running indefinitely against a pinned date.
- Pure clock tests, reducer tests and the full browser smoke journey verify date movement in both directions, reverse-boundary behavior and restoration to forward/present time.

See `docs/bidirectional-time-playback.md` for the clock contracts, presentation/scientific boundary and test coverage.

### Measured catalogue and renderer evidence

- The committed catalogue manifest records 15,448 Gaia sources, 832 bounded navigation records, 49 chunks and 2,295,712 binary bytes. The navigation set now includes every one of the 497 exact NASA Exoplanet Archive host matches without changing the GPU point population. Its reproducible compressed source snapshot is 2,511,168 bytes. Radial velocity and uncertainty are present for 13,492 records (87.34%); the other 1,956 use the explicit zero fallback.
- Fresh Balanced SkyMap load at 1440×940 on the local development server reached catalogue-ready in about 3.10 s: 99 catalogue requests, 2,499,644 transferred bytes, 12,784 G-eligible sources, 2,518 visible/rendered catalogue points, 3,487 total point primitives, 126 draw calls, 146 geometries, one canvas and zero console errors. The observed spatial request sequence began `sky-40`, `sky-44`, `sky-46`, `sky-41`, demonstrating camera-derived order rather than manifest order.
- Low mode admitted 8,060 sources, rendered the 1,695 inside the measured frustum, produced 2,284 total point primitives and reached ready in about 1.95 s in the same local environment.
- The software/headless samples reported roughly 14 FPS in Balanced and 16 FPS in Low. These are diagnostic baselines, not evidence of normal hardware-accelerated desktop frame rate; a headed/GPU trace remains required before claiming the smooth-desktop target.
- Exact JSON reports are committed under `docs/metrics/` and can be regenerated with `npm run catalog:measure`.
- The completed continuation passes 164/164 frontend tests, TypeScript, all catalogue/constellation/texture integrity checks, the production build, the Express backend build and the complete desktop/mobile smoke matrix. EarthViewer remains green at 164/164 tests and a production build. Three repeated desktop and two repeated 390×844 Solar cold loads also pass. Lint remains at the repository warning baseline with zero errors.
- Headed browser verification exercised the live view-adjacent SkyMap at 1280×720 and 390×844: the visible stream contract reported all 15,448 sources from 49 chunks, one canvas, no Vite error overlay and no warning/error console entries. The mobile document and body widths both remained exactly 390 px. Earlier Andromeda fly-to verification also confirmed camera-dependent catalogue filtering.

## Cancelable camera-flight continuation implemented

- Solar Explorer and SkyMap now publish one shared camera-flight state and expose the active destination through a temporary live-status instrument with a keyboard-accessible **Cancel flight** button.
- Button clicks, `Escape`, pointer/touch OrbitControls start and Solar tracking activation cancel camera ownership immediately. SkyMap retains its existing free-explore handoff after manual input.
- Operating-system or in-app reduced motion snaps directly to the requested pose without mounting an animated flight instrument.
- Solar flight effects now start from explicit focus/navigation tokens rather than live simulation-time updates. The demand-render callback is stable across diagnostics refreshes, preventing render telemetry or ephemeris motion from relaunching a cancelled flight.
- The `camera-flights` Playwright journey verifies Solar button, pointer and `Escape` cancellation; SkyMap button and `Escape` cancellation; and no-flight reduced-motion behavior in both renderers. Full desktop/mobile, WebGL lifecycle, timeout and five cold-load checks remain green.

See `docs/camera-flight-navigation.md` for the ownership, accessibility and verification contract.

## Authoritative quality-work continuation implemented

- One shared `QualityManager` profile now owns the real renderer work limits for both 3D surfaces. The former hard-coded Solar geometry/orbit/asteroid values and SkyMap background/mesh/galaxy/cosmological values are removed from their render paths.
- Solar consumes tier budgets for Sun, planet, moon and atmosphere tessellation; planet and moon orbit sampling; selected-orbit trails; ring geometry; background stars; asteroid capacity; Gaia points and shadow-map resolution.
- SkyMap consumes the same profile for Gaia and background stars, screen-space label collision limits, landmark mesh tessellation, Milky Way fitted-corridor points and deterministic measured-galaxy DESI catalogue prefixes.
- All numeric budgets are finite, positive and monotonic from Low through Ultra. SkyMap label limits are derived from the shared profile rather than copied into a second table.
- Runtime diagnostics expose the selected tier and relevant configured caps. Playwright switches Solar and SkyMap through Low and High and asserts their exact reported budgets; pure tests enforce the complete four-tier ordering.
- These controls affect presentation work only. Scientific coordinates, ephemerides, reference frames and catalogue records do not change with quality, and higher schematic point counts do not imply additional observations.

See `docs/quality-render-budgets.md` for the complete matrix, runtime ownership and scientific boundary.

## Planetary body-orientation continuation implemented

- The Sun and all nine planet/dwarf-planet records now use a deterministic body-fixed frame evaluated from the shared simulation timestamp rather than accumulating rounded render-frame rotation.
- IAU WGCCRE 2015 pole and prime-meridian equations drive the Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto, including the published periodic terms. Earth uses the IERS 2010 Earth Rotation Angle convention.
- The renderer constructs a complete prime-meridian/pole/right-handed scene basis, preserving negative-W retrograde rotation and the cited giant-planet rotation-system conventions.
- The Solar details panel exposes current W/ERA, ICRF pole, pole/ecliptic angle, nominal spin period and sense, convention, primary source and body-specific accuracy note. SkyMap planet objects carry the same orientation metadata and provenance.
- UTC-as-TDB/UT1, omitted live Earth-orientation/precession-nutation, solar differential rotation, giant-planet atmospheric drift and unregistered texture seams are disclosed rather than hidden behind a generic axial-tilt number.
- The former arbitrary Moon wall-clock spin is removed. Moon attitude remains explicitly unmodeled; its position now uses the controlled lunar evaluator inside the Solar validity window.
- Current verification passes 151/151 SpaceViewer frontend tests, zero-error lint at the existing 50-warning baseline, production builds, every catalogue/constellation/texture integrity check, the complete desktop/mobile smoke matrix, five repeated Solar cold loads and headed desktop/390×844 inspection with a clean browser console.

See `docs/planetary-body-orientation.md` for equations, receipt, frame construction, source links and continuation.

## Planetary eclipse-shadow continuation implemented

- Selected planets now receive deterministic major-moon shadowing from physical radii and the shared simulation-time geometry rather than a painted decal or compressed scene distance.
- The shader evaluates finite apparent Sun/moon discs at each surface fragment; circular-disc overlap continuously distinguishes umbra, antumbra and penumbra intensity.
- IAU 2015 Resolution B3 supplies the exact nominal solar-radius conversion constant, while NASA's eclipse geometry reference anchors terminology and the visible attribution record.
- Conservative scientific-unit cone culling prevents unrelated moons from mounting shadow work. Ultra, High and Balanced retain the analytic layer; Low/mobile disables it, and runtime diagnostics expose both candidate count and quality state.
- The details dossier identifies candidate moons and their actual analytical-or-seed orbit model. Controlled Moon/Galilean inputs improve the supplied states but do not add light-time, limb topography, refraction, body attitude or operational ground tracks.

See `docs/planetary-eclipse-shadows.md` for the equations, source contract, LOD ownership and continuation boundary.

## Planetary ring-shadow continuation implemented

- Saturn's former generic 1.25–2.15-radius annulus is replaced by NASA D/C/B/A/F physical bounds and representative optical depths. Uranus now exposes its nine classical narrow rings from the NASA PDS Ring-Moon Systems Node rather than omitting its ring system.
- Both systems convert kilometre radii at the renderer boundary and remain in the date-evaluated body-fixed equatorial plane. The scientific profile is separate from presentation colour and texture ownership.
- Ring fragments receive a finite-Sun spherical-planet shadow. A second pointer-passive, depth-tested surface layer traces sunward rays through the ring plane and converts normal optical depth to slant-path transmission, producing ring shadows on the planet.
- Saturn keeps its streamed one-dimensional colour/alpha texture with a sourced procedural fallback. Uranus uses a bounded nine-band procedural profile; antialiasing improves screen visibility without changing stored physical widths.
- Ultra, High and Balanced retain the planet-received pass when a ringed world is selected or near. Low/mobile removes that extra draw while preserving the base rings and planet-cast shadow. Visible dossiers and runtime diagnostics expose the active model, source, ring system and limitation boundary.
- Verification passes 151/151 frontend tests, zero-error lint at the existing 50-warning baseline, the production build, every catalogue/constellation/texture check and the full desktop/mobile smoke matrix. Headed inspection covers focused Saturn, Uranus's narrow procedural rings and the 390×844 Saturn dossier without horizontal overflow.

See `docs/planetary-ring-shadows.md` for source receipts, equations, LOD ownership and scientific limitations.

## Moon eclipse and mutual-shadow continuation implemented

- Selected moons now evaluate their parent planet and sibling major moons as finite-disc solar occluders in physical AU/kilometre space before presentation projection.
- The shared circular-disc overlap shader renders parent-planet eclipses and mutual moon shadows on the target moon. Conservative cone culling means no surface layer mounts without a modeled penumbra intersection.
- The moon dossier distinguishes parent versus mutual events, identifies occluders, reports center obscuration and links the NASA/IAU geometry sources. Moon/Galilean timing uses the controlled analytical states; other moon systems retain illustrative circular-seed timing, and all paths remain non-operational without light-time, attitude/shape and ground-track inputs.
- Ultra, High and Balanced render the selected-moon layers; Low/mobile retains diagnostics but reports zero mounted passes. Runtime telemetry exposes candidate count, IDs and pass count separately.
- Headed QA caught and fixed the old selected-moon halo writing depth over the surface. It is now a back-face, depth-passive rim, allowing Europa's Jupiter eclipse to remain visibly dark.
- Verification passes 151/151 frontend tests, zero-error lint at the existing 50-warning baseline, both SpaceViewer and EarthViewer production builds, all catalogue/constellation/texture checks and the complete desktop/mobile smoke matrix. Headed 1280×720 and 390×844 inspection confirms the Jupiter occluder readout, the dark Europa surface, a 342 px mobile dossier and no horizontal overflow.

See `docs/moon-eclipse-and-mutual-shadows.md` for geometry ownership, source links, quality behavior and the prediction boundary.

## Planetary atmosphere-scattering continuation implemented

- Earth now uses a deterministic, cached single-scattering optical-depth table derived from the published Bruneton reference Earth parameterization instead of the former generic analytic halo.
- Mars uses JPL's 11.1 km scale height and published Mars/Earth number-density comparison to derive a clearly labelled provisional molecular table. Dust/Mie extinction stays zero rather than inventing a seasonal aerosol state.
- The CPU builder integrates exponential density along spherical view and Sun rays; the RGBA table encodes view/Sun molecular and aerosol optical depth. The shader reconstructs RGB Rayleigh depth, applies Rayleigh and Henyey-Greenstein phase terms and consumes the real scene Sun direction.
- Low, Balanced, High and Ultra own 32×16, 64×32, 96×48 and 128×64 table sizes. Module-level caching prevents remounts or frames from rebuilding a table.
- Venus and the giant planets retain a visible sun-aware analytic fallback until reviewed body-specific profiles exist. The dossier and runtime diagnostics expose the active model, source status, size, pass count and scientific boundary.
- Headed QA removed the old generic selection bubble from bodies with an atmosphere so it no longer flattens the source-backed limb. Airless bodies retain the selection cue.
- Current verification passes 164/164 frontend tests, zero-error lint at the existing 50-warning baseline, both application builds, the backend build, every catalogue/constellation/texture integrity check and the full desktop/mobile smoke matrix. Headed Earth/Mars inspection plus a measured 390×844 Earth dossier confirms the 316 px readout inside a 342 px panel with no horizontal overflow; headed SkyMap inspection also confirms the 49-chunk view-priority status without mobile overflow.

See `docs/planetary-atmosphere-scattering.md` for inputs, table channels, source receipts, LOD ownership and the multiple-scattering boundary.

## Measured Milky Way tracer continuation implemented

- The former four-arm procedural Milky Way is now only a low-opacity loading/error fallback. Normal rendering streams a cacheable 22 KB binary compiled from all 199 rows of Reid et al. (2019), VizieR `J/ApJ/885/131`.
- The source receipt pins the VizieR `ReadMe`, tracer table, reference table, and usage-policy snapshot by byte length and SHA-256. The deterministic builder revalidates every receipt, fixed-width field, record count, source key and ICRS-to-Galactic transform before writing the public asset.
- Each record retains position, parallax and uncertainty, proper motions and uncertainties, LSR velocity and uncertainty, published arm code, references, nominal reciprocal-parallax distance, diagnostic reciprocal one-sigma span and Galactic Cartesian position. Nine low-S/N tracers and one unbounded upper span remain explicit.
- Seven arm corridors reproduce the Table 2 central fits only across their measured azimuth ranges. Their density uses published intrinsic Gaussian one-sigma widths and the adopted 42 pc/kpc width slope. Marginal parameter errors are exposed; no joint confidence envelope is invented without covariance.
- Bright GPU points are observations; diffuse points are fitted density cues. The UI, tour, object dossier and runtime HUD distinguish those roles and report loading, verified data or fallback state.
- The binary decoder validates header layout, manifest dimensions, record values and SHA-256 before use. Pure tests cover the source/selection/licence/uncertainty contract, all 199 finite rendered positions, finite uncertainty segments and tamper rejection.
- VizieR's reviewed terms permit scientific use with citation but defer commercial use to the originating source. The manifest and UI therefore carry a scientific-use/citation-required status and an explicit commercial-rights boundary rather than a fabricated permissive licence.
- Current verification passes 167/167 frontend tests, TypeScript, zero-error lint at the existing 50-warning baseline, every catalogue/constellation/ephemeris/texture integrity check, frontend and backend production builds, and the complete desktop/mobile smoke matrix. The smoke suite now includes a dedicated one-request binary-load, measured-status, dossier, manifest-link and mobile-overflow gate. Headed 1440×940 and 390×844 inspection confirmed one canvas, the measured tracer HUD, a clean console and no Vite overlay.

See `docs/galactic-and-cosmological-visualizations.md` for the complete source, selection, binary, frame, uncertainty and fallback contracts.

## DESI DR1 measured light-cone continuation implemented

- The former normalized procedural cosmic-web graph is replaced by 22,648 measured galaxies from the official DESI DR1 LSS `BGS_BRIGHT-21.5_NGC_clustering.dat.fits` catalogue, version `iron/LSScats/v1.5`.
- A reproducible fetch step pins the 217,614-row source FITS, published NGC `n(z)` table and DESI licence/acknowledgment page by byte length and SHA-256. The source receipt preserves the release URLs, CC BY 4.0 obligation and DESI sample-paper DOI.
- The deterministic selection is ICRS RA 130–250 degrees, Dec 30–40 degrees and spectroscopic redshift 0.1–0.4. The resulting rectangular strip is explicitly not volume-complete; DESI footprint, targeting, veto, fibre/redshift success and absolute-magnitude selection remain visible boundaries.
- Every binary record retains `TARGETID`, RA, Dec, redshift and the available LSS completeness/systematic/FKP fields. Stable SplitMix64 ordering supplies prefix LODs of 10,240, 16,384 and 22,648 records; no random runtime thinning, duplication or brightness weighting is used.
- Observer-centred comoving radius is inferred from measured redshift under the declared Planck 2018 flat Lambda-CDM reference (`H0=67.4 km/s/Mpc`, `Omega_m=0.315`, `Omega_Lambda=0.685`). The 434.47–1,604.46 Mpc radii are redshift-space model distances, not independent distance measurements; peculiar velocities and the catalogue's missing per-object `ZERR` remain explicit uncertainty boundaries.
- The 1,630,752-byte `galaxies.svlc` asset has a 96-byte versioned header, 72-byte records and SHA-256 `4b5167b26a2f63c498eb4df2b6b76193564cad494aae87930cf83de35bc17e78`. Runtime decode verifies manifest length, header layout, record count, finite ranges and integrity before rendering.
- Normal rendering contains measured points, a thin declared-selection outline and no inferred filaments, nearest-neighbour edges, smoothed density or procedural galaxies. Only a 32-point low-opacity fallback can appear while loading or after validation failure, and that state is explicitly labelled.
- Automated verification passes 170/170 frontend tests, TypeScript, zero-error lint at the existing 50-warning baseline, all catalogue/constellation/ephemeris/texture checks, frontend and backend production builds, and the complete desktop/mobile smoke matrix. The smoke suite verifies one catalogue request, the 22,648-source dossier, LOD status, no-link disclosure and 390×844 layout.
- Clean in-app browser inspection at 1280×720 and 390×844 confirmed the full redshift wedge, one canvas, no Vite overlay, no horizontal overflow, visible selection/uncertainty/usage boundaries and no warning/error console entries. The Balanced HUD reported `22,648 measured galaxies · 16,384 rendered · z 0.1–0.4 · no inferred links`.

See `docs/galactic-and-cosmological-visualizations.md` for the source receipt, selection, binary layout, cosmology transform, quality contract and claim boundaries.

## NASA Exoplanet Archive nearby-system continuation implemented

- The SkyMap object model now includes a first-class `exoplanet-system` kind. Global search resolves host names, every retained planet name and available Gaia/HIP/HD/TIC identifiers to one physical host-system point.
- A reproducible NASA Exoplanet Archive TAP fetch pins the exact `pscomppars` query, compressed snapshot and archive acknowledgment page by byte length and SHA-256. The 2026-09-02 selection contains 1,568 confirmed planets in 1,056 systems with finite ICRS RA/Dec and published host distance no greater than 100 pc.
- The selection is explicitly not completeness-limited or suitable for occurrence-rate inference. PSCompPars' warning that composite values can come from different literature references and need not form one self-consistent physical solution is visible in every dossier.
- The deterministic builder verifies host-coordinate consistency, groups planets by host and emits 12 independent 30-degree ICRS RA sectors. The manifest pins each sector's count, byte length and SHA-256; the runtime validates integrity before parsing and progressively publishes three-sector batches.
- A generic SkyMap cold load gives the existing Gaia stream priority. Exoplanets begin 1.5 seconds after Gaia reaches ready; an exoplanet deep link bypasses the delay. Smoke instrumentation now expands the Resource Timing buffer so all 49 Gaia binaries plus the additional catalogue resources remain observable instead of silently dropping late entries.
- Every system renders as one point at its physical host ICRS direction and source distance. Planetary orbits are deliberately unresolved at stellar-map scale. Planet period, semi-major axis, radius, mass, equilibrium temperature, discovery metadata and published asymmetric errors remain structured dossier fields, and missing values remain missing.
- The v2 builder verifies both pinned source snapshots and resolves only exact NASA `gaia_dr3_id` identifiers present in the rendered Gaia subset. Of 1,056 systems, 1,033 publish an identifier and 497 match the current renderer selection; 536 identified hosts are outside the bright Gaia subset and 23 publish no Gaia DR3 identifier in PSCompPars.
- All 497 matches are forced into the bounded Gaia navigation metadata, even when outside a chunk's ordinary top-brightness slice. Reciprocal object relations, dual-catalogue provenance and dossier evidence connect the NASA host-system point to its Gaia source without replacing either catalogue's coordinate or distance measurement.
- The build records the exact source hashes and validates a maximum 5.197-arcsecond catalogue-position separation against a 10-arcsecond ceiling. It never promotes angular proximity into identity: systems without the exact archive identifier remain explicitly unmatched.
- Current verification passes 174/174 frontend tests, TypeScript, zero-error lint at the unchanged 50-warning baseline, source/build drift checks, production build and the complete desktop/mobile smoke matrix. The new journeys verify one manifest plus 12 sector requests, direct Proxima restoration, TRAPPIST-1 planet-name search, scientific boundaries and phone-width layout.

See `docs/nearby-exoplanet-catalog.md` for the query, receipt, chunk contract, coordinate transform, runtime priority and scientific boundaries.

## OpenNGC deep-sky continuation implemented

- The former hand-curated broader deep-space layer is replaced by a deterministic display-oriented selection from OpenNGC release `v20260501`, pinned to commit `36cb178a0f69dba8bfc03a99c10512831edf1c6b`. The source receipt locks the main table, addendum, field guide, README and complete CC BY-SA 4.0 licence text by byte length and SHA-256.
- The builder validates 14,033 source rows and retains accepted deep-sky classes that have finite J2000 right ascension and declination plus at least one visible-selection signal: a Messier cross-reference, preferred V/B magnitude no fainter than 12, or major axis at least 2 arcminutes. It excludes ten NGC/IC/M identities already represented by the physical LVDB layer.
- The final adaptation contains 3,004 objects: 1,997 galaxies, 315 nebulae/remnants and 692 clusters. This is a rendering selection, not a complete or statistically uniform catalogue; source footprint, heterogeneous measurements, missing values and the explicit display threshold remain visible claim boundaries.
- Twelve independent 30-degree right-ascension sectors carry stable object identities, aliases, J2000 coordinates and available classification, magnitude, angular-size, position-angle, morphology, redshift, radial-velocity and surface-brightness fields. The manifest pins every sector's count, byte length and SHA-256; runtime loading validates bytes and digest before JSON parsing and publishes three-sector batches.
- Each J2000 direction is projected onto a fixed 108-scene-unit sphere. Dossiers explicitly say `Measured J2000 direction · angular shell` and `Not supplied · angular catalogue`; no parsec/light-year distance is inferred from that radius, and distance filters exclude these records rather than silently treating them as zero-distance objects.
- Featured or high-importance sources remain inspectable meshes while the remaining catalogue context uses point renderables. Generic SkyMap loads give Gaia priority before OpenNGC begins; a `deep:` route starts the OpenNGC stream immediately. Search, aliases, legacy editorial routes, tours, filters and dossiers resolve to the same canonical catalogue objects, while the editorial overlay supplies only display names, imagery and importance rather than numerical astronomy.
- The public manifest and every source dossier identify the derived assets as OpenNGC CC BY-SA 4.0 adapted material and link the local manifest. Unrelated SpaceViewer code and assets are not relicensed by that attribution.
- Current verification passes 179/179 frontend tests, TypeScript, zero-error lint at the unchanged 50-warning baseline, OpenNGC source/build drift checks, the frontend and backend production builds, and the complete desktop/mobile smoke matrix. The new journeys verify the direct Orion/M42 route, exactly one manifest plus twelve sector requests, the 3,004-object HUD, angular-distance boundary, licence/manifest evidence, search and 390×844 layout. In-app inspection at 1280×720 and 390×844 confirmed one canvas, no Vite error overlay, no horizontal overflow and the measured-direction/unknown-distance dossier contract.

See `docs/openngc-deep-sky-catalog.md` for the immutable receipt, selection predicate, generated-sector contract, coordinate transform, rendering policy and licence boundary.

## Controlled satellite-ephemeris continuation implemented

- Exact `astronomy-engine` 2.1.19 is now a runtime dependency for five parent-relative states: Earth's Moon through its Brown/Improved-Lunar-Ephemeris-derived model, and Io, Europa, Ganymede and Callisto through the IMCCE L1.2 Galilean theory.
- A source receipt pins the npm tarball integrity, `v2.1.19` release commit, MIT licence hash and installed implementation/type/manifest hashes. A deterministic builder publishes a smaller runtime manifest and fails on package, receipt or generated-output drift.
- The provider rotates both EQJ position and velocity into J2000 mean-ecliptic axes, preserves the geocentric or jovicentric relative origin and only then adds the shared heliocentric parent state. Its product claim is bounded to the existing 2025–2050 Solar window.
- Unsupported moons and out-of-window calls return no controlled result, preserving the visible `parent-relative-circular` fallback instead of extrapolating or manufacturing velocity.
- Solar Explorer's moon placement and orbit guides, eclipse candidates, mission readout and dossier now consume the shared states. SkyMap's Solar layer uses the same model and source provenance. Selected-moon diagnostics report model, controlled status and velocity availability.
- The implementation shares one same-epoch evaluation and keeps analytical orbit guides in a bounded 32-entry day cache, avoiding full orbit resampling per animation frame.
- Independent tests compare all five ECLIPJ2000 position and velocity vectors at 2025-01-01 against pinned NASA/JPL Horizons fixtures at the corresponding TT/TDB epoch with relative error below `0.0009`. Eclipse tests and browser smoke exercise dated Jupiter/Europa states plus the separate controlled lunar dossier.
- Final verification passes 185/185 frontend tests, TypeScript, the VSOP87C and satellite drift checks, zero-error lint at an improved 49-warning baseline, frontend and backend production builds, and the complete desktop/mobile smoke matrix. In-app 1280×720 Europa and 390×844 lunar inspection confirmed one canvas, no Vite overlay, no horizontal overflow, visible model/frame/manifest provenance and no warning/error console entries.
- This is still visualization-grade. Light-time, limb/shape, libration/attitude, topocentric ground tracks, operational event qualification and controlled ephemerides for the remaining moon systems are deliberately unresolved.

See `docs/controlled-satellite-ephemerides.md` for source identity, frame conversion, runtime/cache ownership, fixture details and the claim boundary.

## Global astronomical command continuation implemented

- App-wide keyboard search now ranks exact, scoped, prefix, label and catalogue-alias matches before the archive-imagery fallback; pressing Enter on an astronomical target performs the spatial jump instead of unexpectedly opening Gallery.
- The instant index covers the Sun, planets, major moons, asteroid belt, all nine source-receipted small bodies, the 55-record common-name stellar navigation seed, curated deep-space landmarks, the measured Milky Way structure targets and the measured DESI DR1 light cone.
- Small-body commands retain JPL designations and orbit classes in their searchable metadata. Named-star commands visibly retain the `curated navigation seed` boundary rather than implying that the reviewed Gaia cross-match is complete.
- Every destination goes through the existing scale-transition coordinator and canonical Solar or SkyMap object route, preserving Back/Forward and shareability.
- Full Gaia, OpenNGC and nearby-exoplanet records remain searchable inside progressively loaded SkyMap. The app shell deliberately does not preload those catalogues merely to populate a command menu.
- Unit coverage pins match priority and catalogue aliases. Browser and smoke coverage use keyboard Enter for Halley's Comet and Sirius A and assert their canonical cross-surface routes; phone-width coverage asserts the ranked command remains overflow-free.

See `docs/global-astronomical-command-search.md` for the ranking contract, indexed target set and progressive-catalogue boundary.

## Astronomical depth-precision continuation implemented

- Solar Explorer and SkyMap now request Three.js r182's reverse-Z depth buffer on every WebGL 2 renderer. Three.js activates it only when the actual context exposes `EXT_clip_control`; unsupported devices retain the normal depth path without losing either surface.
- The capability probe, backend contract and mounted renderer report the same explicit `reverse-z` or `standard` strategy. Each live canvas carries `data-spaceviewer-depth-strategy`, and `window.__SPACEVIEWER_WEBGL__` retains the active strategy alongside lifecycle, draw and memory diagnostics for automated verification.
- This complements the existing camera-relative floating-origin projection: floating origin protects large world-coordinate subtraction before Float32 GPU upload, while reverse-Z improves depth distribution inside the camera frustum. It does not make scene units physically continuous across the Solar/SkyMap representation boundary.
- Pure coverage pins capability resolution and the fallback. The browser lifecycle journey now rejects a missing, unknown or canvas/diagnostic-mismatched strategy on both 3D surfaces.
- The current in-app Chromium context reports `reverse-z` on both Solar Explorer and SkyMap. Standard depth remains an intentional supported outcome on contexts without the extension.

See `docs/depth-precision-and-reverse-z.md` for the renderer option, fallback behavior and proof boundary.

## Known limitations and continuation order

1. Obtain an explicit originating-journal/rights-holder decision before treating the Reid et al. catalogue asset as cleared for public commercial redistribution; the current verified VizieR grant is scientific use with citation.
2. Evaluate light-time, acceleration-solution handling and a controlled missing-RV velocity-dispersion prior where they materially improve the bounded experience; add a reviewed common-name cross-match against the Gaia renderer. The exact NASA Exoplanet Archive host-ID cross-match is now implemented for all 497 matching sources in the renderer subset.
3. Add catalogue-completeness context for the Local Group layer and, if quantitative density interpretation becomes a product requirement, add the DESI random-catalogue/window-function comparison rather than treating the measured-point light cone as a density estimator. Add physical distances to broader deep-sky objects only through a source-receipted, uncertainty-aware cross-match; do not reinterpret the OpenNGC angular shell as radial data.
4. Profile the 49-cell Gaia request/draw-call overhead and the new Galactic binary/corridor draw work under production HTTP compression and hardware acceleration before increasing partition or density budgets.
5. Prototype a WebGPU point renderer behind `RendererBackend` only after larger-catalogue profiling demonstrates a bottleneck; retain WebGL 2 fallback.
6. Continue Solar materials with reviewed, cartographically registered normal/roughness sources; extend the Earth/Mars atmosphere path with controlled body-specific spectral, absorption, aerosol and multiple-scattering inputs; extend the controlled satellite path beyond the Moon and Galileans, then add lunar/satellite attitude, shape and light-time inputs; extend ring transmission with oblateness, wavelength-dependent profiles and vertical structure; and add controlled SPICE/EOP inputs where needed.
7. Converge React/R3F/Three versions, then evaluate packaging EarthViewer's renderer as a lazy surface module. Do not merge it before that compatibility and bundle-size work is measured.
8. Profile the yearly ephemeris requests under production HTTP compression and caching, then version additional validity blocks only if the product needs dates outside 2025-2050; do not silently extrapolate the current browser asset.
9. Add optional camera-pose serialization when exact observer position and orientation need to extend the implemented object/date/mode/scale history contract.
10. Evaluate a shared-canvas or renderer-preserving Earth/Solar/SkyMap transition only after runtime convergence and measured memory cost; the current crossfade is deliberately a representation handoff, not a claim of one physically continuous GPU scene.
