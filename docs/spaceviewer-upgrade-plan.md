# SpaceViewer Upgrade Plan

## Purpose

SpaceViewer is already a strong observatory-style prototype. The next phase should make it feel like a coherent research workspace rather than several impressive surfaces living beside each other. This plan breaks the work down by mode, with implementation phases and acceptance criteria.

## Current Evidence

- Frontend: Vite React app in `frontend`.
- Backend: Express TypeScript proxy in `backend`.
- Main modes: Home, Gallery, Viewer, Solar Explorer, SkyMap.
- Local dev ports used during audit: frontend `http://127.0.0.1:5174/`, backend `http://127.0.0.1:3001/`.
- Browser audit showed the app renders cleanly with no failed requests.
- Known follow-up signal: switching WebGL-heavy surfaces can log `THREE.WebGLRenderer: Context Lost.` during teardown.
- Automated coverage now includes route smoke checks plus focused frontend utility tests for Gallery result utilities, mapping, filtering, metadata quality, and deterministic AI text helpers.

## Implemented First Pass

- Home discovery sessions and personalization: named random-universe sessions with source mix, search themes, result rationale badges, Home resume controls, Add batch, command-palette session shortcut, Viewer return context, saved observation shortcuts back into Gallery/Viewer, and explainable "because you viewed..." recommendations.
- Home search: grouped autocomplete now separates recent searches, mode jumps, object targets, missions, categories, and source-scoped search actions, with keyboard active-state handling and shared session-memory recent searches.
- Home workspace tabs: Home now exposes a compact active-workspace state rail that makes persisted tab mode, lazy panel status, current source/query, saved collection count, session state, and personalized state visible before entering each panel.
- Gallery quality: near-duplicate cleanup, result search, dynamic timeline bounds, raw-versus-cleaned counts, grid/list view modes, local compare tray for two to four candidate images with Viewer handoff, per-source archive health for loaded, partial, unavailable, and empty search results, metadata quality badges, and a local working collection for saved observation sets that can be resumed from Home.
- Gallery triage: result workspace now includes a research brief summarizing raw versus cleaned records, visible/filter state, timeline range, source status/mix, metadata quality, working collection, and compare readiness, plus removable active-filter chips for quick triage reversal.
- Gallery cards: each observation card now surfaces match rationale, archive id/host, and resolution cues so research provenance is visible before opening Viewer.
- Gallery collections: the working collection tray now shows saved-item visibility, newest/saved-time cues, archive/source identifiers, and source labels before reopening Viewer.
- Gallery internals: dedupe, timeline bounds, source/mission/year options, and combined filter/sort behavior are extracted into pure result utilities with unit coverage.
- Viewer inspection: provenance/citation card, refreshable `/viewer/<image-id>` snapshots, user-created image annotations with labels, local per-image annotation persistence, fit modes, before/after filter comparison, exposure histogram/readout, compact inspection-state rail, compare-set rail for moving through Gallery candidates, shortcut overlay with real keyboard wiring, explanation provenance with confidence/missing-data notes, and normalized metadata quality/match-reason details.
- Cross-app navigation: global command palette for mode jumps, direct searches, current result shortcuts, recent viewed image restoration, saved collection reopening, and hidden-until-search Solar/SkyMap object jumps from anywhere.
- Cross-app UI identity: the app shell now exposes a route-aware mode status band with mode label, workflow description, source/model metadata, and per-mode accent color for Home, Gallery/Viewer, Solar Explorer, and SkyMap.
- Mobile/tablet polish: the shared shell, dense Viewer control rows, Solar controls, and SkyMap layout now have stronger overflow guards for phone-width surfaces.
- Performance architecture: Solar Explorer and SkyMap now load through route-level React lazy boundaries with a shared workspace loader, and Three/React-Three dependencies are isolated into a vendor chunk.
- WebGL lifecycle: Solar Explorer and SkyMap canvases now register shared lifecycle diagnostics, tag active WebGL canvases, reset renderer info, and dispose renderer render lists on unmount.
- Shared controls: first shared segmented-control primitive now backs Home discovery intensity, Gallery grid/list view, and Viewer fit mode toggles.
- Shared controls: first shared select-menu primitive now backs Home source selection, Gallery filters, Solar Explorer control menus, and SkyMap filters/time speed.
- Verification: frontend smoke script added for Home, Gallery, Viewer, Solar Explorer, and SkyMap route checks.
- Verification: frontend unit test script added for data normalization, metadata quality, space-result filtering, and deterministic AI summary/tag helpers.
- Verification: Gallery unit tests now pin near-duplicate cleanup, dynamic timeline bounds, unknown-date handling, source/mission/year option derivation, and combined search/filter/sort behavior.
- Verification: Gallery unit tests now pin Local/SkyMap source label formatting for research summaries.
- Verification: Gallery smoke coverage now checks the research brief on desktop and phone-width working-collection routes, including quality/source and compare-readiness state.
- Verification: Gallery smoke coverage now checks card-level match rationale, archive, source-host, and resolution cues.
- Verification: Gallery smoke coverage now checks working-collection visibility and source/archive cues on desktop and phone-width routes.
- Verification: Gallery smoke coverage now checks bulk `Compare visible` staging into the compare tray and Viewer compare-set handoff.
- Verification: Gallery smoke coverage now checks the active-filter rail by applying a result query, clearing it through the chip itself, and continuing into compare-set handoff.
- Verification: Viewer smoke coverage now checks keyboard shortcuts for help, zoom, annotation mode, and compare-set next/previous navigation.
- Verification: Viewer smoke coverage now checks the inspection-state rail for zoom, filter, and asset state, verifies zoom state updates from keyboard interaction, clears filter presets through the rail, and keeps compare navigation accessible with unique button names.
- Verification: Viewer summary smoke coverage now checks deterministic explanation provenance, confidence, and no-remote-model caveats; unit tests cover rich and sparse explanation provenance.
- Verification: SkyMap smoke coverage now checks object aliases/catalog identity, provenance/model notes, related-object paths, and Solar relation handoff context.
- Verification: Solar smoke coverage now checks event-driven object selection, orbit overlay readouts, selected-orbit scene labels, panel dock shutdown controls, Events-panel toggling, desktop All-panel lane separation, Escape-to-clean behavior, command-jump recovery from clean-map state, persisted compact clean-map reload behavior, visible mobile clean-map recovery, mobile object-details recovery without reopening full Tools or overlapping Mission, mobile Default recovery after command handoff, mobile tool/mission toggles, and the single-canvas boot path.
- Verification: focused Solar browser probes confirm page-level Escape collapses to clean map, Escape inside Solar search preserves visible panels, Default restores the calm Tools-plus-Time panel layout after All, fresh desktop boot starts at `2/6 Default` with the event rail hidden, fresh texture boot reports loaded textures with zero failures, asteroid sweep reuses shared cached Mars/Mercury/Moon texture assets instead of issuing new requests, and no console errors are emitted.
- Verification: Solar smoke coverage now includes three fresh desktop browser contexts and two fresh phone-width contexts that must each render a nonblank canvas, keep the default event rail hidden, load all requested performance textures with zero failures, and make no high-detail texture requests during boot.
- Verification: Solar handoff audit confirms desktop Clean persists through reload with a full-size canvas, phone-width Clean leaves a visible recovery chip, all six overlay panels shut down cleanly, and boot texture diagnostics report zero failures.
- Verification: Solar texture probe now confirms a fresh desktop boot requests performance textures only, makes zero high-detail texture requests, deduplicates shared moon texture loading to one request, routes asteroid texture loading through the same shared cache/diagnostics path, handles a deliberately delayed boot texture through the timeout fallback path, and reports no console errors.
- Verification: Solar panel-state unit coverage now pins calm desktop/mobile defaults, clean/all/custom dock labels, and mobile normalization of saved cluttered panel layouts.
- Verification: Home smoke coverage now checks grouped autocomplete, source-action visibility, arrow-key active suggestion state, active-workspace rail state, a keyboard-selected Home-to-SkyMap object jump, For You rail state, and persisted Home tab restoration after reload.
- Verification: smoke coverage now checks the route-aware shell status on Home, Gallery, Viewer, Solar Explorer, and SkyMap.
- Verification: command-palette entry now keeps a stable accessible label across desktop and phone-width header layouts.
- Verification: smoke coverage now includes a phone-width pass for Home autocomplete, Gallery research brief, Viewer inspection controls, Solar controls/canvas, and SkyMap controls/canvas with horizontal-overflow assertions.
- Verification: frontend build output now confirms the heavy 3D vendor code is split from the primary application chunk.
- Verification: smoke coverage now includes an in-session Solar/Home/SkyMap/Solar route-switch check that asserts WebGL canvas mount/unmount diagnostics and no context-loss events.
- Verification: SkyMap reducer unit tests now pin layer defaults, solo/preset visibility, selection/focus navigation, viewport scale bands, filter reset, and time playback behavior.
- Verification: SkyMap smoke coverage now checks the viewport orientation inset on desktop and phone-width routes.
- Verification: SkyMap smoke coverage now checks the staged scale ruler, scene-unit ticks, and scale interpretation on desktop and phone-width routes.
- Verification: SkyMap smoke coverage now checks the selected-object dossier for deep-space and solar bridge targets.
- Verification: SkyMap smoke coverage now checks the annotation workspace state, creates a Mars-anchored note, verifies the note becomes a selected map object with an anchored-note dossier, reselects it from the note list, deletes it, and confirms cleanup.
- Solar Explorer comprehension: scale/navigation legend, optional event preset rail for today, birthday alignment, Jupiter family, Saturn rings, inner ecliptic map, asteroid-belt sweep, selected-orbit labels for current/perihelion/aphelion/trail context, mission-control orbit overlay readouts, mission-control HUD with live status plus camera/layer controls, desktop diagnostic lanes for All-panel mode, Escape-to-clean map recovery, command/object recovery from clean-map state, phone-width object details recovery without reopening full Tools or colliding with Mission, a compact panel dock for shutting down Solar overlays, collapsed clean-map recovery chip, persisted clean-map panel state, one-click default layout recovery that wins after command handoff, direct scene selections that reveal useful context, texture-load health diagnostics, and development performance diagnostics behind a toggle.
- SkyMap comprehension: compact scale/navigation HUD inside the map frame, active local annotations layer, searchable anchored map notes, annotation workspace summary, per-note object details, route trail history for recent object jumps, solo/saved layer controls, richer object identity/provenance/model details with related-object paths, Solar-body handoff into Solar Explorer with date context, and deep-sky imagery handoff into Viewer/Gallery.
- SkyMap orientation: viewport now includes a compact orientation inset with the active scale band, Solar/local/deep-space trail, live camera distance, and camera mode.
- SkyMap scale clarity: status strip now includes a staged scale ruler with camera marker, major scene-unit ticks, and explicit ephemeris/staged/symbolic scale interpretation.
- SkyMap object details: selected-object panel now opens with a dossier summary, primary catalog id, distance/model/source context, notability chips, grouped focus/Solar handoff actions, and resilient imagery fallback states before the detailed stats.
- Backend resilience: NASA search/image request caching, explicit NASA/MAST/Pan-STARRS request timeouts, partial source-status responses that distinguish no data from upstream errors, and an `/api/health` diagnostics endpoint with source, timeout, and cache status.
- Backend/data normalization: search results now carry source-specific match reasons, and frontend normalization scores metadata quality from archive id, source URL, assets, date, mission/instrument, keywords, and dimensions.
- App polish: favicon added and development console noise reduced.

