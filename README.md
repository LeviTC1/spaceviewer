# SpaceViewer

An interactive universe explorer: travel continuously, at true scale, from the surface of the Moon to the Local Group through real catalogues — then open real archive observations of whatever you are looking at.

## Surfaces

Every object is a place you can fly to and a photograph someone has taken. One bar (Universe · Images ·
Your sky · Tools) and one search, **Find anything** (⌘K), cover the whole product. The full map of where
every capability lives is in [docs/redesign/11-capability-map.md](docs/redesign/11-capability-map.md).

| Mode | What it does |
|---|---|
| **Universe** (`/`, `/explore/<object>`, `/explore?moment=<id>`) | The front door. Start here, Show me something incredible, Moments (real events replayed at their real date), Seen by telescopes (archive photographs in every object panel), Save view, postcards. |
| **Universe engine** | One physically scaled, camera-relative float64 universe: Sun, planets, moons, small bodies and Voyager from ephemerides; all streamed Gaia DR3 stars with per-camera apparent magnitude; exoplanet systems; nebulae, clusters and galaxies as volumes at catalogue distance, size and orientation; a Milky Way whose arms follow Reid et al. (2019); Sgr A*. Search, flights across 16 orders of magnitude, curated journeys, time travel, and shareable exact observations (`?t=…&rate=…&cam=…`). See [docs/redesign](docs/redesign/02-implementation.md). |
| **Images** (`/images`, `/images?q=…`; `/archive` redirects) | Search NASA, SDSS and Pan-STARRS at once (NASA answers first), browse the sky, Wander (discovery sessions), Live from NASA |
| **Results** | Browse/filter/dedupe/compare results with per-source health status; "Fly to …" when the search names a place |
| **Viewer** (`/viewer/<id>`) | Inspect a single image (zoom, fit modes, exposure histogram, filters, notes, provenance) plus **Where is this?**: the place, its light-travel time, Fly there |
| **Your sky** (`/saved`) | Saved views, saved photographs, Solar bookmarks, notes, recent places and searches, suggestions |
| **Solar Explorer** | 3D solar system (react-three-fiber) with VSOP87C planet positions, analytical Moon/Galilean states, JPL-SBDB dwarf-planet/comet orbits, disclosed fallbacks, cinematic/educational/linear-AU spacing, bounded forward/reverse time playback, asteroid belt, guided tour |
| **Sky Atlas** (classic SkyMap, `/skymap?classic=1`) | Layered universe map, kept for its specialist layer tools. `/skymap?object=<id>` links now open in Explore. Layers: solar bodies, a streamed 15,448-source Gaia DR3 stellar subset, 1,568 confirmed NASA Exoplanet Archive planets in 1,056 nearby systems, optional official IAU J2000 constellation boundaries, 117 physically directed LVDB Local Group galaxies, 3,004 selected OpenNGC galaxies/nebulae/clusters on a measured J2000 angular shell, a 22,648-galaxy DESI DR1 redshift light cone, user annotations |

## Astronomical engine foundation

Solar Explorer and SkyMap now share an explicit astronomical domain layer rather than relying on renderer scene units as scientific coordinates. It provides:

