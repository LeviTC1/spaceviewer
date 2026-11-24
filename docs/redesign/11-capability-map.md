# Capability map: before → after (pass 2)

Every capability the site had before this pass, where it lives now, and how you reach it. The
"Verified" column names the automated smoke check or recorded journey that exercises it.

## Routes and deep links

| Address | Before | Now | Verified |
| --- | --- | --- | --- |
| `/` | Universe explorer (pass 1) | **Homepage** (23 Nov 2026): hero, destinations, Moments, Live, photographs. `/?object=` and `/?moment=` still open the universe. Unknown addresses land here. | `landing` |
| `/explore` | Universe | The universe: Start here, Show me something incredible, Moments. The bar's *Universe* returns to your last exact view. | `explore`, `mobile-explore` |
| `/explore/<slug>?t=&rate=&paused=&cam=` | Exact observation | Unchanged | `explore-observation-link` |
| `/explore?object=<id>`, `/skymap?object=<id>` | Legacy object links | Unchanged (open the universe) | `object-commands` |
| `/explore?moment=<id>` | — | **New:** replay a Moment | `moments` |
| `/archive` | Archive dashboard (7 tabs) | Redirects to `/images` (query kept) | `home` |
| `/images` | — | **New:** Images home | `home`, `mobile-home` |
| `/images?q=<query>&source=<src>` | Search results were not addressable | **New:** search results have a URL, so Back, reload and sharing work | `gallery`, journeys |
| `/images?wander=1` | — | **New:** the current wandering (discovery) session | manual |
| `/images?saved=1` | — | **New:** saved photographs as a gallery | `gallery`, `mobile-gallery` |
| `/viewer/<id>` | Viewer | Unchanged (redesigned) | `viewer`, `mobile-viewer`, `photo-to-place` |
| `/saved` | — | **New:** Your sky | `home`, `save-and-share` |
| `/live`, `/live?feed=<id>` | — | **New:** Live from space | `live` |
| `/solar?object=&mode=&scale=&date=` | Solar Explorer | Unchanged, under the shared bar | `solar*`, `mobile-solar` |
| `/skymap?classic=1&object=` | Catalogue layers | Unchanged, now named **Sky Atlas** | `skymap`, `object-commands` |
| Unknown address | Archive home | The universe (front door) | manual |

## Features

| Capability | Before | Now |
| --- | --- | --- |
| Archive search (NASA, SDSS, Pan-STARRS) with source choice | Home › Explore tab | Images hero search + archive chips. Find › "Photographs of …". Explorer search › last row. NASA results now show first (≈250 ms); survey results merge in when they resolve (~10 s). |
| Search suggestions (objects, missions, categories, recent, sources) | Home search bar | Same component in the Images hero. Place jumps now read "Fly to …" and open the universe. |
| Categories (23) | Gallery/Discover tabs | Images › Browse the sky |
| Source filters ("set as active source") | Gallery tab | Images hero archive chips |
| Featured gallery / carousel | Gallery tab | Images hero (rotating photograph with credit) + "From the archives" wall. Cached on the device for 6 h. |
| Discovery sessions (balanced/deep/extreme, add batch, continue) | Discover tab, results | Images › Wander (Wide-field / Deep-field / Anomaly sweep), `/images?wander=1`, Find › Recent, Your sky › Next for you |
| For You recommendations, recent searches | For You tab | Your sky › Next for you, Recently looked at. Images › Pick up where you left off |
| Live ISS feed | Live tab (embed had gone private) | **Live** (`/live`, in the bar and phone tab bar): 17 verified feeds. See below. |
| SkyMap / Solar launch cards, Solar bookmarks list | SkyMap/Solar tabs | Bar › Tools (Solar Explorer, Sky Atlas). Bookmarks › Your sky › Solar Explorer bookmarks |
| Reduce motion toggle | For You tab | Settings › Motion (same stored key) |
| 3D quality (auto/manual tiers) | SkyMap header, journey bar, explorer popover | Settings › 3D quality (sets both stores). Explorer › View options still offers it locally. |
| Explanation style (scientific/beginner) | Viewer info panel | Viewer info panel (unchanged) + Settings › Photograph explanations |
| Command palette (⌘K) | Sidebar "Command" | **Find anything** (⌘K, bar field, phone tab): Places, Moments, Photographs, Your sky, Recent, Go to, Tools |
| Object commands → Solar Explorer / SkyMap | Palette | Find › Places fly in the universe. "Solar Explorer: X" and "Sky Atlas: X" remain as Tools results. |
| Gallery filters, sort, grid/list, find in results, active-filter chips | Results | Results toolbar (sticky) |
| Timeline range, research brief, source status | Results (always visible) | Results › Timeline & sources |
| Save / save visible / working collection tray | Results | Card star, toolbar "Save visible", tray at the end of results, Your sky › Saved photographs |
| Compare (up to 4) and compare set in the viewer | Results tray | Floating compare dock → "Compare side by side". Flipping within a set no longer floods browser history. |
| Viewer: zoom/pan/fit, minimap, HD toggle, fullscreen, copy link, shortcuts, filters & presets, before/after split, exposure histogram, notes, download, open in archive, related | Viewer | All kept. The image dominates; the tools sit in a side column (Adjust, Your notes, Exposure); the actions are in the header. |
| Viewer: save to collection | — (only from results) | **New:** Save in the viewer header |
| Explorer: search, journeys, onward routes, time, location rail, share link, view options | Explorer | Kept. Discover → **Start here**. The share button opens a menu: link / postcard / system share. |
| Earth surface viewer bridge | Hidden journey bar | Find › Tools › "Stand on Earth" (when `VITE_EARTH_VIEWER_URL` is set) |
| Scale-domain transition between Solar and Sky Atlas | Journey bar (hidden by CSS) | Transition kept; domains are reached from Tools/Find |