## Guiding Principles

- Keep SpaceViewer as the first screen, not a marketing page.
- Prioritize real workflows: search, compare, inspect, navigate, save, return.
- Make each mode visually distinct while still belonging to the same product.
- Move repeated logic into small utilities and hooks before large feature growth.
- Add verification as we go: build checks first, browser smoke checks for each upgraded mode.

## Cross-App Foundation

### UX Goals

- Add a global command/search concept that can jump between objects, saved views, saved collections, routes, and modes.
  - Command palette now includes hidden-until-search Solar bodies and SkyMap landmarks so object names route directly into the right workspace.
- Give each mode a stronger color identity:
  - Home and discovery: cyan.
  - Gallery and Viewer: violet.
  - Solar Explorer: amber.
  - SkyMap: blue-green.
  - Implemented in the shared app shell through mode-aware context accent variables and a compact current-workspace status band.
- Convert dense text controls into icon plus tooltip controls where the action is familiar.
- Keep text compact inside panels and preserve the current dense, work-focused personality.
- Improve mobile and tablet behavior for Viewer, Solar Explorer, and SkyMap.
  - Implemented first responsive guard pass for the app shell, Viewer control rows, Solar topbar/tools, and SkyMap panels, with mobile smoke coverage.

### Engineering Goals

- Split the large CSS files into feature-focused modules or at least clearly bounded sections.
- Add shared UI primitives for segmented controls, dropdowns, sliders, toolbar buttons, status chips, and panels.
  - First shared segmented-control primitive is implemented and used in Home, Gallery, and Viewer.
  - First shared select-menu primitive is implemented and used by Home source selection, Gallery filters, Solar Explorer control menus, and SkyMap filters/time speed.
  - First shared status-chip primitive is implemented and used by Home discovery source health, Viewer details/source badges, and SkyMap object dossier context chips.