- typed kilometre, AU, light-year, parsec, kiloparsec and megaparsec conversions;
- hierarchical surface, Earth-fixed, planetocentric, heliocentric, interstellar, galactic and cosmological reference-frame metadata;
- camera-relative floating-origin projection before `Float32Array` GPU upload;
- capability-gated reverse-Z depth on both Three.js canvases, with an automatic standard-depth fallback and live per-canvas diagnostics;
- explicit Surface, Planetary, Solar, Stellar, Galactic, Deep-space and Cosmological scale domains;
- frame-aware cross-renderer handoffs between Solar Explorer, SkyMap and the bridged Earth surface, with reduced-motion bypass and browser-history replay;
- shared cancellable Solar/SkyMap camera flights with destination status, button/`Escape`/manual-input interruption and reduced-motion snapping;
- Ultra, High, Balanced and Low renderer profiles that directly govern shared geometry, population, orbit, label, background and shadow work budgets across both 3D surfaces;
- shared sustained-frame adaptive degradation across Solar Explorer and SkyMap, with a persistent manual override and visible runtime status;
- canonical object/source contracts and a reviewed-vs-review-required attribution registry;
- deterministic Gaia binary chunks with a bright all-sky core, 48 HEALPix level-one cells, SHA-256 integrity and Worker decoding;
- deterministic VSOP87C Float64 yearly blocks with SHA-256 verification, idle loading, a visible Keplerian boot fallback and no runtime theory bundle;
- receipted Astronomy Engine 2.1.19 state vectors for Earth's Moon and the four Galilean moons, with JPL Horizons regression fixtures, ecliptic frame conversion, velocity, model-aware eclipse geometry and explicit seed fallback elsewhere;
- nine canonical small bodies—four missing recognized dwarf planets and five representative comets—propagated from each JPL SBDB osculating-element epoch, with source hashes, direct routes, search/focus dossiers and a disclosed anti-solar comet-tail heuristic;
- live camera-adjacent Gaia streaming in four-cell priority batches with a deterministic manifest-order fallback;
- bounded Worker-side Gaia 3D uniform-motion propagation from J2016.0, using published radial velocity where available and a visible zero fallback otherwise, plus full six-parameter Jacobian covariance for selected-star angular and 3D uncertainty;
- throttled Worker-side Gaia G, clip-frustum and global point-budget filtering with compact indexed GPU draw buffers and visible SkyMap diagnostics;
- camera-projected SkyMap label collision management with pinned interaction targets and Ultra/High/Balanced/Low density budgets;
- bounded forward/reverse playback shared by Solar Explorer and SkyMap, with automatic pause at both date limits;
- date-anchored Sun and planet body frames from IAU WGCCRE pole/prime-meridian equations and IERS Earth Rotation Angle, with visible time-scale and texture-registration limits;
- finite-solar-disc major-moon eclipse shadows with analytic umbra/antumbra/penumbra overlap, scientific-unit geometry and a Low/mobile fallback;
- cached, quality-sized single-scattering optical-depth LUTs for source-backed Earth and density-scaled provisional Mars atmosphere profiles, with an explicit analytic fallback elsewhere;
- three disclosed Solar spacing contracts, including a linear True AU ruler with scale-aware camera envelopes, bookmark persistence and shareable routes;
- canonical Solar object URLs with in-place browser Back/Forward restoration, date/camera/scale context and a first-class copy-link control;
- ranked app-wide astronomical commands that route exact Solar, named-star, deep-space, Galactic and Cosmological targets before offering the archive-imagery fallback, without preloading the full progressive catalogues;
- a pinned CC0 Local Volume Database subset with per-object provenance, uncertainty, host relations and a direction-preserving logarithmic Local Group projection;
- a receipted 88-region IAU J2000 constellation-boundary overlay with shared-edge deduplication and an explicit non-physical display sphere;
- shareable SkyMap object URLs with browser Back/Forward restoration across canvas, search, discovery, tour, route-trail and annotation selections;
- a deterministic SHA-256 planetary-texture inventory with verified per-file source, licence, attribution and transformation receipts;
- an essential-only Solar boot texture set with selected/hovered/near-body promotion instead of preloading every planet and major moon;
- a SHA-256-verified 199-source Reid et al. VLBI maser binary, seven measured-range uncertainty-bearing arm fits, and an explicit loading/error schematic fallback;
- a SHA-256-verified 22,648-galaxy DESI DR1 BGS redshift light cone with LSS weights, deterministic catalogue LODs, and explicit selection/cosmology/uncertainty boundaries;
- a receipted NASA Exoplanet Archive PSCompPars snapshot with 1,568 confirmed planets in 1,056 systems within 100 pc, progressively loaded in 12 integrity-checked ICRS sectors;
- an exact, source-hash-locked NASA `gaia_dr3_id` cross-match for 497 rendered exoplanet hosts, with reciprocal SkyMap relations and no inferred nearest-neighbour identities;
- a CC BY-SA 4.0 OpenNGC `v20260501` adaptation with 3,004 galaxies, nebulae and clusters, progressively loaded in 12 integrity-checked J2000 sectors and rendered on an explicitly non-physical angular shell;
- a versioned two-way URL bridge to the adjacent EarthViewer surface.