## New capabilities

| Capability | Where |
| --- | --- |
| **Where is this?** A photograph → the place it shows, how long its light took (derived), Fly there | Viewer side column, results header ("Fly to …"), result cards (place tag), Images hero credit |
| **Seen by telescopes**: real archive photographs inside every object panel | Universe object panel |
| **Light-travel story** told against human history, only when an anchor is genuinely close | Universe object panel, viewer |
| **Moments**: 7 real events replayed at their real date, with telescope lenses where the event needs one. The 2024 eclipse renders a black Moon disc and corona from real Sun and Moon positions | Start here, Find › Moments, Your sky, `/explore?moment=` |
| **Show me something incredible**: 16 curated destinations with a one-line hook and photographs | Start here, floating button, `R` key |
| **Save view**: exact object, moment and camera, with a thumbnail | Object panel star, `S` key → Your sky |
| **Postcards**: PNG of the view with labels, caption and a link that reopens it; system share on phones | Share menu |
| **Your sky**: everything kept on this device in one page | Bar, phone tab bar, Find |
| **Provenance marks**: measured / derived / illustrative on every fact | Universe object panel |
| **Distance from Earth** at the current moment (derived) | Planet, dwarf-planet and comet facts |
| **Eclipse and transit occlusion**: the Sun's glare dims by the share of its disc a nearer body covers | Universe renderer |
| **Live from space**: 6 live video streams (NASA ×2, Sen 4K, NASASpaceflight ×3); 6 Sun movies from SDO and SOHO; DSCOVR EPIC's Earth day; GOES-East/West full disc every 10 min; NOAA aurora forecasts. A dead stream falls back to the broadcaster's live page; `npm run check:live` re-verifies every feed | Bar › Live, phone tab, Images › Live now, Find › Live, *Watch live* in the Sun's and Earth's panels |
| **Instant return to the universe**: it stays mounted (rendering paused) while you browse photographs | Everywhere |

## Saved state

Every existing key is read and written unchanged.

| Key | Owner |
| --- | --- |
| `spaceviewer.workingCollection` | Saved photographs |
| `spaceviewer.sessionMemory` | Searches, viewed photographs, recommendations |
| `spaceviewer.recentSearches` | Search bar recents |
| `spaceviewer.viewerSnapshot.*` | Viewer deep links |
| `spaceviewer.annotations.*` | Photograph notes |
| `spaceviewer.solar.*` | Solar Explorer bookmarks, panels, birthday, intro seen |
| `spaceviewer.skymap.*` | Sky Atlas annotations, layer preset, intro seen |
| `spaceviewer.astro.quality.v1/v2` | 3D quality tier |
| `spaceviewer.explore.*` | Explorer session, quality, seen |
| `spaceviewer.reduceMotion` | Reduce motion |
| `spaceviewer.aiMode` | Explanation style |
| `spaceviewer.home.tab`, `spaceviewer.sidebarCollapsed`, `spaceviewer.solar.hintDismissed` | Retired with the tabbed home and sidebar. The values are left untouched. |

New keys:
- `spaceviewer.savedViews.v1`
- `spaceviewer.recentPlaces.v1`
- `spaceviewer.images.featured.v1` (6-hour cache)
- `spaceviewer.explore.surprises.v1` (session storage)

## Retired files

Moved to `tmp/retired-pass2/`, not deleted:
- `HomePage.tsx`
- `SuggestedTargets.tsx`
- `Header.tsx`
- `CosmicJourneyBar.tsx`
- the pass-1 smoke script