- Add a smoke test harness for the five primary surfaces.
  - First Playwright smoke harness is implemented as `npm run smoke` in `frontend`; it uses seeded local observations for Gallery/Viewer, live route checks for Solar Explorer and SkyMap, and command-palette object jump checks.
- Add utility tests for search mapping, filtering, dedupe, and AI text helpers.
  - First frontend utility-test pass is implemented for mapping, filtering, metadata quality, Gallery dedupe/date/filter helpers, and deterministic AI text helpers.
- Add better cleanup around WebGL canvases when changing modes.
  - Implemented shared WebGL canvas lifecycle diagnostics and render-list cleanup for Solar Explorer and SkyMap.
- Reduce initial bundle pressure from WebGL-heavy modes.
  - Implemented route-level lazy loading for Solar Explorer and SkyMap plus a shared mode-aware workspace loader.

### Acceptance Criteria

- The app builds successfully after each phase.
- Browser smoke checks pass for Home, Gallery, Viewer, Solar Explorer, and SkyMap.
- Phone-width smoke checks pass for Home, Viewer, Solar Explorer, and SkyMap without page-level horizontal overflow.
- No failed network requests on initial load.
- WebGL mode changes do not create repeated context loss or memory growth in ordinary navigation.

## Home Mode

### Current Strengths

