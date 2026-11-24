# SpaceViewer redesign — what changed and why

## One mental model

**SpaceViewer opens on the universe.** `/` (and `/explore/<object>`) is a single, physically scaled explorer.
Everything else is reached *from the object you are looking at*:

| Need | Where it lives now | How you get there |
| --- | --- | --- |
| Explore, travel, compare scales | **Explorer** (`/`, `/explore/<slug>`) | default |
| Real observations of this object | **Image archive** (`/archive`, gallery, viewer) | *Images* on any object, or *Image archive* in the top bar. Browser Back returns to the same object, epoch and camera. |
| Eclipses, true-AU ruler, mission tools | **Solar Explorer** (`/solar`) | *Open in Solar Explorer* on the Sun, planets and moons |
| Constellation boundaries, DESI light cone, annotations, layer presets | **Catalogue layers** (classic SkyMap, `/skymap?classic=1`) | Command palette ⌘K → "Catalogue layers" |

Old links keep working: `/skymap?object=<id>` and `/explore?object=<id>` open the same entity in the explorer.

## Engine (frontend/src/features/explore/engine)

* **Real coordinates, float64, floating origin.** Every object has a physical position in kilometres in a
  heliocentric J2000-ecliptic world frame (right-handed, Y up). The renderer subtracts the camera position in
  float64 before anything reaches the GPU; one render unit equals the distance to the look-at point. Beyond a
  large radius, positions are log-compressed *together with their size*, which preserves the image exactly
  (angular size and direction are unchanged) while keeping float32 happy. Reverse-Z depth is requested; an
  adaptive near plane follows the closest resolved surface either way.
  The previous SkyMap placed every object on a Sun-centred, log-compressed radius in one float32 scene, so
  anything away from the Sun was distorted, and its opening labels were hard-coded CSS positions.
* **Frames.** ICRS → ecliptic → world; galactic (Hipparcos matrix) and supergalactic (de Vaucouleurs) →
  world; the Gaia sky map is sampled by converting each view direction to galactic l, b. Unit-tested.
* **Representations by apparent size, one identity.** Bodies hand over from a reflected-light point marker to
  a resolved sphere at ~1–3 px; galaxies, nebulae and clusters from a magnitude-scaled marker to a volume.
  Labels and picking are projected from the same positions every frame.
* **Camera.** Orbit camera around a tracked (possibly moving) target, smooth log-space zoom, inertia,
  pan, keyboard, touch (one-finger orbit, pinch zoom), trackpad (two-finger scroll = gentle zoom + horizontal
  orbit; pinch = precise zoom; Safari gesture events). Any manual input takes control mid-flight without a snap.
* **Flights.** van Wijk & Nuij optimal zoom-and-pan path in log distance (asinh-stable to 16 orders of
  magnitude): the departure recedes until both ends share the frame, the camera cruises, then brakes on
  approach. Duration by journey type (hop 1.1–1.9 s … intergalactic 5–7.4 s). Moving destinations are tracked
  during the flight. Reduced motion snaps.
* **Framing.** Arrival distance from the object's visual bounds (rings, system extent, projected galaxy
  disk), field of view, aspect ratio and the canvas left free by panels (the projection centre is shifted so
  the subject sits in the visible area, including above the mobile sheet). Planets arrive at a lit
  three-quarter phase; galaxies arrive along our own line of sight (Andromeda inclined, the Sombrero edge-on);
  the Milky Way from above. A manual orbit within a planetary system is preserved on the next hop.
* **Time.** Continuous simulated clock (ms, signed rate from real time to 1 year/s), shared by every layer;
  pause stays paused; tracking holds moving bodies without relaunching flights.

## Rendering (frontend/src/features/explore/render)

| Family | Treatment | Data vs illustration |
| --- | --- | --- |
| Sun | Limb-darkened disc with granulation; glare sized from apparent magnitude; drives exposure | data: radius, temperature |
| Planets & moons | Sun-directional lighting, soft terminator, Lommel–Seeliger regolith, gas-giant limb darkening; Earth day/night lights/clouds/specular ocean; atmospheric rims (Earth, Venus, Mars, Titan, giants); Saturn rings with planet shadow and ring shadow on the planet; IAU orientation | data: VSOP87C, Astronomy Engine moons, IAU WGCCRE poles; procedural surfaces for Galilean moons/Titan/Enceladus are labelled illustrative |
| Small bodies, spacecraft | Reflected-light markers that stay findable; Voyager propagated linearly from JPL Horizons vectors | data |
| Stars | All 15,448 loaded Gaia DR3 stars as points at catalogue positions; apparent magnitude recomputed per vertex from the camera (real parallax); PSF without spikes; faintness via alpha, not size (no shimmer) | data |
| Exoplanet systems | Host star body + orbits at measured semi-major axes; orientation/appearance illustrative | data + illustration |
| Clusters | 3-D populations with King-like (globular) or loose (open) profiles | size/position data, stars illustrative |
| Nebulae | Ray-marched domain-warped 3-D noise; emission/reflection/planetary/remnant/dark styles | size/position/class data, structure illustrative |
| Galaxies | One shared ray-marched volume: exponential disk + arms/young stars/dust map + bulge/bar; ellipticals as spheroids; inclination/PA from catalogue or published values | size/position/orientation data, structure illustrative |
| Milky Way | Same renderer; spiral arms drawn from Reid et al. 2019 log-spiral fits within their measured azimuth ranges (fainter where extrapolated); R0 = 8.178 kpc; 27° bar | arms data, disk/bar model illustrative |
| Gaia sky | ESA/Gaia EDR3 all-sky map oriented in galactic coordinates; valid near the Sun, handed over to the Milky Way model once you leave the neighbourhood *and* rise above the disk | data |
| Sgr A* | Schwarzschild null-geodesic integration: photon ring, Doppler-beamed thin disk, lensed background | illustrative (Sgr A* has no bright thin disk) |

Exposure adapts to what is in view (sunlit area weighted by phase, the Sun itself), so the Milky Way is vivid
in a dark-sky view and recedes behind a sunlit planet.

## Interface (ExploreChrome.tsx, explore.css)

Continuous: brand, search, Discover / Image archive / view options / share, a location rail
(Close-up · Solar System · Nearby stars · Milky Way · Local Group + "where am I" + view width), time capsule,
zoom/recentre. On demand: object panel (facts first, provenance behind "Data sources & accuracy"), Discover
(six curated journeys + categories + live catalogue status), time controls, options. Labels are a calm budget
(18 desktop / 10 mobile) plus the selection and its family; only visible objects are labelled. Mobile uses a
bottom sheet and lifts the subject above it.

## Removed or replaced

* Root dashboard as the entry point (moved to `/archive`, relabelled "Image archive").
* "First flight" modals on SkyMap and Solar entry, the fake opening labels, sparse capped Gaia field (120–480
  stars), Sun-centred compression, layer visibility thresholds, OrbitControls flight lerp.
* The unsourced `milky-way-face-on-v1.png` is no longer used by the primary explorer (no provenance recorded).
