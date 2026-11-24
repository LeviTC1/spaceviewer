# Controlled Moon and Galilean ephemerides

Solar Explorer and the SkyMap Solar layer now share date-addressable parent-relative state vectors for Earth's Moon and Jupiter's four Galilean moons. This removes those five bodies from the former circular seed path while preserving an explicit fallback for every unsupported moon.

## Source and receipt contract

- Runtime implementation: [Astronomy Engine 2.1.19](https://github.com/cosinekitty/astronomy/releases/tag/v2.1.19), exact npm version, MIT licensed.
- Release tag and commit: `v2.1.19`, `61dc07020aaa6885d2c7f688a4d82beaf6edb9ef`.
- Lunar model: Astronomy Engine's geocentric `GeoMoonState`, based on the Nautical Almanac Office Improved Lunar Ephemeris and Brown lunar theory.
- Galilean model: Astronomy Engine's jovicentric `JupiterMoons`, based on the [IMCCE L1.2 analytical theory](https://ftp.imcce.fr/pub/ephem/satel/galilean/L1/L1.2/) for Io, Europa, Ganymede and Callisto.
- Valid SpaceViewer interval: 2025-01-01T00:00:00Z through 2050-12-31T23:59:59.999Z. Outside this interval the provider makes no analytical claim and the caller uses the disclosed seed fallback.

`frontend/ephemeris-source/astronomy-engine-2.1.19.receipt.json` pins the npm tarball integrity, release commit, MIT licence digest and installed JavaScript/type/manifest file digests. `frontend/public/ephemerides/satellites/manifest.json` is the public, generated subset of that contract. Both the package and IMCCE theory have verified entries in the shared attribution registry.

The manifest is metadata, not a sampled position file. Runtime states are evaluated locally from the pinned implementation; playback does not make per-frame ephemeris requests.

## Frame and unit path

The package returns position and velocity in astronomical units and astronomical units per day:

1. the Moon state is geocentric in the package's EQJ J2000 mean-equator frame;
2. Galilean states are jovicentric in the same EQJ axes;
3. `Rotation_EQJ_ECL` and `RotateState` rotate both position and velocity into J2000 mean-ecliptic axes;
4. the shared Solar provider adds the parent planet's heliocentric position only after preserving the parent-relative vector;
5. render projection converts the scientific vector to exaggerated scene spacing at the final boundary.

The vector type retains the existing `heliocentric-ecliptic` axis label because it describes the global orientation used throughout Solar Explorer; the satellite dossier separately discloses geocentric or jovicentric origin so the relative vector is not mistaken for a heliocentric one.

Position state and body attitude remain separate contracts. The same five controlled bodies now have date-evaluated Moon/Galilean frames sourced from NASA/JPL NAIF `pck00011.tpc`; their receipt, fallback boundary and verification commands are documented in `planetary-body-orientation.md`.

## Runtime ownership

- One epoch cache shares a single lunar or four-body Galilean evaluation across consumers at the same selected UTC.
- Orbit guides sample the analytical path over one nominal body period and use a bounded 32-entry day-keyed cache. They are no longer forced circles for these five bodies.
- The shared `getSolarObjectState` contract carries actual parent-relative velocity. Solar Mission Control and the moon dossier use its magnitude for current orbital speed.
- Planet/moon eclipse geometry and SkyMap consume the same shared states; their provenance records the actual analytical or fallback model.
- Renderer diagnostics expose selected satellite model, control status and velocity availability. Unsupported bodies such as Titan remain `parent-relative-circular` with no manufactured velocity.

## Accuracy and claim boundary

Astronomy Engine documents a target of about one arcminute for its supported astronomy calculations. Its v2.1.19 validation suite compares each Galilean moon against 5,001 NASA/JPL Horizons fixtures with relative position and velocity tolerances of `0.0009`.

SpaceViewer adds an independent five-body fixture at 2025-01-01T00:00:00Z. It compares ECLIPJ2000 position and velocity with JPL Horizons target 301 and 501–504 vectors, using the package's corresponding TT/TDB epoch, and enforces the same relative tolerance. This validates the package-to-SpaceViewer frame and state wiring; it does not certify the application for navigation.

The remaining boundaries are explicit:

- no spacecraft-navigation or operational occultation guarantee;
- no light-time correction, limb topography, libration/attitude, non-spherical figure or ground-track solution in this layer;
- the parent planet may still be on the visible Keplerian boot state until its VSOP87C year block verifies;
- moons outside the controlled five-body subset retain circular seed positions and illustrative event timing;
- the app's 2025–2050 window is narrower than the mathematical package's possible input range and is enforced as the product claim boundary.

## Deterministic checks

```bash
cd frontend
npm run ephemeris:satellites:build
npm run ephemeris:satellites:check
npm test -- --run tests/controlledSatelliteEphemeris.test.ts tests/eclipseGeometry.test.ts
```

The check regenerates the public manifest in memory and fails on receipt, package-version, installed-file, licence or generated-output drift. Browser smoke separately verifies a controlled Europa eclipse dossier, a controlled lunar dossier, generated-manifest links, velocity diagnostics and the Low/mobile eclipse fallback.