- Strong first impression.
- Clear routes into Gallery, SkyMap, and Solar Explorer.
- Useful discovery intensity concept.
- Session memory already supports recent/personalized sections.

### Upgrade Plan

1. Make discovery sessions richer.
   - Replace simple random batching with a named session: theme, source mix, rarity score, and reason for inclusion.
   - Add a "continue this session" path when returning from Viewer.
   - Show source availability and partial failures.

2. Strengthen search.
   - Add autocomplete grouping by object, mission, source, and recent search.
     - Implemented in Home SearchBar with typed object/mission suggestions, source-scoped search actions, category matching, and recent searches bridged from session memory.
   - Add "search all modes" results that can jump to Solar and SkyMap objects as well as image results.
     - First object-jump implementation is live in the command palette for Solar bodies and curated SkyMap landmarks.
     - The app-wide index now also covers source-labelled dwarf planets/comets, the common-name stellar seed, measured Galactic structure and the measured DESI light cone. Exact or scoped object matches rank ahead of the Gallery fallback, so keyboard Enter performs the expected spatial jump.
     - Full Gaia, OpenNGC and nearby-exoplanet search remains inside progressively loaded SkyMap rather than increasing the app-shell boot payload.
     - Home autocomplete now includes curated mode-jump suggestions for Solar Explorer and SkyMap targets, reusing the existing route openers.
   - Add keyboard support for command-like navigation.
     - Implemented for Home autocomplete active suggestion cycling, selection, escape dismissal, and ARIA combobox/listbox metadata.

3. Clarify tabs.
   - Make tabs feel like workspace modes rather than page sections.
     - Implemented with a compact Home workspace-state rail that labels the active workspace and surfaces source/query/session/collection/personalized/lazy-load status.
   - Persist tab state, but make route changes obvious.
     - Implemented with local tab persistence and smoke coverage proving the For You workspace restores after reload.
   - Lazy-load expensive content such as the live feed only when needed.
     - Implemented through opened-tab gating and the live-feed intersection loader; the workspace rail now labels lazy-loading behavior.

4. Improve personalization.
   - Use recent searches and viewed object types to generate suggestions.
   - Add saved collection shortcuts from Home into Gallery and Viewer.
   - Add "because you viewed..." explanations.
     - Implemented with For You cards based on recent viewed imagery, including thumbnail, derived follow-up query, source context, and explicit reason copy.

### Acceptance Criteria

