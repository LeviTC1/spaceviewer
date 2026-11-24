# SpaceViewer vs Galaxium — after the redesign (22 Nov 2026)

All observations: Google Chrome (headless, real GPU: ANGLE Metal, Apple M1 Pro), 1440×900 CSS px at
devicePixelRatio 2, default settings, local dev build; mobile at 390×844 @3× with touch emulation.
Recordings: `tmp/redesign-evidence/videos/*.mp4`; stills and logs: `tmp/redesign-evidence/{galaxium,before,after}/`;
contact sheets committed alongside this file in `evidence/`.

## Where SpaceViewer now stands

| Area | Verdict | Evidence (V = verified by recording/measurement) |
| --- | --- | --- |
| First frame & first action | **Meets** — opens on a living Earth (crescent, city lights, drifting), six journeys and categories one click away, one quiet hint | `evidence/01`, V |
| Visual identity | **Meets, distinct** — black, warm-white type, amber action, cyan selection, tabular numerals; canvas dominates | V |
| True-scale continuous universe | **Meets** — one float64 world from 1 m to the Local Group; Saturn→Andromeda flight shows Saturn receding, the Solar System, the star field, the Milky Way from outside, then Andromeda | `evidence/02b`, `videos/after-continuous-travel.mp4`, V |
| Flight feel by journey type | **Meets** — hop 1.1–1.9 s, intergalactic 5–7.4 s; drag interrupts instantly; moving targets tracked | `evidence/04`, unit tests, V |
| Arrival framing | **Exceeds** — bounds-, aspect- and panel-aware; planets arrive lit at three-quarter phase, galaxies along our line of sight (Andromeda inclined 77°, Sombrero edge-on); subject lifted above the mobile sheet | `evidence/05a`, `evidence/07`, V |
| Planets, rings, moons | **Meets** — Sun-lit terminators, Earth night lights/clouds/glint, Saturn ring shadows both ways, crescent views | `evidence/05b`, V |
| Star field | **Meets** — 15,448 Gaia stars with per-camera magnitude and real parallax (before: 120–480 capped) | V (Galaxium's star count not measured) |
| Galaxies, nebulae, clusters | **Meets** for spirals/edge-on/irregular; nebulae have depth but are less photographic than Galaxium's | `evidence/05a/05b`, V |
| Galactic centre | **Exceeds** — geodesic-traced Sgr A* with lensed background, Doppler-beamed disk (labelled illustrative); Galaxium shows a black-hole category, its treatment was not inspected in depth | V |
| Scale honesty | **Exceeds** — direction-only OpenNGC objects stay on the sky and say so; illustrative structure disclosed per object; Milky Way arms from Reid et al. 2019 | V |
| Search | **Exceeds** — Enter flies (Galaxium requires a click), catalogue IDs ("m31", "NGC224"), typos, categories, distances in results | unit tests, smoke `explore`, V |
| Onward discovery | **Meets** — moons, siblings, nearest stars with distances, "Where in the Milky Way" keeps the origin labelled, Local Group neighbours | V |
| Shareable observation | **Exceeds** — `/explore/<slug>?t=&rate=&paused=&cam=` reproduces object, epoch, playback and pose; cold link, reload, Back and narrow screen verified; legacy `/skymap?object=` works | smoke `explore-observation-link`, `evidence/08`, V |
| Simulation ↔ real imagery | **Exceeds** — *Images* opens the archive for the object; Back returns to the exact same observation | `evidence/08`, `videos/after-time-imagery-history.mp4`, V |
| Time | **Meets** — real time to 1 year/s, reverse, pause stays paused, tracking holds Io at 1 day/s | V |
| Trackpad & touch | **Meets** — two-finger scroll, pinch, Safari gestures, inertia, keyboard; touch orbit/pinch; mobile bottom sheet | `evidence/04`, `evidence/07`, V (pinch emulated as ctrl+wheel; real trackpad hardware not driven) |
| Performance | **Meets** — p50 16.7 ms and p95 16.8 ms on every profiled journey; first meaningful scene 1.65 s; heap 58 MB cold → 106 MB after 16 trips (no growth) | `after/performance.log`, V |
| Spacecraft & small bodies | **Short** — Voyager has a simple procedural silhouette; no detailed models or wider spacecraft catalogue (Galaxium has a spacecraft category) | V |
| Photographic object appearance | **Short** — Galaxium's nebula/planet close-ups are more photographic; ours are procedural for nebulae, Galilean moons and galaxy structure | V |
| Content breadth (news, "on this day", AI) | **Short** — not in scope of this pass | — |
| Safari | **Not verified** — Playwright WebKit build mismatch; driving Safari needs a system setting change | — |

## Measured performance (Chrome, M1 Pro, 1440×900 @2×, default "high" = 1.75× DPR)

| Journey | frames | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| Cold launch → first labelled scene | — | — | — | 1,652 ms |
| First planetary approach (Jupiter) | 379 | 16.7 | 16.8 | 83 |
| Interstellar flight (Proxima) | 379 | 16.7 | 16.8 | 67 |
| Orbit in dense stars | 360 | 16.7 | 16.8 | 33 |
| Intergalactic flight (Andromeda) | 461 | 16.7 | 16.8 | 117 |
| Galaxy orbit | 494 | 16.7 | 16.7 | 17 |
| Full-scale pull-back (wheel) | 956 | 16.7 | 16.8 | 33 |
| Idle after 16 more round trips | 179 | 16.7 | 16.7 | 17 |

Before (old SkyMap): first Saturn flight hitched to 800 ms.

## Tests

* `vitest`: 44 files, 231 tests pass (new: `tests/explore.test.ts`, 19 tests — frames, flight stability across
  16 orders of magnitude, moving-target arrival, reduced motion, panel-aware framing, inclination, search,
  slugs, deep links).
* `eslint`: 0 errors in all changed files (warnings are the codebase's configured R3F `immutability` class).
* `vite build`: passes.
* Smoke (`scripts/smoke-check.mjs`), each check run individually against the untouched baseline and the
  redesign: every check that passed before still passes; new `explore`, `explore-observation-link` and
  `mobile-explore` pass. 14 checks (`solar`, `solar-true-au`, `scale-journey`, `camera-flights`, `skymap`,
  the four catalogue checks, `webgl-lifecycle`, `object-commands`, `mobile-solar`, `mobile-skymap`) fail
  identically on the baseline — the suite predates the immersive Solar/SkyMap headers.

## A short route through the finished app

1. Open `/`. Earth drifts as a crescent; drag it, then scroll out until the Moon's orbit, the planets, the
   stars and finally the Gaia Milky Way take over.
2. Discover → **From the Moon to the Local Group**; press *Next stop* through all seven.
3. Search `saturn` ↵. Orbit behind the planet to see its shadow across the rings; open **Titan** from *Go next*.
4. Time → *1 day/s* and watch the moons move while the camera stays locked; *Play backwards*; pause.
5. Search `m31` ↵ (Andromeda, inclined as seen from Earth); drag to see it face-on and edge-on.
6. Search `orion nebula` ↵ → *Where in the Milky Way* (the nebula stays labelled inside the Galaxy).
7. Search `sgr a*` ↵ and orbit the black hole.
8. Share → open the copied link in a new window, then on a phone-sized window.
9. On any object press *Images*, then Back — you return to the same moment and view.
