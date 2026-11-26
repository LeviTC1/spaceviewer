# SpaceViewer universe roadmap

Ten upgrades to the universe model, delivered two at a time. Each phase pairs something that changes how
the universe *looks* with something that changes what it *knows*. Every data source is public, credited
and checked for its licence before it ships.

| Phase | Ships | Why these together |
| --- | --- | --- |
| **1 — Real data, real pictures** (done, 24 Nov 2026) | **#4 Real surfaces & photographs** · **#7 A Milky Way made of real stars + every known exoplanet** | The two biggest visual gaps. They lift every flight without changing how you use the explorer. |
| **2 — Your sky** (done, 26 Nov 2026) | #1 The sky from anywhere (3-D constellations that fall apart as you travel) · #2 Tonight's sky from where you are | #7's star field makes #1 possible; #2 is the daily reason to return. |
| **3 — Things that move** (done, 26 Nov 2026) | #3 Live spacecraft (ISS, Hubble, JWST at L2, Parker, New Horizons, ride-along Moments) · #9 Small bodies done properly (real asteroid orbits, comet tails, Kuiper Belt) | One orbit-propagation layer serves both. |
| 4 — Understanding scale and light | #5 Scale tools (ruler, "drop Earth here", overlays) · #6 Light-delay mode (Rømer's measurement as a Moment) | Teaching tools on top of a now-complete universe. |
| 5 — Beyond and together | #8 Beyond the Local Group (DESI, galaxy surveys, Laniakea) · #10 Narrated tours & classroom mode | The farthest scales, then shareable guided lessons across everything. |

## Phase 1 in detail

### #4 Real surfaces and real photographs in 3-D
- **Surfaces:** replace the procedural Io, Europa, Ganymede, Callisto and Titan with public-domain
  global mosaics (USGS Astrogeology / NASA–JPL). Check every planet and moon texture for resolution
  and provenance.
- **Photographs in place:** every catalogued galaxy, nebula and cluster gets a sky-registered photograph:
  - north-up, at its true angular size, reprojected in the browser from the DSS2 colour HiPS survey (served
    by ESA ESASky; CDS hips2fits was offline when this was built);
  - placed in 3-D facing Earth;
  - fading into the volumetric model as you fly off our line of sight, labelled "photograph, as seen from
    Earth".
- **Done means:** the six procedural moons are real maps, any deep-sky object shows its real photograph
  when viewed from the Solar System, and frame times hold at p95 ≤ 17 ms on the M1 Pro.

### #7 A Milky Way made of real stars, and every known exoplanet
- **Stars:** grow from 15,448 nearby Gaia DR3 stars to about 1–2 million all-sky stars with good
  parallaxes, streamed as tiles with level of detail, so nearby and bright stars come first and the
  galaxy fills in as you move.
- **Exoplanets:** every confirmed planet in the NASA Exoplanet Archive (about 5,900), each host star
  placed in 3-D, with habitable zones drawn from stellar luminosity and labelled as derived.
- **Done means:**
  - the explorer starts no slower than today;
  - stars stream in without frame hitches;
  - memory stays under about 400 MB on the laptop;
  - every star and planet links back to its catalogue record.

## Phase 1 progress (24 Nov 2026)

| Piece | Status | Notes |
| --- | --- | --- |
| Real moon maps | Done | Moon (NASA SVS LRO colour, 8K), Io, Europa, Ganymede, Callisto, Titan, Enceladus, Tethys, Triton from USGS mosaics; 4K by default, 8K streamed close up on High/Ultra. Tints and gap fills are disclosed in the panel and `public/solar-textures/moons/manifest.json`. |
| Sky photographs in 3-D | Done | `hips.ts` + `skyPhotoWorker.ts` build a north-up TAN cutout from DSS2 colour tiles off the main thread; `SkyPhotoLayer` hangs it at the object's true place and size, subtracts the sky background, and fades by viewing angle (5°→25° off our line of sight) while the volume dims underneath. Verified on M31 and M42. |
| Every known exoplanet | Done | 6,445 planets around 4,837 hosts (PSCompPars); conservative habitable zones (Kasting 1993) drawn as rings and listed as derived facts. |
| Gaia galaxy stars | Done | 752,604 Gaia DR3 stars (G ≤ 10.5, parallax/error ≥ 5) on top of the 15,448 nearby ones, in 5 brightest-first chunks (11.3 MB) streamed after start-up. `fetch-gaia-dr3-galaxy.mjs` slices the sky by HEALPix `source_id` ranges to fit ESA's 60 s anonymous job limit. Naked-eye exposure at home, up to 3 mag deeper once you leave the solar neighbourhood. Headless check: p95 16.7 ms, heap ≈ 160–230 MB. To reach 1–2 M, rerun with G ≤ 11.5. |
| 8K planet maps | Deferred | Solar System Scope's 8K downloads failed; revisit with public-domain NASA mosaics. |