- Starting a discovery session produces a themed result set with clear rationale.
- Returning from Viewer preserves enough context to continue the session.
- Search can route to image results, Solar objects, and SkyMap objects without confusion.

## Gallery Mode

### Current Strengths

- Good card grid and filters.
- Infinite loading exists on desktop.
- Source, mission, year, sort, and timeline controls are already present.

### Upgrade Plan

1. Improve result quality.
   - Deduplicate near-identical NASA records.
   - Add search-within-results.
   - Derive timeline range from actual result dates instead of a fixed range.
   - Show raw count versus cleaned result count.
     - Implemented in the Gallery research brief with raw, cleaned, filtered, and visible counts.
   - Add active filter chips for query/source/mission/year/timeline state so users can see and remove individual constraints without resetting the whole workspace.
     - Implemented with a compact active-filter rail that shares state with the research brief and supports one-click per-filter clearing plus clear-all recovery.

2. Add viewing modes.
   - Grid view for browsing.
   - Dense list view for research scanning.
   - Compare tray for selecting two to four images before entering Viewer.
   - Preserve the selected compare set in Viewer so candidates can be inspected without returning to Gallery after each image.
   - Add a bulk triage action for staging the current visible results into compare.
     - Implemented with a `Compare visible` toolbar action that stages the first visible candidates up to the compare limit and hands off to the existing compare tray/Viewer flow.

3. Improve source transparency.
   - Show per-source status: loaded, partial, unavailable, or timed out.
   - Make SDSS and Pan-STARRS results visually distinct from NASA image records.
   - Add "why this result matched" details.
     - Implemented on result cards with match rationale and source/archive cues.
   - Show metadata quality at card level for quick research triage.
   - Add a result-set research brief for source/quality/filter/compare state.
     - Implemented with source status, source mix, metadata quality mix, active filter summary, collection count, and compare readiness.

4. Add collections.
   - Allow temporary collections during a session.
   - Save collection metadata locally first.
   - Surface the working collection on Home so saved observations remain part of the main workflow.
   - Surface the working collection in the command palette so it can be resumed from any mode.
   - Show item-level collection cues for newest/saved time, current Gallery visibility, source, and archive identity.
     - Implemented in the working collection tray for saved observations.
   - Later: persist collections in a backend store.

### Acceptance Criteria

- Duplicate-heavy searches such as JWST produce a cleaner gallery.
- Users can quickly narrow within a result set without re-querying the backend.
- The timeline never excludes valid results because of a stale hard-coded year cap.

## Viewer Mode

### Current Strengths

- Strong inspection workspace with zoom, filters, fullscreen, link copy, metadata, related items, and summary modes.
- Image state is reflected in URL parameters.
- Related results are scored from metadata.

### Upgrade Plan

1. Improve inspection tools.
   - Add a histogram or exposure readout.
   - Add before/after filter comparison.
   - Add fit modes: contain, cover, actual size, width fit.
   - Add an inspection-state rail for current zoom, fit, filter, asset, note, and compare state.
     - Implemented with a compact Viewer state rail that provides direct reset actions for zoom, fit, filters, HD/preview, annotations, and compare progression without adding another large panel.
   - Add keyboard shortcuts overlay with real shortcut wiring.
     - Implemented with a registry-backed shortcut panel covering zoom, fit modes, before/after comparison, annotations, HD/fullscreen/link actions, reset, and compare-set navigation.
   - Add a compare-set rail that keeps Gallery candidates navigable inside Viewer.
   - Gracefully explain when browser pixel-access rules prevent exposure sampling.

2. Improve annotations.
   - Replace mocked highlight regions with a real annotation model.
   - Allow user-created markers with labels.
   - Persist annotations locally by image id.
   - Later: use real model-backed object detection or NASA metadata overlays when available.

3. Improve provenance.
   - Add a source/provenance card with source URL, archive id, mission, instrument, resolution, and retrieval time.
   - Distinguish NASA, SDSS, and Pan-STARRS behavior.
   - Provide a "copy citation" action.
   - Include normalized metadata quality, dimensions when available, and source-specific match reason.