The visible scale journey now reaches Galactic and Cosmological scientific visualizations. Its local stellar field is an authoritative, versioned Gaia DR3 visualization subset with explicit selection and distance caveats. Nearby confirmed exoplanets share their physical host-star ICRS positions; 497 exact NASA `gaia_dr3_id` values are linked bidirectionally to the matching rendered Gaia sources, while their sub-arcsecond planetary orbits remain intentionally unresolved and the UI exposes the 100 pc selection bias and PSCompPars composite-parameter boundary. The Milky Way layer distinguishes 199 observed VLBI maser markers and their diagnostic parallax spans from diffuse fitted-arm density cues; the latter never masquerade as extra stars. The Local Group layer uses LVDB physical supergalactic directions and distances with an explicit logarithmic scene-radius boundary. The broader deep-sky layer now uses measured OpenNGC J2000 direction without inventing radial distance: 3,004 selected records sit on a visibly disclosed angular shell. The cosmological view draws only measured DESI DR1 catalogue points inside its declared survey strip—no invented galaxies or nearest-neighbour filaments—and exposes the redshift-space, selection-function, and missing-per-object-error boundaries. The separate 55-record Gaia common-name overlay remains a navigation seed pending a reviewed name cross-match. See [ASTRO_ENGINE_AUDIT.md](ASTRO_ENGINE_AUDIT.md) for the architecture, evidence and exact continuation order.

The two 3D surfaces use the same accessible Forward/Reverse interaction while retaining their model-specific validity windows. See [docs/bidirectional-time-playback.md](docs/bidirectional-time-playback.md) for the clock contracts and scientific boundaries, and [docs/adaptive-quality.md](docs/adaptive-quality.md) for the shared frame-budget and override contract.

## Stack

- **Frontend**: Vite + React 18 + TypeScript, three.js via `@react-three/fiber`; the pinned `vsop87` package is an offline build input for streamed planetary assets and exact `astronomy-engine` 2.1.19 supplies the controlled lunar/Galilean runtime states. No UI framework — custom CSS with design tokens in `frontend/src/styles/theme.css`.
- **Backend**: Express + TypeScript proxy for NASA Image Library, MAST name resolution, SDSS and Pan-STARRS cutouts. In-memory response caching, per-source timeouts, `/api/health` diagnostics.

## Getting started

Requires Node 20+.

```bash
# Terminal 1 — backend (port 3001)
cd backend
npm install
npm run dev

# Terminal 2 — frontend (port 5173, proxies /api to :3001)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

No API keys are required — all upstream archives used are public, keyless endpoints.

### Environment variables

Both apps run with zero configuration. Optional overrides (see `.env.example` in each package):

- `backend`: `PORT` (default `3001`)
- `frontend`: `VITE_API_URL` (default `/api`, which the Vite dev server proxies to `localhost:3001`)
- `frontend`: `VITE_EARTH_VIEWER_URL` (development default `http://localhost:5175/`; set an HTTPS deploy URL in production, or leave blank to disable the Surface destination)

## Scripts

