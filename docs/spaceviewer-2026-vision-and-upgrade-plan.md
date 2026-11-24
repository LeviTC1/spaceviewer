# SpaceViewer — Vision & Ultra-Comprehensive Upgrade Plan (2026)

Status: **PLAN ONLY — no code changed.** This document is the output of a full read-only audit of the codebase (frontend + backend), cross-checked against the existing `docs/spaceviewer-upgrade-plan.md`. Nothing here should be implemented until it's prioritized and approved.

---

## 1. Executive Summary

SpaceViewer is **not a prototype that needs a redesign — it's a genuinely capable app that needs consolidation, honesty, and a few big swings.** Three of its five surfaces (Solar Explorer, SkyMap, Gallery/Viewer) are already better-engineered than most portfolio projects: real VSOP87C planetary ephemeris, a clean Redux-style reducer architecture in SkyMap, real multi-source astronomy search (NASA/SDSS/Pan-STARRS) with per-source health reporting, and genuine image-inspection tooling (zoom/fit/exposure histogram/annotations).

The problems are not "it looks unfinished." They are:

1. **Dishonest labeling.** Everything under `frontend/src/ai/*` and the backend's `/api/analyze` route is branded "AI" but is 100% deterministic string templates and (in the case of `/api/analyze`) literally seeded-random circles with no relationship to the image. This isn't a bug, it's a credibility risk the moment someone technical looks closely — and it's also wasted potential, because the scaffolding for a *real* AI layer (context building, provenance/confidence display, beginner/scientific modes) already exists and just needs a real model behind it.
2. **No true-scale mode.** Both "Showcase" (log-scale) and "Educational" (sqrt-scale) solar distance modes are artistic compressions. There is no mode that shows genuine relative scale — a canonical "wow, space is this empty" moment is currently unavailable.
3. **Component monoliths and CSS sprawl.** `ViewerPage.tsx` (1,812 lines), `SkyMapPanels.tsx` (1,750), `SolarSystemPage.tsx` (1,294), `HomePage.tsx` (1,264), `App.tsx` (1,221) each mix multiple concerns. CSS is 11,548 lines across 3 files with no component-scoped styling and only a 46-line token file.
4. **No persistence layer beyond localStorage.** Collections, annotations, bookmarks, sessions all vanish on a cleared cache or a new device. Nothing here blocks a demo, but it blocks "serious educational product."
5. **Zero process scaffolding.** No README, no `.env.example`, no CI, no lint config. Fine for a solo project, a real gap for anything shown publicly as portfolio work.
6. **The first-viewport / "wow moment" is not yet decisive.** Home is a search-first page; the 3D Solar system — the single most impressive thing in the codebase — is one click away rather than the thing a visitor sees in the first two seconds.

None of this requires a rewrite. The recommendation in this document is **consolidate and polish the existing three engines (Solar, SkyMap, Gallery/Viewer), fix the honesty problem in "AI," give the app a real design system pass, and make Solar Explorer the entry experience** — before adding any large new feature surface.

---

## 2. Codebase Audit

### 2.1 Stack & Structure

- **Frontend**: Vite 5 + React 18 + TypeScript, `react-three-fiber` 8 / `drei` 9 / `three` 0.182, `vsop87` npm package for real ephemeris. No UI framework (no MUI/Chakra/Tailwind) — all custom CSS.
- **Backend**: Express + TypeScript, proxies NASA Image Library, MAST (name→coordinate resolution), Pan-STARRS (cutouts), SDSS (cutout URLs). In-memory cache only (NASA: 5 min search / 60 min asset TTL; MAST/Pan-STARRS: uncached).
- **Routing**: Custom `pathname` + `window.history.pushState` router in [App.tsx](frontend/src/App.tsx) — no `react-router`. Works, but `App.tsx` is 1,221 lines because routing, discovery-session logic, command-palette item construction, and viewer-snapshot persistence all live in one component.
- **Five real surfaces**: Home, Gallery (`ResultsPage`), Viewer, Solar Explorer, SkyMap. Solar and SkyMap are route-level lazy-loaded (`React.lazy`) with Three/R3F isolated into a `three-vendor` chunk in [vite.config.ts](frontend/vite.config.ts) — this is already correct, modern practice.
- **No dead subsystems.** `frontend/src/features/starmap/*` looked like it might duplicate `skymap/*` — it does not. It's a genuinely shared library (`StarField` shader component, `useNearbyStars`, `useStarLOD`) consumed by *both* Solar Explorer and SkyMap. Keep it as-is; if anything, promote it to `frontend/src/shared/starfield/` to make the reuse explicit.
- **`GuidedExperience.tsx`** ([components/experience/GuidedExperience.tsx](frontend/src/components/experience/GuidedExperience.tsx)) is real, shared, generic tour infrastructure (intro overlay, step panel, presentation HUD) used by both Solar's 6-step "grand tour" and SkyMap's tour. Not dead code — but currently only one tour exists per surface. This is the natural hook for the "guided tours" educational feature (see §4).

### 2.2 What's genuinely strong (keep, extend, don't replace)

| Area | Evidence | Why it matters |
|---|---|---|
| Planetary ephemeris | [vsopSolver.ts](frontend/src/domain/solar/vsop87/vsopSolver.ts) wraps the real `vsop87` package for 8 planets (VSOP87C, heliocentric ecliptic); Pluto falls back to a proper Newton-Raphson Keplerian solver in [solarEphemeris.ts:25-38](frontend/src/domain/solar/solarEphemeris.ts) | This is genuine astronomy, not a toy. Most "space visualizer" demo projects fake this. Market it. |
| SkyMap architecture | Reducer + action types in [state.ts](frontend/src/features/skymap/core/state.ts), layer registry in [layers.ts](frontend/src/features/skymap/core/layers.ts), weighted multi-field object search in [objectRegistry.ts](frontend/src/features/skymap/core/objectRegistry.ts) | Clean, testable, extensible. This is the pattern the rest of the app should be pulled toward. |
| Multi-source search resilience | [searchRoute.ts](backend/src/routes/searchRoute.ts) aggregates NASA/SDSS/Pan-STARRS with per-source `loaded/partial/unavailable/error` status, timeouts (10-12s), partial-failure tolerance | Real backend engineering most portfolio pieces skip entirely. |
| Gallery data quality | [galleryResults.ts](frontend/src/utils/galleryResults.ts) — dedupe by normalized title+year, dynamic timeline bounds from actual result dates, metadata quality scoring — all unit tested in `galleryResults.test.ts` | Genuinely useful triage tooling, not surface polish. |
| Viewer inspection tools | Real zoom/pan/fit modes, before/after filter comparison, canvas-based exposure histogram, keyboard shortcuts registry, in `ViewerPage.tsx` | Rare feature set for this kind of app; worth keeping and extracting into smaller components rather than rebuilding. |
| Asteroid belt LOD | [useAsteroidLOD.ts](frontend/src/features/solar/asteroids/useAsteroidLOD.ts) scales instanced count 120→5000 by camera distance, `frameloop="demand"` throughout Solar/SkyMap canvases | Correct, modern r3f performance pattern already in place. |
| WebGL lifecycle | [WebGLCanvasLifecycle.tsx](frontend/src/lib/rendering/WebGLCanvasLifecycle.tsx) — context-loss listeners, renderList/gl.info reset on unmount | Solves a real, common r3f bug class (memory growth across route changes) that most similar apps never address. |

### 2.3 What's weak, confusing, or actively misleading