4. Improve explanation.
   - Make generated text declare whether it is deterministic, metadata-derived, or model-generated.
     - Implemented with an explanation-source card that labels summaries as deterministic metadata text and states the active beginner/scientific mode.
   - Add uncertainty and missing-data notes.
     - Implemented with confidence score, evidence-used list, missing-data list, and caveats about deterministic generation and heuristic labels.
   - Add "explain this like I am new" and "scientific notes" modes with clearer differences.

### Acceptance Criteria

- Viewer can be used as an inspection surface, not just an image detail page.
- Annotation controls are honest about what is detected versus user-marked.
- The provenance panel makes it easy to trace the image back to the source.

## Solar Explorer Mode

### Current Strengths

- Flagship-quality 3D surface.
- Tours, time playback, bookmarks, texture quality, asteroid belt, moon controls, and navigation modes already exist.
- Solar and SkyMap are partially connected through routes and object concepts.

### Upgrade Plan

1. Improve controls.
   - Replace the single "Controls" dropdown with a desktop command panel and compact mobile sheet.
     - Implemented first pass with a persistent Solar panel dock for Tools, Events, Mission, Scale, Time, and Perf overlays plus Clean/Default/All actions.
     - Split event presets into their own opt-in Events panel so the desktop Solar map opens in a calmer `2/6 Default` layout while keeping one-click access to guided alignments.
     - Clean/All panel state is now remembered across Solar reloads, with mobile-safe normalization so clean-map and compact layouts stay intentional.
     - Clean mode now collapses the dock itself into a small recovery chip, keeping the map genuinely quiet while preserving an obvious way back to panel controls.
     - Phone-width Clean mode now restores the hidden status row while collapsed, so the `Clean map` recovery chip and `+` control remain visible below 520px.
     - Phone-width object jumps from Clean mode now recover selected-object details and Mission context without reopening the full Tools drawer.
     - Phone-width object context now turns off the Time panel, separates details from Mission vertically, and consumes command handoff targets so Default/Clean/All actions are not overwritten by delayed object reveals.
     - Desktop All-panel mode now uses explicit lanes: app status remains visible above the event rail/topbar, Perf stays inside the Solar content area beside Mission, and bottom overlays stay clear of the timeline.
     - Page-level Escape now triggers the same clean-map state, while focused Solar text fields keep their own Escape behavior.
     - Default now restores the calm baseline panel layout after full diagnostic/debug panel use.
   - Keep date, search, view mode, scale, moons, asteroids, performance, bookmarks, and tour controls readable.
   - Add icons and tooltips for common controls.

2. Add educational overlays.
   - Orbit labels.
     - Implemented for the selected planet's current position, perihelion, aphelion, and recent trail window.
   - Distance and scale ruler.
   - Selected-body trail and orbital speed readout.
     - Implemented with the existing selected orbit trail plus mission-control orbit phase, trail window, perihelion, aphelion, distance, and mean-motion readouts.
   - Optional axial tilt and rotation indicators.

3. Add event modes.
   - Today.
   - Birthday alignment.
   - Next opposition or conjunction where applicable.
   - Moon/planet system showcase.
   - Saturn ring pass and Jupiter moon family presets.

4. Improve astronomy fidelity.
   - Replace static approximate planet values with stronger ephemeris-backed positions where possible.
   - Keep current VSOP/domain code as the first canonical path.
   - Label approximations clearly.
   - Added four missing recognized dwarf planets and five representative comets through a separate JPL SBDB small-body adapter, preserving each osculating-element epoch and direct canonical source receipt.
   - Added search, focus, routes, date playback and source/model dossiers for those objects; comet tails are explicitly anti-solar presentation heuristics rather than observed or forecast activity.

5. Improve performance and lifecycle.
   - Verify texture disposal on unmount.
   - Reduce context-loss noise on route changes.
   - Keep the WebGL canvas mounted during texture preload and fall back cleanly if textures are delayed.
     - Implemented by defaulting boot to performance textures, removing the post-preload canvas remount, and adding a texture-load deadline fallback.
     - Hardened by removing the desktop high-detail boot flip, preloading only first-visible major moon texture work, deduplicating concurrent texture requests through in-flight loader promises, routing planet/moon/Sun/asteroid textures through one shared cache/diagnostic loader, and adding a per-texture load deadline so a stalled asset resolves to material-color fallback instead of holding the texture promise open indefinitely.
     - Regression-gated by three fresh desktop and two fresh phone-width Solar cold loads in smoke coverage, including default panel state, texture completion, no high-detail boot requests, and a delayed-texture timeout probe.
   - Add a development performance overlay using the existing `__SPACEVIEWER_PERF__` diagnostics.
     - Implemented with a Solar performance overlay that surfaces render mode, reasons, shared adaptive-quality state, loading progress, texture request/load/failure/timeout counters, and scene diagnostics in development.

