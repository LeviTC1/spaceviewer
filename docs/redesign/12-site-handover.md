# The whole of SpaceViewer: pass 2 handover (23 Nov 2026)

Direction: [10-site-direction.md](10-site-direction.md). Where every old capability lives now:
[11-capability-map.md](11-capability-map.md).

## Open first

`http://localhost:5173/`. On a fresh visit you get Earth as a live crescent and the *Start here* card.

## A short tour

1. **Universe (`/`).** The front door is the live, true-scale universe. Under one bar it offers:
   - *Start here*: Show me something incredible, today's Moment, six journeys, places by family.
   - *Show me something incredible* flies to one of 16 curated destinations. The object panel opens with
     a one-line hook, **Seen by telescopes** (real NASA archive photographs) and, beyond the Solar
     System, a **light-travel story** ("The light you would see from here left Andromeda 2.5 million
     years ago…"). Every fact carries a measured, derived or illustrative mark.
2. **Moments.** Seven real events replayed at their real date, each with a short story and a note on
   what is measured:
   - the 2024 eclipse (telephoto lens: a black Moon and corona from real Sun and Moon positions);
   - New Horizons at Pluto;
   - Cassini's Grand Finale;
   - the Great Conjunction (0.6° telescope view from Earth);
   - Mars 2003 at 55.8 million km;
   - Voyager 1 at the heliopause (121.7 AU);
   - Halley at perihelion.
3. **Images (`/images`).** Every photograph of the sky, and the place it shows:
   - One search over NASA, SDSS and Pan-STARRS. NASA's results appear in about a quarter of a second
     instead of after the survey archives' roughly 10-second position lookup.
   - Browse the sky, *Wander* (discovery sessions), and a wall of archive highlights cached for six
     hours.
   - *Live from NASA*, which had been showing "This video is private".
4. **Results (`/images?q=…`).** Search results now have an address, so Back and reload work:
   - photograph-first cards, each tagged with the place it shows;
   - a sticky filter bar, with the timeline and research brief in *Timeline & sources*;
   - a floating compare dock;
   - "Fly to Saturn" when the search names a place.
5. **Viewer (`/viewer/…`).** The photograph dominates. **Where is this?** names the place, says how long
   its light took and flies there; Back returns to the photograph. Notes, adjustments, exposure and
   provenance are kept. **Save** is new in the viewer itself.
6. **Your sky (`/saved`).** Everything kept on this device:
   - saved views with thumbnails;
   - saved photographs;
   - Solar bookmarks;
   - places visited;
   - recent photographs and searches;
   - suggestions, notes and Moments.
7. **Find anything (⌘K, the bar field or the phone tab).** Places, Moments, Photographs, Your sky,
   Recent, Go to and Tools, in one ranked list.
8. **Tools.**
   - **Solar Explorer** is unchanged inside.
   - **Sky Atlas** is the classic SkyMap, renamed. It is unchanged inside.
   - Both now sit under the shared bar and palette.
9. **Settings** (the sliders icon): motion, 3D quality for every renderer, explanation style, clearing
   history, and the data credits.

## What I invented

- **Where is this?**: the bridge from any photograph to the place it shows, with its light-travel time.
- **Seen by telescopes**: real photographs inside every object in the universe.
- **Moments**: replayable real events, including a physically rendered total eclipse.
- **Show me something incredible**: one button, a flight, a reason to care, and photographs.
- **Save view** and **Your sky**: keep the exact object, moment and camera.
- **Postcards**: a PNG of your view with its caption and a link back; system share on phones.
- **Provenance marks** and **Distance from Earth now** on facts.
- **Eclipse and transit occlusion** in the renderer.
- **Instant return** to the universe while browsing photographs.

## Fixes found by using the product

| Problem | Fix |
| --- | --- |
| The live ISS embed had gone private ("This video is private") | Click-to-watch NASA channel embed, plus a link to NASA's streams that always works |
| Archive searches took ~10 s to show anything | NASA results first, surveys merged in when they resolve |
| Search results had no URL, so Back from the viewer re-ran nothing | `/images?q=…`, `/images?wander=1`, `/images?saved=1` |
| Flipping through a compare set flooded browser history | Compare flips replace the entry |
| The bar's *Universe* button lost your object and camera | Returns to the exact last universe address |
| "Moons: 0" for Pluto and "3" for Saturn (counts of modelled moons) | Known counts, with "N major moons shown here" |
| A light-travel story tied Andromeda's 2.5-million-year-old light to the first Homo sapiens | Anchors are only cited within a factor of 1.7; otherwise the story gives just the year |
| The Sun's glare was drawn over a Moon in front of it | Glare is scaled by the share of the solar disc still visible; a corona shows at totality |
| A deep link to something missing showed "Locating…" for ever | Gives up with a message after the catalogues settle |
| Typing "and" suggested Miranda before Andromeda | Place suggestions ranked by prominence |
| Featured photographs never loaded (an effect cancelled its own request) | Fixed; cached for returning visits |

## Verification (Chrome on an M1 Pro with GPU; 1440×900 at 2× and 390×844 at 3× with touch)

- **Unit tests:** 45 files, 242 tests pass. New: `tests/site.test.ts`, 11 tests covering:
  - photograph-to-place matching, including words that must *not* match;
  - light-travel stories, including the no-invented-coincidence rule;
  - Moments and the Today pick;
  - eclipse disc overlap;
  - Find ranking.
- **TypeScript:** clean.
- **ESLint:** 0 errors in hand-written source. The 38 errors are all in the generated
  `src/engine-wasm/pkg/spaceviewer_wgpu.js`, untouched by this pass.
- **Production build:** passes.
- **Smoke checks**, each run on its own against the dev server:
  - **New:** `photo-to-place`, `moments` (checks Mars 2003 at 55.8 million km), `save-and-share`
    (saves a view, downloads a PNG postcard, reopens it from Your sky with the exact camera).
  - **Rewritten for the new product, same intent:** `home`, `gallery`, `viewer`, `mobile-home`,
    `mobile-gallery`, `mobile-viewer`.
  - **Pass:** the eight above plus `explore`, `explore-observation-link`, `solar-eclipse`,
    `solar-moon-eclipse`, `solar-atmosphere-lut`, `solar-ring-shadows`, `solar-history` and
    `mobile-explore`.
  - **Still failing, as at the pass-1 baseline**, inside Solar Explorer and Sky Atlas internals this pass
    did not change: `solar`, `solar-true-au`, `scale-journey`, `camera-flights`, `skymap`, the four
    catalogue checks, `webgl-lifecycle`, `object-commands` and `mobile-solar`/`mobile-skymap`.
    `object-commands` now passes every step that touches the new product and stops inside Sky Atlas's
    own search panel.
- **Measured:**
  - First archive results in 256 ms (previously ~10 s).
  - Back from a photograph to the universe in 108 ms; Images → Universe in 325 ms (the universe stays
    loaded).
  - Pass-1 frame times are unaffected: the renderer pauses completely while hidden.
- **Evidence:**
  - `docs/redesign/evidence/20–21` (before), `22–27` (after: surfaces, end-to-end journey, Moments,
    the eclipse, phone, a postcard).
  - `tmp/redesign-evidence/videos/pass2-end-to-end-journey.mp4`.

## Not verified

- **Safari and real iOS devices:** the Playwright WebKit build doesn't match this machine.
- **Real trackpad hardware:** pinch was emulated.
- **NASA's live stream:** I couldn't confirm NASA was broadcasting from here. The channel embed may say
  "unavailable" when nothing is on air; the link to NASA's streams always works.
- **Screen readers:** structure, roles and focus were checked in code; no VoiceOver pass.
- **Solar Explorer and Sky Atlas interiors** keep their own panel designs inside the new bar and palette.
  They were re-coloured through the shared tokens, not redrawn.

## Live from space (added 23 Nov 2026)

`/live` replaces the single NASA embed, which had gone private. All 17 feeds were checked the same day:
- **Streams:** owned by the named channel, live now, embeddable.
- **Movies and images:** reachable and updated within hours.

| Group | Feeds |
| --- | --- |
| From orbit | NASA ISS HD Earth views · NASA ISS live with crew audio · Sen 4K Earth |
| Launch sites | NASASpaceflight: Space Coast, Starbase, McGregor engine tests |
| The Sun today | SDO 48-hour movies at 193 Å, 304 Å, 171 Å and HMI visible light |
| Earth today | DSCOVR EPIC "A day on Earth" sequence · GOES-East and GOES-West full disc, refreshed every 10 min |
| Space weather | SOHO LASCO C3 and C2 coronagraph movies · NOAA aurora forecasts, north and south |

- **When a stream ID dies:** the player listens for YouTube's error and swaps in a card linking to the
  broadcaster's live page. I tested this against the retired NASA ID, which reports error code 150.
- **Keeping it working:** run `npm run check:live`. It re-checks every feed and says which ID to
  replace in `src/shell/liveFeeds.ts`.
- **Where it's linked:**
  - the bar and the phone tab bar;
  - Images › Live now;
  - Find › Live;
  - *Watch live* in the Sun's and Earth's universe panels.

## Homepage (added 23 Nov 2026)

`/` is now a homepage, and the universe moved to `/explore`. The page has six parts:
- **Hero:** "The universe, live and to scale.", on SpaceViewer's own render of Earth's night side, with
  three ways in (Enter the universe · Browse photographs · Watch live) and Find. Returning visitors get
  *Continue at …* and their Your sky count.
- **Headline numbers:** 15,448 Gaia stars, 3,004 deep-sky objects, 16 orders of magnitude of zoom, 17
  live feeds.
- **Where would you like to go?:** eight destinations, each a real render from the engine
  (`public/home/*.jpg`) and each flying you there.
- **Be there when it happened:** today's Moment featured, plus four more.
- **Happening right now:** four live feeds, and **Every photograph of the sky**: archive search plus a
  wall of NASA photographs from the deep-sky catalogue, with their credits.
- **"Made from real data, and honest about it"**, then a footer with every surface and the data credits.

The universe's code starts downloading while you read, so *Enter the universe* opens quickly. The new
`landing` smoke check covers:
- the homepage → Saturn → Back;
- Enter the universe → the logo returns home;
- the legacy `/?object=` link;
- an unknown address landing on the homepage.

### Hero photograph (24 Nov 2026)

The hero is the James Webb Space Telescope's "Cosmic Cliffs" in the Carina Nebula (NGC 3324).
- **Credit and licence:** NASA, ESA, CSA, STScI; CC BY 4.0. Credited in the hero, the footer and
  Settings › Data & credits.
- **Source:** downloaded once from ESA/Webb's official CDN (`weic2205a`, the 14,575 × 8,441 original).
- **Files in `public/home/`:**
  - WebP at 1,600, 2,560 and 3,840 px: 158, 307 and 526 KB;
  - JPEG fallbacks at the same widths;
  - a portrait crop for phones (174 KB).
- **Delivery:** the browser chooses the right size; a Retina laptop gets the 4K file.
- **Behaviour:** a slow zoom that stops when motion is reduced, and a *Fly there* button to the Carina
  Nebula in the universe.