| Issue | Evidence | Severity |
|---|---|---|
| "AI" is 100% templated, no model calls | Zero `fetch`/`axios` calls anywhere in `frontend/src/ai/*` (`generateSummary.ts`, `generateAnalysis.ts`, `classifyObjectType.ts`, `estimateRarity.ts`, `explanationProvenance.ts`, etc.) — confirmed by direct read | **High.** Naming is misleading to any technical reviewer. The provenance card *does* honestly disclose "no remote model call is made here" ([explanationProvenance.ts](frontend/src/ai/explanationProvenance.ts)) — good instinct, undercut by the module names and UI copy calling it "AI" elsewhere. |
| `/api/analyze` fabricates "detected objects" | [analyzeRoute.ts](backend/src/routes/analyzeRoute.ts): `createSeededRandom(id)` generates 3-8 circles with random x/y/radius — **no pixel data, no image analysis, purely a hash of the ID string** | **High.** This is the one place the honesty problem becomes a real defect: a user sees "4 objects detected" and "highlighted regions" that have zero relationship to the actual image content. |
| No true-scale distance mode | [solarScale.ts](frontend/src/features/solar/solarScale.ts): `showcase` = `log(au+1)*22`, `educational` = `sqrt(au)*18` — both are non-linear compressions, confirmed by direct read | **Medium.** Every "solar system" app promises the "wow, it's mostly empty" scale moment — SpaceViewer's architecture (already has two scale modes, an ecliptic map view, camera bookmarking) is one clean addition away from delivering it, but doesn't yet. |
| Component monoliths | `ViewerPage.tsx` 1,812 lines, `SkyMapPanels.tsx` 1,750, `SolarSystemPage.tsx` 1,294, `HomePage.tsx` 1,264, `App.tsx` 1,221, `SolarScene.tsx` 1,036 | **Medium.** Not bugs, but every future feature touching these files pays a growing tax. |
| CSS sprawl | `globals.css` 8,059 lines + `linear-overrides.css` 3,443 lines + `theme.css` 46 lines = 11,548 total; only `theme.css` has real design tokens | **Medium.** `linear-overrides.css`'s name is a smell on its own — worth confirming it isn't literally copy-pasted third-party override CSS with unclear scoping, and renaming/refactoring regardless. |
| localStorage-only persistence | Annotations (`spaceviewer.annotations.*`), working collections, camera bookmarks, discovery sessions, SkyMap notes — all client-only | **Medium.** Acceptable for a demo; blocks "serious educational product" (no cross-device continuity, no teacher/student sharing). |
| Hardcoded SDSS/Pan-STARRS metadata | [mapSearchItem.ts](frontend/src/utils/mapSearchItem.ts) hardcodes `640×640, 0.3 arcsec/pixel` for every SDSS result and `640×640px` for every Pan-STARRS result regardless of the actual cutout | **Low-medium.** Silently wrong metadata is worse than missing metadata — it looks authoritative. |
| Hardcoded single YouTube video ID for "NASA Live" | [HomePage.tsx:99-100](frontend/src/components/home/HomePage.tsx) hardcodes one `youtube.com/embed/<id>` rather than NASA's persistent live channel | **Low.** Will silently go stale (video ends/unlists) with no visible failure. Should point at NASA's official 24/7 live channel ID, which doesn't rotate. |
| Search scoring remains surface-specific | CommandPalette now has deterministic exact/prefix/alias ranking and keeps archive search last; SolarSearch and SkyMap still retain their own scorers | **Low.** The largest keyboard-navigation failure is fixed, but a later shared scoring primitive would reduce maintenance drift. |
| No error boundary anywhere | Confirmed absent across `App.tsx` and all page components | **Medium.** A single render error in any mode currently white-screens the whole app. |
| No CI, no lint config, no README, no `.env.example` | Confirmed absent by direct filesystem check | **Medium for portfolio use.** Immediate, cheap fix; visibly professionalizes the repo. |
| Solar Explorer astronomy gaps | Confirmed: no Uranus ring texture (Saturn has one), no comets, no dwarf planets besides Pluto, no Lagrange points, no spacecraft — all explicitly flagged by a `// TODO: Phase 2 hooks` comment in `SolarSystemPage.tsx` | **Low-medium**, expected roadmap, not a defect. |
| Thin test coverage on 3D logic | Only `solarPanelState.test.ts` (73 lines) and `loadSolarTextureAsset.test.ts` (63 lines) cover Solar's 30+ files; SkyMap's reducer is well tested (`state.test.ts`), Gallery utils are well tested (`galleryResults.test.ts`) | **Medium.** Ephemeris math, camera-focus logic, and scale conversions have zero regression protection. |

### 2.4 What should be removed or consolidated (and why)

- **Nothing should be deleted outright.** There is no genuinely dead code — every subsystem, including `starmap/*` and `GuidedExperience.tsx`, is real and in use.
- **Consolidate, don't remove**: the "AI" module naming and the `/api/analyze` route need to be either (a) replaced with a real, clearly-labeled LLM integration, or (b) honestly relabeled as "Auto-generated summary" / retire the fake "detected objects" feature entirely rather than keep faking it. Recommendation: **retire `/api/analyze` and its "highlighted regions" UI as currently implemented** (§13) — faked object detection has more downside (credibility) than upside (a few animated circles), and its removal is a quick win. The deterministic summary/rarity/classification logic in `frontend/src/ai/*` should stay, but be renamed out of the `ai/` namespace (e.g. `frontend/src/insights/` or `frontend/src/narrative/`) and clearly labeled "Deterministic" in the UI, while a genuinely optional, clearly-labeled LLM-backed narration becomes the "AI" feature (§12, Big Swing #1).
- **Rename `linear-overrides.css`** — audit its actual contents during Phase 2 and fold genuinely-used rules into a proper design-system file; anything unused gets deleted.

---

## 3. Product Vision

**What SpaceViewer should become**: the app that makes someone stop scrolling because a real solar system materializes on load, then rewards them for staying with genuine astronomy (VSOP87 ephemeris, real star catalogs, real NASA imagery) instead of the shallow "spinning sphere" demos that dominate this space online.

- **Target audience**: (1) space/astronomy enthusiasts and students (GCSE/A-level-ish curiosity level, not professional astronomers), (2) recruiters/clients evaluating Peak Web Studio's frontend and 3D capability, (3) social-media viewers who need a 10-second "whoa" clip.
- **Core experience**: land directly in a living, navigable solar system; search or click to go deeper (planet detail, moon system, deep-sky object, real NASA imagery); every object explains itself in plain language with an honest note about how certain the app is.
- **Educational purpose**: teach real orbital mechanics, scale, and the actual composition of the solar system and nearby universe — not through walls of text, but through direct manipulation (fly to Jupiter, watch its moons orbit, toggle real vs compressed scale and feel the difference).
- **Demo/portfolio value**: a single unbroken 20-second screen capture — Home → Solar Explorer flythrough → planet focus → SkyMap galaxy jump → NASA image in Viewer — should be possible with zero jank, zero loading spinners longer than a second, and no dead ends. This capture is the actual deliverable of Phase 7 (§9).
- **What makes it different from a normal space website**: it isn't a gallery of pictures with captions (that's every NASA-image mirror site) and it isn't a toy 3D orbit simulator (that's every three.js tutorial demo). It's the two combined with real search, real multi-archive data, and honest AI-adjacent tooling.
- **The "wow moment"**: camera pulls back from a close Sun shot, the inner planets sweep into view with real relative motion, then a single click on Saturn triggers a smooth camera flight that ends with the rings filling the frame — all within the first 10 seconds, no login, no loading screen longer than the flight itself.

---

## 4. Feature Plan

Every feature below states **current status** (from the audit) before recommending action, per the "don't propose features without checking what exists" rule.

### 4.1 Core space exploration