### Acceptance Criteria

- A new user can understand and control the Solar surface without opening a dense dropdown.
- Selection clearly explains distance, scale, motion, and approximation level.
- Navigating away and back does not degrade rendering or leak resources in ordinary use.

## SkyMap Mode

### Current Strengths

- Strong internal architecture: reducer state, layer registry, object registry, renderable pipeline, filters, discovery records, and tours.
- Conceptually distinct from Solar Explorer.
- Already has planned annotation layer scaffolding.

### Upgrade Plan

1. Improve navigation comprehension.
   - Add scale breadcrumbs: Solar System, Local Stars, Milky Way, Extragalactic.
   - Add a scale ruler and distance legend.
     - Implemented with a staged scale ruler, camera-distance marker, major scene-unit ticks, and scale interpretation labels.
   - Add minimap or orientation inset.
     - Implemented with a compact viewport inset showing the current scale band, three-band orientation trail, camera distance, and navigation mode.
   - Make camera mode and scale band obvious.
     - Implemented in the viewport HUD and mirrored in the orientation inset.

2. Improve layer controls.
   - Add visual density previews to layer toggles.
     - Implemented with compact density rails scaled by layer catalog size.
   - Show active object count and hidden count per layer.
     - Implemented with per-layer active/hidden catalog counts that respond to layer visibility and filters.
   - Let users quickly solo a layer.
     - Implemented for active SkyMap layers through the layer rail's `Solo` actions.
   - Add saved layer presets.
     - Implemented with local saved layer visibility presets, restore, clear, and all-active actions.

3. Add annotations.
   - Activate the planned annotations layer.
   - Allow user notes and markers.
     - Implemented with a local annotation layer, a map-note form anchored to the selected object, a compact annotation workspace summary for current anchor/saved-note/selected-note state, active note rows, and selected-note object details.
   - Support time-aware annotations later.
   - Share selected annotation targets with Viewer where relevant.

4. Improve object details.
   - Add a selected-object dossier summary with immediate action context.
     - Implemented with primary id, summary, distance, scale model, source, notability, and grouped focus/Solar actions.
   - Add imagery jumps for deep-sky objects.
     - Implemented with SkyMap imagery cards that convert NASA-backed deep-sky references into Viewer-ready observations and Gallery context.
     - Implemented resilient fallback media state when a remote preview is unavailable.
   - Show aliases, catalog ids, distance, source model, and approximation status.
     - Implemented with identity chips, provenance/model summaries, approximation notes, and richer source/status text in the selected-object panel.
   - Add related-object paths.
     - Implemented for direct relations, reverse relations, and curated deep-space related IDs with labeled jump buttons.

5. Strengthen Solar bridge.
   - Jump from SkyMap Solar bodies into Solar Explorer with matching selection.
     - Implemented via the selected-object action for SkyMap Solar bridge objects.
   - Preserve date/time context.
     - Implemented for the SkyMap simulated UTC date when launching Solar Explorer.
   - Show when SkyMap is symbolic versus physically scaled.
     - Implemented with scale interpretation labels in the staged ruler and existing navigation note.

### Acceptance Criteria

- Users can tell where they are in scale and why objects appear where they do.
- Layer controls feel like map controls rather than a settings list.
- SkyMap can hand off to Solar Explorer and Gallery without losing context.

## Backend And Data Layer

### Current Strengths

- Simple Express routes are easy to reason about.
- NASA, SDSS, and Pan-STARRS are already normalized into frontend records.
- Backend keeps external API details out of the client.

### Upgrade Plan

1. Add caching.
   - In-memory cache for search and image asset lookup.
   - Short TTL for searches, longer TTL for image assets.
   - Include cache metadata in development logs.
     - Implemented through `/api/health`, which reports NASA search/image cache entry counts, TTLs, next expiry timing, request timeout, and configured upstream endpoints without making external calls.