| Where | Command | What |
|---|---|---|
| `frontend` | `npm run dev` | Vite dev server |
| `frontend` | `npm run build` | Production build |
| `frontend` | `npm test` | Vitest unit tests (mapping, filtering, gallery utils, SkyMap reducer, solar panel state) |
| `frontend` | `npm run catalog:fetch` | Fetch and receipt the pinned Gaia DR3 subset from ESA TAP (networked, not part of ordinary builds) |
| `frontend` | `npm run catalog:build` | Compile the nearby-star source into deterministic binary chunks and metadata sidecars |
| `frontend` | `npm run catalog:check` | Fail if committed catalogue assets are missing or stale |
| `frontend` | `npm run catalog:local-group:fetch` | Fetch and receipt the pinned LVDB release asset (networked, not part of ordinary builds) |
| `frontend` | `npm run catalog:local-group:build` | Validate and compile the deterministic 117-galaxy Local Group subset |
| `frontend` | `npm run catalog:local-group:check` | Fail if the committed Local Group assets are missing or stale |
| `frontend` | `npm run catalog:constellations:fetch` | Fetch and receipt the 89 official IAU J2000 boundary paths (networked, not part of ordinary builds) |
| `frontend` | `npm run catalog:constellations:build` | Validate, deduplicate and compile all 88 constellation regions into the angular overlay asset |
| `frontend` | `npm run catalog:constellations:check` | Fail if committed constellation-boundary assets are missing or stale |
| `frontend` | `npm run catalog:milky-way:fetch` | Fetch and SHA-256-lock the Reid et al. VizieR table, references, metadata and usage terms |
| `frontend` | `npm run catalog:milky-way:fetch:check` | Prove all committed Milky Way source snapshots match their receipts |
| `frontend` | `npm run catalog:milky-way:build` | Validate coordinates and compile the 199-source binary, arm-fit metadata and public manifest |
| `frontend` | `npm run catalog:milky-way:check` | Fail if the committed Milky Way binary or manifest is stale or inconsistent |
| `frontend` | `npm run catalog:desi-lightcone:fetch` | Fetch and SHA-256-lock the official DESI DR1 LSS clustering FITS, published NGC n(z), and licence snapshot |
| `frontend` | `npm run catalog:desi-lightcone:fetch:check` | Prove all committed DESI source snapshots match their receipts |
| `frontend` | `npm run catalog:desi-lightcone:build` | Validate the FITS schema and compile the 22,648-galaxy redshift-space binary and manifest |
| `frontend` | `npm run catalog:desi-lightcone:check` | Fail if the committed DESI light-cone binary or manifest is stale or inconsistent |
| `frontend` | `npm run catalog:exoplanets:fetch` | Fetch and receipt the declared nearby confirmed-planet PSCompPars query plus NASA archive acknowledgment page |
| `frontend` | `npm run catalog:exoplanets:fetch:check` | Prove the pinned compressed TAP snapshot and acknowledgment page match their source receipt |
| `frontend` | `npm run catalog:exoplanets:build` | Group confirmed planets by host and compile 12 integrity-checked ICRS sector assets |
| `frontend` | `npm run catalog:exoplanets:check` | Fail if the nearby exoplanet manifest or any sector is stale or inconsistent |
| `frontend` | `npm run catalog:openngc:fetch` | Fetch and receipt immutable OpenNGC `v20260501` source tables, field guide, README and CC BY-SA 4.0 text |
| `frontend` | `npm run catalog:openngc:fetch:check` | Prove every compressed/raw OpenNGC source and documentation snapshot matches its receipt |
| `frontend` | `npm run catalog:openngc:build` | Compile the deterministic 3,004-object selection into 12 J2000 sector assets |
| `frontend` | `npm run catalog:openngc:check` | Fail if the OpenNGC-derived manifest or any sector is stale or inconsistent |
| `frontend` | `npm run catalog:measure -- --base-url=http://localhost:5174 --quality=balanced` | Capture local catalogue readiness, transfer and renderer metrics |
| `frontend` | `npm run ephemeris:build` | Compile the pinned VSOP87C solver into deterministic 2025-2050 yearly Float64 blocks and a representative orbit guide |
| `frontend` | `npm run ephemeris:check` | Fail if committed streamed ephemeris assets are missing or stale |
| `frontend` | `npm run ephemeris:satellites:build` | Generate the public Moon/Galilean source, model, frame, validity and fallback manifest from the pinned package receipt |
| `frontend` | `npm run ephemeris:satellites:check` | Fail on Astronomy Engine package, licence, installed-file, receipt or generated-manifest drift |
| `frontend` | `npm run ephemeris:small-bodies:check` | Re-fetch nine JPL SBDB records and fail if their canonical scientific JSON differs from the pinned receipt |
| `frontend` | `npm run orientation:satellites:build` | Generate the public Moon/Galilean body-frame source, scope, model and accuracy manifest from the pinned NAIF receipt |
| `frontend` | `npm run orientation:satellites:check` | Fail on NAIF source identity, controlled-body scope, runtime source URL or generated-manifest drift |
| `frontend` | `npm run textures:fetch` | Fetch and hash-lock the NASA New Horizons Pluto source mosaic |
| `frontend` | `npm run textures:audit:sources` | Re-download all direct upstream texture sources and prove byte identity |
| `frontend` | `npm run textures:derive` | Rebuild the controlled Pluto, performance-tier and deterministic-noise derivatives |
| `frontend` | `npm run textures:build` | Build the per-file source/licence/transformation manifest |
| `frontend` | `npm run textures:check` | Fail on an unreceipted, changed or stale planetary texture |
| `frontend` | `npm run smoke` | Playwright smoke checks against a running dev server (desktop + phone-width routes) |
| `backend` | `npm run dev` | ts-node-dev with reload |
| `backend` | `npm run build` | TypeScript compile to `dist/` |
| `backend` | `npm start` | Run compiled server |

## A note on generated text