| Feature | Current status | Recommendation |
|---|---|---|
| Solar system explorer | **Exists, strong.** VSOP87C, 6-panel dock, camera bookmarks, 2 scale modes | Polish only (see §5); no rebuild |
| Planet detail views | **Exists.** `SolarDetailsPanel.tsx` shows orbital stats, image, moons | Add: axial tilt indicator, day-length, real photograph inset from NASA Gallery (cross-link, see §4.4) |
| Moons | **Exists.** 30 moons, circular-orbit approximation, honestly documented | Add labeled accuracy disclosure inline (not just in code comments) — "circular approximation" badge on moon detail panel |
| Orbits | **Exists.** `OrbitRing.tsx` — inclination, apsides, direction markers | Keep as-is |
| Asteroid belt | **Exists.** Instanced LOD, 120-5000 | Add Kuiper Belt as a second, sparser instanced field (natural SkyMap/Solar bridge point) |
| Comets | **Implemented (2026-09-02).** Five canonical comets use receipted JPL SBDB osculating elements, direct routes/search/focus and an explicitly presentation-only anti-solar tail heuristic | Next fidelity step is bounded Horizons state-vector windows, not a stronger claim for the current two-body propagation |
| Dwarf planets | **Implemented (2026-09-02).** Ceres, Haumea, Eris and Makemake join Pluto with JPL SBDB orbit receipts and NASA/JPL size provenance | Add controlled shape/attitude assets only when separately sourced; do not promote colour glyphs into texture claims |
| Scale mode | **Implemented.** Cinematic/logarithmic, educational/square-root and linear True AU modes have visible disclosures and scale-aware camera envelopes | Keep the distinction explicit |
| Realistic vs compressed distance mode | **Implemented.** All three mappings operate downstream of scientific AU coordinates | Keep |
| Timeline/simulation controls | **Exists, solid.** Play/pause, 1x/10x/100x, date picker, 2025-2050 range | Extend date range further back/forward now that ephemeris supports it (VSOP87 is valid over centuries) |
| Object search | **Exists across three surfaces.** CommandPalette now ranks exact/prefix/alias targets before Gallery fallback; SolarSearch and SkyMap use separate scored implementations | Later unify the scoring primitive without coupling the app shell to progressively streamed catalogue payloads |
| Object comparison | **Missing** (Gallery has image compare-tray; no Solar/SkyMap object comparison) | New: side-by-side planet/moon comparison card (size, distance, day length, moons, temperature) — natural fit for the existing `SolarDetailsPanel` |

### 4.2 Educational features

| Feature | Current status | Recommendation |
|---|---|---|
| Guided tours | **Exists, 1 tour each for Solar/SkyMap** via shared `GuidedExperience.tsx` | Add 3-4 more short (4-6 step) tours per surface: "Rocky vs Gas Giants," "How big is the Moon really," "A galaxy's worth of stars," "Follow a comet" |
| GCSE/A-level explanations | **Missing as a distinct layer** — text exists but isn't pitched at a curriculum level | New: "Concept Cards" (see below) pitched explicitly at GCSE/A-level framing, written by hand (not generated), reviewed for accuracy |
| Concept cards | **Missing** | New: short (~150 word), hand-written, illustrated cards for gravity, orbital mechanics, the electromagnetic spectrum (relevant since JWST/Hubble results dominate Gallery), stellar classification (relevant since SkyMap already has real spectral types), planet formation, star lifecycle. Triggered contextually (e.g. viewing Jupiter offers a "why is it a gas giant" card) |
| Gravity/orbital mechanics explanation | **Missing as content**, though the engine demonstrates it live | Pair a concept card with the *live* scene — e.g., a toggleable "show gravity well" visual overlay in Solar Explorer using the orbits already rendered |
| Atmosphere/composition explanation | **Missing** | Concept card per planet, sourced from a small hand-authored JSON (not AI-generated, to avoid factual risk) |
| Planet formation / star lifecycle content | **Missing** | Concept cards, illustrated with existing texture assets where possible |
| Quiz/challenge mode | **Missing** | New, lower priority: "Guess the planet from its stats" mini-game using existing `solarData.ts`/`moonData.ts` — good social-share bait, cheap to build |
| "Did you know?" facts | **Partially exists** — `planet.facts` arrays already populate command-palette keywords | Surface these facts directly in the UI (they currently exist only as search metadata, never rendered to the user — a real quick win, see §11) |
| Glossary | **Missing** | New: single searchable glossary page/panel, links from Concept Cards and object detail panels |

### 4.3 Interactive/visual features