## Phase 2 progress (26 Nov 2026)

| Piece | Status | Notes |
| --- | --- | --- |
| Naked-eye stars Gaia cannot measure | Done | 1,060 XHIP / Hipparcos stars (Sirius, Rigel, Betelgeuse…) that are missing from Gaia DR3 or fail its cuts, cross-matched against both Gaia layers (≤ 2.5″ at J2016) so nothing is drawn twice. `catalog:sky:fetch` + `catalog:sky:build` → `public/catalogs/sky/`. |
| 3-D constellation figures (#1) | Done | All 88 IAU figures (d3-celestial, BSD-3-Clause) snapped to real stars and drawn between their true 3-D positions, so they match the sky from the Solar System and come apart elsewhere. Names travel with the figure; a star's panel gives its figure's real distance spread and a "Watch it come apart" flight. Toggle in View options. |
| Named stars as places | Done | 331 IAU-named stars (WGSN) are searchable and flyable. The 54 curated nearby stars had placeholder positions; `catalog:nearby-seed:fix` replaced them with SIMBAD positions, parallaxes, spectral types and V magnitudes. |
| Tonight's sky (#2) | Done | `/tonight` or the Tonight button: stand on the Earth with a real horizon, compass points, daylight / twilight sky and exposure, the Milky Way only once it is properly dark. Location defaults to the time zone's city (tz database, no permission) or the browser's location, kept on the device. The card lists sunset, darkness, sunrise, the Moon's phase, planets with Mallama & Hilton magnitudes, deep-sky picks and constellations overhead; tapping turns the view. Sidereal time IAU 1982, precession IAU 1976; checked against the almanac for London, Sydney and Tromsø. |
| Known limits | — | No atmospheric refraction or extinction; nutation ignored (≤ 20″). Until the VSOP87 block streams in, planets use Keplerian fallback elements that run several degrees off; the card recomputes when the ephemeris arrives. |

## Phase 3 progress (26 Nov 2026)

| Piece | Status | Notes |
| --- | --- | --- |
| Planet ephemeris fixed | Done | The streamed planets came from VSOP87**C** (ecliptic *of date*) while labelled J2000, so every planet sat ~0.36° off the stars and flybys could not line up; now VSOP87**A** (J2000), 1975–2050, with cubic Hermite interpolation (Earth within ~10 km of the theory, was ~6,000 km). The Keplerian fallback used rounded periods (a 365-day year drifted ~7° since 2000); now within 1.5° of VSOP87 for 2000–2040. Pluto comes from JPL Horizons (Astronomy Engine as fallback). |
| Live spacecraft (#3) | Done | JWST, Parker Solar Probe, New Horizons, Voyager 1 & 2, Juno, Europa Clipper, Lucy, Psyche, BepiColombo and Juice on JPL Horizons trajectories (`catalog:spacecraft:build`: 6-hour states refined to 1 minute around flybys, thinned for Hermite interpolation to ≤ 8 km; 1.7 MB). ISS, Hubble and Tiangong by SGP4 from CelesTrak elements, relayed by `/api/tle` with a two-hour cache (CelesTrak blocks faster polling) and a bundled snapshot. Simple silhouettes from published dimensions, the selected mission's whole path, live speed and altitude. Checked: Juno 76,951 km from Jupiter's centre at perijove 1 (NASA ≈ 75,700), New Horizons passes Pluto, Parker's 6.9 million km perihelion, JWST ~1.5 million km out, ISS ~420 km up. |
| Ride-along Moments | Done | New camera mode follows a spacecraft: New Horizons at Pluto, Juno's first perijove, Parker's record perihelion, Webb arriving at L2, Voyager 2 at Neptune; Halley 1986 now seen from Earth with its tails. |
| Small bodies (#9) | Done | 103,378 orbits from the JPL Small-Body Database (main belt to H 15, Trojans, near-Earth asteroids, centaurs, Kuiper Belt; `catalog:minor-bodies:build`, 2.6 MB), solved on the GPU every frame and faded by on-screen scale; 68 largest (Vesta, Pallas, Sedna, Quaoar…) are searchable places. Comet tails: ion tail anti-sunward, dust tail curving back along the orbit, length from distance to the Sun and nucleus size (a geometric model, labelled as such). Toggle in View options. |
| ISS passes tonight | Done | The Tonight card lists visible ISS and Tiangong passes (above 10°, sunlit, Sun below −6°) from the same SGP4 orbit. |
| Known limits | — | Two-body orbits for asteroids drift by up to a few degrees over decades for Jupiter-perturbed objects. Spacecraft attitudes are simplified (dish or shield to the Sun; orbiters nadir-down). The `solar` and `camera-flights` smoke checks fail on the committed baseline too (Solar Explorer selectors), unrelated to this phase. |