Summaries, object classification, and rarity labels in the Viewer are **deterministic** — generated locally from archive metadata with template/heuristic logic, and labeled as such in the UI. No LLM calls are made.

## Project docs

- [ASTRO_ENGINE_AUDIT.md](ASTRO_ENGINE_AUDIT.md) — current repository evidence, engine architecture, scientific-integrity boundaries and continuation plan
- [docs/star-catalog-pipeline.md](docs/star-catalog-pipeline.md) — Gaia selection, reproducible snapshot, binary format, Worker runtime, measurements and continuation
- [docs/nearby-exoplanet-catalog.md](docs/nearby-exoplanet-catalog.md) — NASA Exoplanet Archive source receipt, 100 pc selection, ICRS sector stream, host-system model and scientific boundaries
- [docs/openngc-deep-sky-catalog.md](docs/openngc-deep-sky-catalog.md) — OpenNGC source receipt, CC BY-SA adaptation, deterministic selection, J2000 sector stream and angular-shell boundary
- [docs/streamed-vsop87c-ephemeris.md](docs/streamed-vsop87c-ephemeris.md) — pinned source receipt, deterministic yearly binaries, integrity checks, lazy runtime and fallback boundary
- [docs/controlled-satellite-ephemerides.md](docs/controlled-satellite-ephemerides.md) — pinned analytical Moon/Galilean states, frames, cache ownership, JPL fixtures and operational-accuracy boundary
- [docs/small-body-ephemeris.md](docs/small-body-ephemeris.md) — JPL SBDB dwarf-planet/comet receipts, epoch-aware propagation, rendering boundaries and live source verification
- [docs/local-group-catalog-and-projection.md](docs/local-group-catalog-and-projection.md) — LVDB source contract, deterministic selection, coordinate frame, uncertainties and logarithmic scene projection
- [docs/constellation-boundary-overlay.md](docs/constellation-boundary-overlay.md) — official IAU source contract, deterministic build, angular projection and the boundary-versus-stick-figure distinction
- [docs/planetary-rendering-and-textures.md](docs/planetary-rendering-and-textures.md) — material model boundaries plus verified texture source, licence, attribution and transformation receipts
- [docs/planetary-atmosphere-scattering.md](docs/planetary-atmosphere-scattering.md) — generated Earth/Mars optical-depth LUTs, source receipts, quality ownership and model boundaries
- [docs/planetary-body-orientation.md](docs/planetary-body-orientation.md) — IAU/IERS pole, prime-meridian, scene-frame and browser-time contracts
- [docs/planetary-eclipse-shadows.md](docs/planetary-eclipse-shadows.md) — finite-disc eclipse geometry, quality gating, provenance and prediction limits
- [docs/moon-eclipse-and-mutual-shadows.md](docs/moon-eclipse-and-mutual-shadows.md) — parent-planet and mutual major-moon finite-disc shadows with explicit prediction limits
- [docs/planetary-ring-shadows.md](docs/planetary-ring-shadows.md) — sourced Saturn/Uranus radial systems and finite-Sun two-way ring shadowing
- [docs/scale-domain-navigation.md](docs/scale-domain-navigation.md) — renderer-surface mapping, reference-frame breadcrumbs, crossfade timing and reduced-motion/history behavior
- [docs/camera-flight-navigation.md](docs/camera-flight-navigation.md) — native Solar/SkyMap flight ownership, cancellation, accessibility and reduced-motion behavior
- [docs/global-astronomical-command-search.md](docs/global-astronomical-command-search.md) — instant cross-domain target coverage, deterministic ranking, route ownership and progressive-catalogue boundary
- [docs/quality-render-budgets.md](docs/quality-render-budgets.md) — authoritative per-tier geometry, population, orbit, label and shadow work limits
- [docs/depth-precision-and-reverse-z.md](docs/depth-precision-and-reverse-z.md) — reverse-Z capability gate, standard-depth fallback and runtime verification contract
- [docs/galactic-and-cosmological-visualizations.md](docs/galactic-and-cosmological-visualizations.md) — source inputs, renderer semantics, LOD, and scientific-claim boundaries for the outer scale domains
- [docs/spaceviewer-2026-vision-and-upgrade-plan.md](docs/spaceviewer-2026-vision-and-upgrade-plan.md) — full audit and phased upgrade plan
- [docs/spaceviewer-upgrade-plan.md](docs/spaceviewer-upgrade-plan.md) — earlier iteration log