2. Improve resilience.
   - Add timeouts per external source.
   - Return partial source failures instead of failing the whole search.
   - Include source status in search responses.
   - Add a fast local API health check for dev-server and smoke diagnostics.
     - Implemented as `/api/health` with service status, uptime, configured sources, NASA cache diagnostics, and MAST/Pan-STARRS timeout diagnostics.
     - Implemented source-specific error reporting for NASA search, MAST coordinate resolution, and Pan-STARRS filename lookup while preserving empty/unavailable states for genuine no-data cases.

3. Improve normalized metadata.
   - Track source, source URL, archive id, mission, instrument, date, dimensions when available, and match reason.
   - Add metadata quality score.
   - Implemented in the frontend `SpaceImage` contract and mapper path, with backend search wrappers providing source-specific match reasons.

4. Prepare persistence.
   - Local-only saved collections first.
   - Later: backend persistence for sessions, collections, annotations, and bookmarks.

### Acceptance Criteria

- Repeat searches feel faster during a session.
- If one source is unavailable, available sources still render.
- Frontend can tell the user what happened per source.

## Verification Plan

### Build Checks

- `npm run build` in `frontend`.
- `npm run build` in `backend`.
- `npm run test` in `frontend`.
- `npm run smoke` in `frontend` with the dev server running.
  - This now runs a backend `/api/health` preflight that checks cache and external timeout diagnostics plus desktop and phone-width route checks.

### Browser Smoke Checks

- Home loads and renders search controls.
- Home search shows grouped mode/object/source autocomplete, supports arrow-key active selection, and can jump directly to a SkyMap object.
- Home shows the active workspace state for tab modes and restores the persisted Home tab after reload.
- Gallery loads results, filters, and search-within-results.
- Gallery shows active filter chips when result constraints are applied and each chip can clear its own constraint.
- Gallery shows a research brief for raw/cleaned counts, source/quality state, collection state, and compare readiness on desktop and phone-width routes.
- Gallery cards show why each result matched plus archive/source and resolution cues.
- Gallery working collection shows saved-item visibility plus source/archive cues.
- Viewer opens from Gallery and displays image plus metadata.
- Viewer shows a compact inspection-state rail and can reset adjusted zoom/filter state from that rail.
- Home, Viewer, and SkyMap render migrated status-chip surfaces without changing their visible metadata labels.
- Solar Explorer loads a nonblank 3D canvas with a panel dock that can hide/reopen Tools, Events, Mission, Scale, Time, and Perf overlays.
- Solar Explorer desktop All-panel mode keeps diagnostic overlays in non-overlapping lanes.
- Solar Explorer clean-map mode persists across reloads and exposes a visible recovery chip on desktop and phone-width layouts.
- Solar Explorer phone-width command recovery from Clean mode shows selected-object details and Mission context while keeping the full Tools drawer closed and preserving Default recovery.
- SkyMap loads a nonblank 3D canvas and object controls.
- SkyMap shows the orientation inset with active scale band and live camera-distance readout on desktop and phone-width routes.
- SkyMap shows a staged scale ruler with scene-unit ticks and scale interpretation on desktop and phone-width routes.
- SkyMap selected-object panel shows a dossier with primary id, model context, and grouped actions for deep-space and solar targets.
- SkyMap can create, select, render, and delete a local anchored map note without leaving stale annotation state behind.
- Command palette object searches can jump directly to a Solar body and a SkyMap landmark.
- SkyMap Solar-body handoff opens Solar Explorer on the same body and preserves the selected simulation year.
- Phone-width Home, Viewer, Solar Explorer, and SkyMap checks render key controls without page-level horizontal overflow.

### Future Automated Tests

- Extend mapping/filtering utility tests as new sources and heuristics are added.
- Extend Gallery utility tests as new result-quality heuristics, sort modes, and collection rules are added.
- Extend SkyMap reducer tests as new map actions, layer preset rules, and time controls are added.
- Browser smoke test for major routes and first object-command jumps is now available through `frontend`'s `npm run smoke`; extend it with deeper interaction coverage as modes evolve.

## Implementation Order

1. Documentation and planning artifact.
2. Gallery cleanup: dedupe, dynamic years, search-within-results.
3. Backend search/image caching.
4. Viewer provenance and annotation model foundation.
5. Solar controls and overlays.
6. SkyMap breadcrumbs, scale ruler, and object handoff improvements.
7. Shared command layer and UI primitive extraction.
8. Tests and browser verification.