| Feature | Current status | Recommendation |
|---|---|---|
| 3D scene improvements | **Already strong.** Uranus rings, comet tails and True AU mode are implemented with explicit scientific/presentation boundaries | Continue only with source-controlled shape, atmosphere or state upgrades |
| Camera controls | **Exists, smooth** — smoothstep easing, tracking, bookmarks | Keep; add cinematic "fly-to" easing curve option for demo/social capture mode |
| Smooth object transitions | **Exists** | Keep |
| Labels | **Exists** (orbit labels, SkyMap object labels) | Add optional "always-on" label density toggle for demo recording |
| Tooltips | **Partial** — some panels have them, inconsistent | Standardize via the new shared Tooltip primitive (§9) |
| Object focus mode | **Exists** | Keep |
| Orbit trails | **Exists** for the selected planet | Extend to any tracked object (moons already have OrbitRing, add trail parity) |
| Day/night shaders | **Exists for Earth** (custom ShaderMaterial night-lights blend) | Extend the same shader pattern to Mars (polar ice caps) as a second showcase example |
| Atmosphere effects | **Exists** (per-planet atmosphere sphere with irradiance-driven opacity) | Keep |
| Rings for Saturn/Uranus | **Implemented.** Both use sourced radial systems and finite-Sun two-way ring shadowing | Keep receipts and visual/scientific separation intact |
| Lighting improvements | **Exists, good** (distance-based emissive/corona tuning) | Keep |
| Scale toggles | **Exists (2 modes)** | Add 3rd true-scale mode (see 4.1) |
| Mini-map/solar system strip | **SkyMap has an orientation inset; Solar does not** | Add a compact orbit-position mini-map to Solar Explorer (reuse SkyMap's orientation-inset pattern) |
| Screenshot/share mode | **Missing** | New: a "Capture" button that hides all panels, takes a canvas snapshot via `renderer.domElement.toDataURL()`, and offers direct download — cheap, high social value |
| Cinematic demo mode | **Missing as a single feature**, though tours + presentation mode are close | New: chain the existing guided-tour engine with the panel-hide ("Clean map") state to create one-click "Cinematic Mode" (see §12) |
| Social media capture mode | **Missing** | Pairs with Capture (above): a fixed 9:16 or 1:1 crop-safe camera framing option for Reels/TikTok/Shorts |

### 4.4 Data/features

| Feature | Current status | Recommendation |
|---|---|---|
| NASA APOD integration | **Missing** | New: small Home-page "Astronomy Picture of the Day" card via NASA's public, keyless APOD API — cheap, high content-freshness value, fits the existing backend proxy pattern |
| Near-Earth object data | **Missing** | New (later phase): NASA NeoWs API (keyless-friendly with demo key) for a simple "asteroids passing this week" list, cross-linked to the Solar asteroid belt view |
| Current moon phase | **Missing**, though the Moon is already fully ephemeris-driven | New: cheap — derive phase from the existing Sun-Earth-Moon geometry already computed for rendering; show as a small Home-page badge |
| Mars rover imagery | **Missing** | New (later phase): NASA Mars Rover Photos API — natural Gallery filter addition |
| Exoplanet catalogue mode | **Missing**, SkyMap's deep-space catalog is currently only 23 objects | Defer — real exoplanet data (NASA Exoplanet Archive) is large and would need real work to place credibly on SkyMap's "staged" scale; flag as a Big Swing, not a quick add |
| Space missions timeline | **Missing** | New (later phase): simple hand-curated timeline (Sputnik → Voyager → JWST → Artemis), cross-linked from relevant planet/moon detail panels |
| Telescope/image gallery | **Exists** — this is the current Gallery/Viewer mode | No new work; this is already the strongest data-driven surface |
| ISS tracker | **Missing** | New (later phase, needs a live-position API); genuinely fun but is the one feature that requires reliable third-party uptime — treat as nice-to-have |
| Meteor shower calendar | **Missing** | New (later phase): hand-curated static calendar (doesn't need an API — meteor shower dates are fixed annually), cross-link to a "look this direction" SkyMap camera preset |

### 4.5 Portfolio/business features

| Feature | Current status | Recommendation |
|---|---|---|
| Demo mode for recordings | **Missing as a single toggle**, though "Clean map" already exists per-surface | New: a single global "Demo Mode" (hide all UI chrome, disable analytics/telemetry noise, force high texture quality) accessible via a hidden command-palette action, not a visible button (keeps the public app uncluttered) |
| "Labs" feel | Already present in tone (Mission Control panel, diagnostics overlay) | Keep leaning into it — it's a genuine differentiator |
| Case-study-ready visuals | Currently blocked by CSS/UI polish, not missing features | Addressed by §5 (UI/UX plan) |
| Lightweight educational landing copy | **Home is already functional-first, not marketing-first** — correctly, per the brief's priority #4 | Do not add a marketing splash. If any framing copy is added, it goes in a single line under the search bar, not a hero section |
| Peak Web Studio portfolio polish | N/A | Add a minimal, tasteful "Built by Peak Web Studio" credit in the footer/about — not a redesign |

---

## 5. UI/UX Plan

### 5.1 Visual design direction

Avoid: purple/blue SaaS gradients, glassmorphism-for-its-own-sake, generic "space" clipart starfields.
Aim for: an actual **observatory instrument panel** aesthetic — the existing `theme.css` tokens (`--sv-bg: #03060d`, cyan accent `#69e6ff`, warm amber `#ffb35c`) already point the right direction (deep near-black backgrounds, cool accent, warm secondary). The mode-based accent-color system (cyan=Home, violet=Gallery/Viewer, amber=Solar, blue-green=SkyMap, per the existing plan doc) is a good idea — **keep it, but audit that it's actually applied consistently** (verify during Phase 2, since the CSS file size suggests drift is likely).

Concretely:
- Keep dark backgrounds (`--sv-bg`) as non-negotiable — space apps should never default to light mode.
- Typography: keep Sora (already loaded via Google Fonts in `index.html`) for UI chrome; consider a monospace accent font (e.g., JetBrains Mono, already common in "instrument panel" UIs) for numeric readouts (distances, dates, coordinates) to reinforce the "real instrument" feel — small change, big tonal shift.
- Panels: standardize the glass-panel look (`--sv-space-glass`, `--sv-shadow-panel` already exist as tokens) into one `.sv-panel` base class, then have every panel component in Solar/SkyMap/Viewer extend it instead of hand-rolling similar CSS (this is the actual fix for the CSS sprawl — not deleting styles, but converging on tokens that already exist but aren't consistently used).

### 5.2 Layout & navigation

- Keep the existing 5-mode structure (Home/Gallery/Viewer/Solar/SkyMap) and the mode-aware status band — it's a good pattern per the existing plan doc, just needs verification it survived component growth.
- **Make Solar Explorer the default landing view** instead of Home's search-first layout (see Product Vision §3) — Home's search/discovery functionality moves to a persistent top bar accessible from every mode (it partially already is, via the command palette), not a separate landing page users must navigate away from.
- Add a lightweight onboarding strip on first visit only (localStorage-flagged, dismissible, never shown again) pointing at the 3-4 key actions (search, tour, scale toggle, mode switch) — this replaces the need for a heavier tutorial.

### 5.3 Responsive/mobile

Existing responsive work (per audit and existing plan doc) is real — desktop/mobile panel defaults differ correctly in Solar's `solarPanelState.ts`, and phone-width smoke checks exist. Continue this pattern for any new panel (Concept Cards, Comparison view, Capture mode) — every new panel must ship with an explicit mobile default from day one, not retrofitted later.

### 5.4 Loading/empty/error states

- **Add a top-level React Error Boundary** around each of the 5 routed surfaces (currently absent everywhere) — this is a correctness fix, not a design one, but it's a UX issue: right now a render error white-screens the whole app with no recovery path.
- Loading states already exist (`WorkspaceLoader` in `App.tsx`, Solar's texture-load progress) — extend the same visual language to the new APOD card and Concept Cards rather than inventing new spinners.
- Empty states: Gallery already shows per-source status; extend the same "loaded/partial/unavailable" chip pattern to any new data feature (APOD, NEO) rather than a generic "no data" message.

### 5.5 Accessibility & motion

- `theme.css` already defines motion-easing tokens (`--sv-ease-out`, `--sv-motion-fast/medium/slow`) — good foundation. Add a genuine `prefers-reduced-motion` media query that disables the parallax/nebula-drift background animations (currently claimed as existing per the old plan doc but not verified in this audit — **verify and fix in Phase 1**).
- Keyboard: Viewer's shortcut registry and SkyMap's arrow-key search navigation are both real and good; extend the same rigor to Solar's panel dock (currently mouse-first).

---

## 6. Technical Architecture Plan

### 6.1 Component structure (target, not a rewrite)

- Split `ViewerPage.tsx` (1,812 lines) into: `ViewerCanvas` (zoom/pan/fit), `ViewerAnnotations` (CRUD), `ViewerExposure` (histogram), `ViewerShortcuts` (keyboard overlay + help panel), `ViewerCompareRail`. `ViewerPage` becomes an orchestration shell, mirroring the pattern `SolarSystemPage` already uses well.
- Extract `App.tsx`'s discovery-session logic (~500 lines: `buildDiscoveryBatch`, `createDiscoverySession`, `extendDiscoverySession`, source-health aggregation) into a `useDiscoverySession()` hook in `frontend/src/hooks/`.
- Extract `App.tsx`'s command-palette item construction (~200 lines) into `frontend/src/utils/buildCommandItems.ts`, pure and independently testable.
- Split `HomePage.tsx` similarly: `HomeSearchTab`, `HomeDiscoverTab`, `HomeForYouTab`, `HomeLiveFeedCard` as separate components under a thin `HomePage` shell.
- Promote `frontend/src/features/starmap/` → `frontend/src/shared/starfield/` to make its cross-surface reuse explicit in the file tree, not just in imports.

### 6.2 Shared search scoring

Extract SkyMap's weighted match scoring (`objectRegistry.ts`) into `frontend/src/shared/search/scoreMatch.ts`. Reuse it in: `CommandPalette`, `SolarSearch`, and (new) SkyMap object search — currently three separate, inconsistent implementations of "search these things by name."

### 6.3 Data structures / types

Keep `SpaceImage`, `DiscoverySession`, `SourceStatus`, `ObservationCollection` as the canonical frontend models (already well-typed). Add, without disturbing existing types:

```ts
// frontend/src/models/ConceptCard.ts
interface ConceptCard {
  id: string;
  title: string;
  level: "gcse" | "a-level";
  body: string;           // hand-authored, ~150 words
  relatedObjectIds: string[]; // links into Solar/SkyMap object ids
  sources?: string[];      // citation for factual claims
}

// frontend/src/models/ComparisonSet.ts
interface ComparisonSlot {
  kind: "planet" | "moon";
  id: string;
}
interface ComparisonSet {
  slots: ComparisonSlot[]; // 2-4
}
```

Both are additive — no migration of existing models required.

### 6.4 3D scene architecture

No structural change recommended. `SolarSystemPage` (orchestration) → `SolarScene` (r3f Canvas) → `PlanetMesh`/`MoonMesh`/`OrbitRing`/`AsteroidBelt` (leaf renderers) is a correct, already-good layered architecture. New bodies (comets, dwarf planets, Uranus rings) slot into the existing `PlanetMesh`/orbit pattern without new architecture.

### 6.5 State management

Current per-page `useState`/`useReducer` (SkyMap already uses a reducer; Solar/App use many `useState`s) is adequate at the current scale. **Do not introduce Redux/Zustand globally** — the audit found no evidence prop-drilling is currently a real pain point outside `App.tsx`, and that's addressed by the extraction in §6.1, not a state-library migration. Revisit only if a 6th major surface is added later.

### 6.6 Routing

Current custom router is adequate and lightweight. **Do not migrate to react-router yet** — it would be a pure refactor with no user-facing benefit at 5 routes. Revisit if a settings/profile/auth surface is ever added (would be the natural trigger for a real router).

### 6.7 Asset management

Texture catalog (`textureCatalog.ts`) already separates `high`/`perf` tiers correctly — extend the same pattern for any new textures (comets, dwarf planets, Uranus rings) rather than inventing a new loader.

### 6.8 Error handling

Add the missing per-surface Error Boundary (§5.4) — this is the one true architectural gap. Pattern: a single `frontend/src/components/layout/SurfaceErrorBoundary.tsx` wrapping each of the 5 `Suspense` boundaries already in `App.tsx`.

### 6.9 Caching

Backend: extend the existing in-memory TTL cache pattern (`jwstApi.ts`) to MAST and Pan-STARRS requests, which currently have none — cheap, consistent, no new infrastructure. Do **not** introduce Redis/a database for caching at this stage; in-memory is fine for a single-instance deploy and the demo/portfolio use case.

### 6.10 Testing approach

- Keep the existing pattern: Vitest for pure utilities/reducers (already good coverage on `galleryResults`, SkyMap `state`), Playwright smoke checks for routes (`smoke-check.mjs`).
- **Add regression tests for Solar's math**: `solarScale.ts` (scale conversions), `solarEphemeris.ts` Keplerian solver, `moonMath.ts` — currently completely untested, and these are the modules most likely to silently break when adding comets/dwarf planets.
- Add one Playwright smoke check per new feature surface (Concept Cards open/close, Comparison view populate/clear, Capture mode produces a non-empty image) — matches the existing smoke-test discipline already in place.

---

## 7. Data/Content Plan

- **Hardcode locally** (small, stable, hand-verified; wrong data here is embarrassing): planet/moon orbital elements (already in `solarData.ts`/`moonData.ts`), Concept Card text, Glossary entries, meteor shower calendar dates, mission timeline entries, comet/dwarf-planet orbital elements.
- **Fetch from API** (large, changes over time, already have a backend proxy pattern to extend): NASA Image Library search (existing), SDSS/Pan-STARRS cutouts (existing), NASA APOD (new, keyless), NASA NeoWs (new, needs free API key — store server-side only, never in frontend bundle), Mars Rover Photos (new, later phase).
- **Schema additions**: `ConceptCard` and `ComparisonSet` per §6.3. Mission timeline as a flat hand-authored JSON array (`{id, year, title, body, relatedObjectIds}[]`) — no need for a new type file, reuse the `ConceptCard`-style shape.
- **Avoiding inaccurate claims**: every hand-authored fact (Concept Cards, mission timeline, dwarf-planet/comet elements) should carry a `sources?: string[]` field even if just for internal review — do not auto-generate factual astronomy copy with an LLM without a human review pass, given the credibility risk already flagged in §2.3.
- **Maintainability**: keep one JSON/TS-const file per content type in a single `frontend/src/content/` directory (new) rather than scattering hand-authored copy across component files, which is the mistake `HomePage.tsx`'s inline `DISCOVERY_BUCKETS` arrays already show early signs of.

---

## 8. Performance Plan

Current state is already good in the areas that matter most (frameloop="demand", texture tiering, instanced asteroid LOD, moon visibility culling, vendor chunk splitting). Remaining work:

- **Bundle size**: `three-vendor` and `vsop87` are already split into separate chunks (`vite.config.ts`). Next step: confirm Concept Cards/Comparison/APOD additions don't get bundled into the initial chunk — lazy-load anything not needed for the first Solar Explorer paint.
- **Texture sizes**: current 9.5MB total across both tiers is reasonable; new comet/dwarf-planet textures should stay within the same per-asset budget (~100-900KB, matching existing `perf`/`high` tier sizes).
- **Device capability detection**: Solar Explorer and SkyMap now share a sustained-frame monitor with tier-specific budgets, a 1.5-second warm-up, minimum three-second sample, suspended-tab rejection and explicit manual override. Continue by using the active tier to gate whether True Scale mode's extended camera-distance range attempts high-detail textures on weak devices.
- **Avoiding layout shift**: audit Concept Cards / Comparison panels to reserve their footprint (fixed min-height) before content loads, consistent with how `WorkspaceLoader` already avoids shift during route-level lazy load.
- **Reducing re-renders**: `App.tsx`'s extraction (§6.1) will incidentally reduce re-render surface, since currently every discovery-session state change re-renders the entire `App` tree including inactive views (mitigated today only by `Suspense`, not by memoization).

---

## 9. Phased Roadmap

Each phase ends in a working, demoable state. No phase should ship half of a feature visibly to users.

### Phase 1 — Audit, Cleanup & Stabilization
- **Goal**: fix the honesty/credibility issues and the one real architectural gap (error boundaries) before any new feature work.
- **Files affected**: `backend/src/routes/analyzeRoute.ts` (retire or clearly relabel), `frontend/src/ai/*` (rename namespace, add "Deterministic" UI labeling), new `SurfaceErrorBoundary.tsx`, add README/`.env.example`/basic CI (`npm run build && npm run test` on push), add ESLint config.
- **Risks**: renaming the `ai/` namespace touches many import sites — mechanical but wide.
- **Acceptance criteria**: no UI copy claims "AI" without either a real model behind it or explicit "Deterministic" labeling; a thrown render error shows a recovery UI instead of a white screen; `npm run build`/`test`/`smoke` all pass in CI on every push.
- **Verification**: manual test of a forced render error in each of the 5 surfaces; grep confirms zero remaining unlabeled "AI"/"detected objects" UI copy.

### Phase 2 — Visual/UI Foundation
- **Goal**: converge CSS onto the existing token system; fix reduced-motion; add shared `Tooltip`/`Panel` primitives.
- **Files affected**: `styles/theme.css` (extend tokens as needed), `styles/globals.css`/`linear-overrides.css` (audit + consolidate, do not blindly delete), new `components/ui/Panel.tsx`, `components/ui/Tooltip.tsx`.
- **Risks**: CSS consolidation risks visual regressions across 5 surfaces — needs screenshot-based smoke coverage before/after.
- **Acceptance criteria**: every panel across Solar/SkyMap/Viewer/Gallery visually derives from the same `.sv-panel` base; `prefers-reduced-motion` genuinely disables background animation (verified in devtools emulation).
- **Verification**: Playwright screenshot diff per surface at desktop + mobile widths.

### Phase 3 — Core Solar System Explorer Polish
- **Goal**: comets, remaining dwarf planets, Uranus rings, True Scale mode, mini-map.
- **Files affected**: `solarData.ts`, `moonData.ts` (new dwarf planet/comet entries), `solarScale.ts` (new true-scale function), `textureCatalog.ts` (Uranus rings), new `SolarMiniMap.tsx`.
- **Risks**: True Scale mode's much larger camera-distance range needs its own performance validation (far more empty space to render, but also far fewer visible objects at once — likely a performance non-issue, but verify).
- **Acceptance criteria**: switching to True Scale visibly and correctly re-frames the camera with an explanatory prompt; Eris/Haumea/Makemake/Ceres and 3-5 comets are selectable, searchable, and orbit correctly; Uranus shows rings.
- **Verification**: `solarScale.test.ts` (new) validates true-scale distance ratios against real AU figures; visual check of comet orbits over a multi-decade time-scrub.

### Phase 4 — Educational Layer
- **Goal**: Concept Cards, Glossary, "Did you know?" surfacing, 3-4 new guided tours per surface, planet comparison view.
- **Files affected**: new `frontend/src/content/conceptCards.ts`, `frontend/src/content/glossary.ts`, new `ConceptCardPanel.tsx`, `ComparisonView.tsx`, extended `SOLAR_TOURS`/SkyMap tour arrays.
- **Risks**: factual accuracy of hand-authored astronomy content — mitigate with a review pass, cite sources internally.
- **Acceptance criteria**: selecting any planet/moon/deep-sky object surfaces at least one relevant Concept Card; existing `planet.facts` data (currently dead-in-UI, only used for search keywords) is rendered somewhere visible; comparison view supports 2-4 objects side by side.
- **Verification**: smoke check per new panel; manual content review checklist.

### Phase 5 — Advanced Interactive Features
- **Goal**: Capture/share mode, Cinematic Demo Mode, quiz mode.
- **Files affected**: new `CaptureButton.tsx` (canvas `toDataURL`), new `DemoModeToggle.tsx` (hidden command-palette action), new `QuizPanel.tsx`.
- **Risks**: `toDataURL()` on a WebGL canvas can be blank if `preserveDrawingBuffer` isn't set on the renderer — verify this r3f/Three config before relying on Capture mode.
- **Acceptance criteria**: Capture produces a correct, panel-free screenshot; Demo Mode hides all chrome and forces high texture quality; a full Cinematic tour can run start-to-finish unattended.
- **Verification**: manual capture test across Solar/SkyMap; timed unattended tour run.

### Phase 6 — Data/API Integrations
- **Goal**: APOD, moon phase badge, NEO list, (stretch) Mars Rover imagery.
- **Files affected**: new `backend/src/services/apodApi.ts`, `neoApi.ts`, new routes, `frontend/src/components/home/ApodCard.tsx`.
- **Risks**: NASA's demo API key has strict rate limits — must register a real (still free) API key server-side before shipping publicly; never expose the key to the frontend bundle.
- **Acceptance criteria**: Home shows today's APOD with correct attribution; a moon-phase badge matches real current phase (cross-check against a known ephemeris source); NEO list renders with graceful empty/error states matching the existing source-status pattern.
- **Verification**: `/api/health` extended to report APOD/NEO cache status, matching existing NASA/MAST/Pan-STARRS diagnostics pattern.

### Phase 7 — Social/Demo Polish
- **Goal**: the "20-second unbroken capture" deliverable from the Product Vision.
- **Files affected**: mostly composition of Phases 3-5's features; possibly new `frontend/src/features/solar/introSequence.ts` for an autoplay opening flythrough.
- **Risks**: none structural — this is a QA/polish pass.
- **Acceptance criteria**: a single screen recording exists showing Home→Solar flythrough→planet focus→SkyMap jump→Gallery/Viewer with zero visible loading delay beyond the intended cinematic camera pans.
- **Verification**: the recording itself is the acceptance artifact.

### Phase 8 — Testing, Performance & Final QA
- **Goal**: close the test-coverage gaps identified in §2.3/§6.10, final performance pass, final accessibility pass.
- **Files affected**: new `solarScale.test.ts`, `solarEphemeris.test.ts`, `moonMath.test.ts`; extended smoke coverage for every Phase 3-6 feature.
- **Risks**: none structural.
- **Acceptance criteria**: every module identified as untested in §2.3 has at least basic regression coverage; Lighthouse/perf pass on both desktop and a mid-tier mobile device profile; full keyboard-navigation pass across all 5 surfaces.
- **Verification**: CI green; manual accessibility pass checklist.

---

## 10. Detailed Task Checklist

Legend: complexity S(mall, <1 day) / M(edium, 1-3 days) / L(arge, 3+ days).

### Phase 1
- [ ] Retire or relabel `/api/analyze` fake object-detection feature — *Why*: active credibility risk. *Complexity*: S. *Depends on*: none. *Files*: `backend/src/routes/analyzeRoute.ts`, `frontend/src/utils/buildAIContext.ts`, `ViewerPage.tsx` (highlight UI). *Acceptance*: no UI shows fabricated "detected objects" data.
- [ ] Rename `frontend/src/ai/*` → `frontend/src/insights/*`, add explicit "Deterministic" badge in Viewer's explanation UI — *Why*: honesty. *Complexity*: M (many import sites). *Depends on*: none. *Files*: all `ai/*.ts`, all importers. *Acceptance*: grep for `from "../ai/"` returns zero results; UI shows a visible "auto-generated, not AI-modeled" label.
- [ ] Add `SurfaceErrorBoundary` around each of the 5 routed views — *Why*: currently a single render error white-screens the app. *Complexity*: S. *Depends on*: none. *Files*: new `components/layout/SurfaceErrorBoundary.tsx`, `App.tsx`. *Acceptance*: forcing a throw in any view shows a recovery UI, not a blank page.
- [ ] Add README.md, `.env.example` (frontend + backend), basic ESLint config — *Why*: portfolio professionalism, zero functional risk. *Complexity*: S. *Files*: root/frontend/backend. *Acceptance*: a new clone can `npm install && npm run dev` following only the README.
- [ ] Add GitHub Actions CI: build + test + smoke on push — *Why*: catches regressions before they reach a demo. *Complexity*: S-M. *Files*: new `.github/workflows/ci.yml`. *Acceptance*: CI green on a clean PR, red on an intentionally broken PR.
- [ ] Fix hardcoded single YouTube "NASA Live" video ID → official persistent live-channel ID — *Why*: currently will silently break when the video ends. *Complexity*: S. *Files*: `HomePage.tsx`. *Acceptance*: embed always shows a currently-live stream.
- [ ] Verify/fix `prefers-reduced-motion` handling — *Why*: claimed in old plan doc, not verified in this audit. *Complexity*: S. *Files*: `globals.css`. *Acceptance*: devtools emulation of reduced-motion visibly disables background animation.

### Phase 2
- [ ] Extract `.sv-panel` base class from repeated panel CSS across Solar/SkyMap/Viewer — *Complexity*: M. *Files*: `globals.css`, all panel components. *Acceptance*: visual regression diff shows no unintended change, panel CSS duplication reduced.
- [ ] Audit and rename/refactor `linear-overrides.css` — *Complexity*: M. *Acceptance*: file renamed to reflect actual content, dead rules removed.
- [ ] Build shared `Tooltip.tsx` and `Panel.tsx` primitives, adopt in at least 2 surfaces as proof — *Complexity*: M. *Acceptance*: at least Solar + Viewer panels use the shared components.
- [ ] Unify search scoring: extract `scoreMatch.ts`, adopt in `CommandPalette` and `SolarSearch` — *Complexity*: M. *Depends on*: none. *Acceptance*: typo-tolerant/fuzzy-ish matching works identically in all three search UIs.

### Phase 3
- [ ] Add Eris, Haumea, Makemake, Ceres as selectable/searchable bodies with real orbital elements — *Complexity*: M. *Files*: `solarData.ts`, texture assets. *Acceptance*: each is focusable, has a detail panel, appears in search.
- [ ] Add 3-5 comets with real elliptical Keplerian elements — *Complexity*: M-L (needs a visual tail effect). *Files*: new `cometData.ts`, `CometMesh.tsx`. *Acceptance*: comets visibly move on elliptical paths correctly synced to the timeline.
- [ ] Add Uranus ring texture + mesh — *Complexity*: S. *Files*: `textureCatalog.ts`, `PlanetMesh.tsx`. *Acceptance*: Uranus renders rings at both texture tiers.
- [ ] Implement True Scale mode — *Complexity*: L. *Files*: `solarScale.ts`, `SolarScene.tsx` camera range, new onboarding prompt. *Acceptance*: `solarScale.test.ts` confirms linear AU-accurate ratios; camera correctly re-frames with explanatory copy.
- [ ] Add Solar mini-map/orientation inset (reuse SkyMap's pattern) — *Complexity*: M. *Files*: new `SolarMiniMap.tsx`. *Acceptance*: shows current camera position relative to the whole system, matches SkyMap's visual language.

### Phase 4
- [ ] Author and integrate Concept Cards (gravity, orbital mechanics, atmosphere, planet formation, star lifecycle, spectral classification) — *Complexity*: L (content-heavy). *Files*: new `content/conceptCards.ts`, `ConceptCardPanel.tsx`. *Acceptance*: each planet/moon/deep-sky object surfaces at least one relevant card.
- [ ] Surface existing `planet.facts`/`moon.facts` in the UI (currently search-only) — *Complexity*: S. *Files*: `SolarDetailsPanel.tsx`. *Acceptance*: facts visibly render on the detail panel.
- [ ] Build Glossary panel — *Complexity*: M. *Files*: new `content/glossary.ts`, `GlossaryPanel.tsx`. *Acceptance*: searchable, linked from Concept Cards.
- [ ] Build object Comparison view (2-4 planets/moons) — *Complexity*: M. *Files*: new `ComparisonView.tsx`, `models/ComparisonSet.ts`. *Acceptance*: side-by-side stats render correctly for any combination.
- [ ] Add 3-4 new guided tours per surface — *Complexity*: M (content + wiring, reuses existing `GuidedExperience.tsx`). *Acceptance*: each tour runs start-to-finish without dead ends.

### Phase 5
- [ ] Capture/screenshot mode — *Complexity*: M. *Files*: new `CaptureButton.tsx`; verify `preserveDrawingBuffer: true` is set on the r3f `Canvas gl` prop in both Solar and SkyMap. *Acceptance*: downloaded image matches on-screen framing, panel-free.
- [ ] Global Demo Mode toggle — *Complexity*: S-M. *Files*: new `DemoModeToggle.tsx`, hidden command-palette entry. *Acceptance*: hides all chrome across all 5 surfaces, forces high texture quality.
- [ ] Quiz/challenge mode — *Complexity*: M. *Files*: new `QuizPanel.tsx`, reuses `solarData.ts`/`moonData.ts`. *Acceptance*: at least 15 question variants, scoring works, shareable result summary.

### Phase 6
- [ ] APOD backend route + Home card — *Complexity*: S-M. *Files*: new `backend/src/services/apodApi.ts`, `ApodCard.tsx`. *Acceptance*: shows today's APOD with correct NASA attribution and a cache TTL matching the existing NASA pattern.
- [ ] Moon phase badge (derived from existing ephemeris) — *Complexity*: S. *Files*: `solarProvider.ts` (expose phase angle), new small badge component. *Acceptance*: phase matches a known real-world reference on a given date.
- [ ] NEO list (backend + panel) — *Complexity*: M. *Files*: new `neoApi.ts`, `NeoPanel.tsx`, cross-linked from asteroid belt view. *Acceptance*: renders this week's close-approach objects with graceful empty state.
- [ ] (Stretch) Mars Rover imagery Gallery filter — *Complexity*: M. *Files*: new backend service, Gallery source-filter extension. *Acceptance*: appears as a 4th source alongside NASA/SDSS/Pan-STARRS with the same health-status pattern.

### Phase 7
- [ ] Build autoplay intro flythrough sequence — *Complexity*: M. *Files*: new `introSequence.ts`. *Acceptance*: runs unattended from page load to a settled overview camera position in under 8 seconds.
- [ ] Produce the 20-second unbroken demo capture — *Complexity*: S (execution, not code). *Acceptance*: the recording itself, zero visible stutter/loading.

### Phase 8
- [ ] `solarScale.test.ts`, `solarEphemeris.test.ts`, `moonMath.test.ts` — *Complexity*: M. *Acceptance*: core math has regression coverage.
- [ ] Full keyboard-navigation pass across all 5 surfaces — *Complexity*: M. *Acceptance*: every interactive control reachable and operable via keyboard alone.
- [ ] Mobile performance pass on a mid-tier physical device profile — *Complexity*: M. *Acceptance*: Solar/SkyMap remain usable, the shared adaptive monitor engages under sustained pressure, and the user can recover or override the result. Pure sampler behavior and phone-width controls are automated; a real-device trace remains outstanding.

---

## 11. Quick Wins

High-impact, low-effort, doable independent of the phased roadmap above:

1. **Surface existing `planet.facts`/`moon.facts` data in the UI** — it's already written and typed, currently only used for command-palette search keywords. Zero new content needed.
2. **Fix the hardcoded single YouTube "NASA Live" video ID** — swap to NASA's persistent live-channel ID.
3. **Add a "Deterministic" / "Auto-generated" badge** to every AI-labeled summary in Viewer — the underlying provenance data already exists (`explanationProvenance.ts`), it's just not surfaced clearly enough in the UI copy.
4. **Retire the fake `/api/analyze` "detected objects" feature** — removes a credibility risk in under a day.
5. **Add README + `.env.example`** — makes the repo look immediately more serious for portfolio review, near-zero risk.
6. **Add Uranus's ring texture** — the asset pipeline already supports it; Saturn's is done, Uranus's is a copy-paste-and-source-a-texture task.
7. **Fix hardcoded SDSS/Pan-STARRS dimensions** — replace the static `640×640` metadata with either real per-cutout dimensions (if retrievable) or an honest "approximate" label instead of a falsely-precise number.
8. **Add a "Capture" screenshot button** to Solar/SkyMap — high social-share value, likely under a day once `preserveDrawingBuffer` is confirmed.
9. **Standardize the `Tooltip` component** and apply it to the densest control clusters (Solar's `SolarTopBar`, SkyMap's filter panel) — makes controls self-explanatory without adding visible clutter.
10. **Add `prefers-reduced-motion` support** if genuinely missing — quick accessibility and battery-life win.
11. **De-duplicate `CommandPalette` vs `SolarSearch` matching logic** — immediately makes typo-tolerance consistent everywhere.
12. **Add a moon-phase badge to Home** — the geometry is already computed for rendering; this is a display-only addition.
13. **Rename `linear-overrides.css`** to something descriptive even before the full CSS audit — removes a confusing artifact name immediately.
14. **Add loading-state parity**: ensure every new/near-term feature (APOD card, Concept Cards) uses the existing `WorkspaceLoader` visual language instead of a new spinner style.
15. **Extend NASA-style backend caching to MAST/Pan-STARRS** — a few lines matching the existing `jwstApi.ts` TTL-cache pattern, meaningfully speeds up repeat searches.
16. **Add a single onboarding strip** (first-visit only, dismissible) highlighting search / tour / scale toggle / mode switch.

---

## 12. Big Swing Features

Ranked by recommended order. These are the features that would make SpaceViewer distinctly stand out rather than merely "solid."

1. **Real, clearly-labeled LLM-backed narration (opt-in "Ask about this")** — *What*: replace/complement the deterministic summary system with an actual model call (a small, cheap model is enough) that answers follow-up questions about a selected object/image, clearly labeled "AI-generated — may be imprecise" (contrast with the deterministic "Auto-generated from metadata" labeling elsewhere). *Why it matters*: turns the existing (honest, well-built) provenance/confidence UI into something that delivers on the "AI" promise the app currently only gestures at. *How hard*: Medium — needs a backend route, a provider choice, cost/rate-limit handling, and careful prompt-grounding in the object's real metadata to avoid hallucination. *Recommended timing*: after Phase 4 (Educational Layer) is solid, since it should complement Concept Cards, not replace the need for hand-verified factual content.

2. **True Scale mode with a scripted "how empty is space" camera sequence** — *What*: covered in Phases 3/7, but the "big swing" version is a fully scripted, unskippable-first-time camera sequence: start at Earth, engage True Scale, watch the other planets shrink to points of light and vanish off-screen as the camera pulls back to Neptune's orbit. *Why it matters*: this is the single most shareable, most "whoa" 10 seconds available in the entire codebase's potential, and it's *free* — no new data, just true numbers instead of compressed ones. *How hard*: Medium (mostly camera choreography, since the ephemeris data and scale infrastructure already exist). *Recommended timing*: high priority, do this before most educational content — it's the demo-video centerpiece.

3. **Exoplanet catalogue integrated into SkyMap's "extragalactic" scale band** — *What*: pull from NASA's Exoplanet Archive, place a curated subset (not all ~5,000+) of famous/notable exoplanets (TRAPPIST-1 system, Proxima b, Kepler-186f) into SkyMap with the same honest "staged, not physically precise" disclaimer already used for the deep-space catalog. *Why it matters*: meaningfully expands SkyMap's current thin catalog (23 objects) with content people specifically search for. *How hard*: Medium-Large — needs careful curation to avoid an overwhelming, low-quality mass import; should stay small and curated like the current deep-space catalog, not exhaustive. *Recommended timing*: after Phase 6 (once the API-integration pattern is proven with APOD/NEO).

4. **Mission/spacecraft trajectory overlays** (the literal `TODO: Phase 2 hooks - spacecraft overlays` already in `SolarSystemPage.tsx`) — *What*: overlay real historical mission trajectories (Voyager 1/2, New Horizons, Cassini) on top of the existing orbit-rendering system. *Why it matters*: directly extends the app's strongest existing asset (real ephemeris-driven 3D) into genuinely new, differentiated content. *How hard*: Large — needs real trajectory data (NASA Horizons can provide this) and a new rendering primitive (path segments rather than closed orbits). *Recommended timing*: defer to a later cycle after the True Scale and Concept Card work; it's high-effort relative to its audience (enthusiasts specifically, not general visitors).

5. **Quiz/challenge mode with shareable results** — *What*: covered in Phase 5, the "big swing" version adds a shareable result card (image export, matching the Capture feature) for social posting. *Why it matters*: genuinely good, cheap social-media bait once Capture mode exists. *How hard*: Small-Medium once Capture mode (Phase 5) ships. *Recommended timing*: bundle directly after Capture mode ships.

**Not recommended to build now**: ISS live tracker (third-party uptime dependency outside the team's control — a demo-breaking risk for a portfolio piece), full backend persistence/accounts (real infra + auth work disproportionate to current audience size), a from-scratch design system rewrite (the existing token system is good — converge on it, don't replace it).

---

## 13. Risks & Tradeoffs

- **Renaming `frontend/src/ai/*` touches many import sites.** Mechanical, low intellectual risk, but easy to introduce a typo/broken import across a wide diff. Mitigate with a single dedicated PR, not bundled with feature work.
- **Retiring `/api/analyze`'s fake "detected objects" removes a feature users may have grown to expect**, even though it's fabricated. Mitigate by replacing the UI slot with something honestly useful (e.g., the existing metadata/provenance card) rather than leaving a visible gap.
- **True Scale mode could be visually underwhelming if the camera choreography is rushed** — "everything is just far apart" only lands as a "wow" if the sequence is well-paced. This is a design/animation risk, not a technical one; budget real iteration time for the camera easing curve, not just the math.
- **CSS consolidation (Phase 2) is the single riskiest refactor in this plan** — 11,548 lines across 3 files with unclear internal boundaries means visual regressions are likely without careful before/after screenshot diffing across all 5 surfaces at multiple breakpoints.
- **Real LLM integration (Big Swing #1) introduces ongoing cost and a new failure mode** (model API downtime/latency) that the rest of the app has deliberately avoided so far (everything else works offline-tolerant with graceful degradation). Must ship with a clear fallback to the existing deterministic summary if the model call fails or times out.
- **Adding NEO/Mars Rover/exoplanet APIs increases backend surface area and API-key management burden** — each needs its own rate-limit awareness and its own entry in the `/api/health` diagnostics pattern; don't add these faster than the existing caching/health-check discipline can keep up with.
- **Content-accuracy risk for hand-authored Concept Cards/Glossary/mission timeline** — astronomy has enough nuance (e.g., "day length" varies by definition for tidally-locked-ish bodies, dwarf-planet classification is genuinely disputed for some bodies) that a factual error here is more damaging to credibility than a missing feature. Budget a real review pass, don't treat content as a checkbox task.
- **Defer, don't build now**: ISS tracker (third-party uptime risk), backend persistence/accounts (disproportionate infra for current scale), ISS/ NEO real-time features generally — anything whose reliability depends on an external service staying up during a live demo is a liability for portfolio use specifically.

---

## 14. Final Recommendation

**Do first (in this order):**
1. Phase 1 in full — the honesty fixes (`/api/analyze`, `ai/` renaming) and error boundaries are the only things in this plan that are actively risky to leave as-is; everything else is upside, this is downside-removal.
2. True Scale mode + its scripted camera sequence (Big Swing #2) — highest ratio of "wow" to effort in the entire plan, and it's built almost entirely on infrastructure that already exists.
3. Phase 2's CSS convergence — do this before adding more UI (Concept Cards, Comparison view, Capture mode) so new components are built on the consolidated system rather than adding to the sprawl.
4. Phase 3's remaining Solar content gaps (dwarf planets, comets, Uranus rings) — cheap, uses existing patterns, closes the most obvious "wait, where's—" gaps a knowledgeable visitor would notice.
5. Phase 4's educational layer, prioritizing surfacing the *already-written* `facts` data before authoring anything new.

**Avoid for now**: backend persistence/accounts, ISS tracker, a from-scratch design system, migrating off the custom router, introducing a global state library. None of these are wrong ideas in the abstract — they're simply disproportionate to the current, correctly-scoped app.

**What the final upgraded SpaceViewer should include**: the existing five real surfaces, polished and consistent; an honestly-labeled AI layer (deterministic-by-default, optional real-model narration as an explicit opt-in); a true-scale solar system mode with a scripted reveal moment; a small, hand-verified educational layer (Concept Cards + Glossary + facts actually shown to users); a one-click Capture/Demo mode for content creation; and the process scaffolding (README, CI, error boundaries) that makes it credible as both a teaching tool and a portfolio centerpiece.

**What "done" looks like**: a first-time visitor sees a living solar system within 2 seconds of load, can search or click to any real NASA image or any planet/moon within 3 clicks from anywhere in the app, gets a genuine "space is this big/this empty" moment via True Scale within their first minute, and — if something goes wrong — sees a recoverable error state instead of a blank screen. A screen recording of that first minute is the actual test of "done," not a checklist.

**Readiness for public demo/social media**: achieved at the end of Phase 7. The specific artifact to produce is the unbroken 20-second capture described in §3 and §9 — that recording, not a feature count, is the real finish line for this plan.
