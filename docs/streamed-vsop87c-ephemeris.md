# Streamed VSOP87C ephemeris

Solar Explorer and the SkyMap solar bridge use a bounded, versioned VSOP87C browser asset rather than shipping the complete theory evaluator to every visitor. The generated data preserves the former runtime contract: heliocentric rectangular ecliptic coordinates are evaluated at integer Julian dates and linearly interpolated in Cartesian space between adjacent one-day Float64 keyframes.

## Source and claim boundary

- Theory: Bretagnon and Francou's VSOP87 solutions, with the official [IMCCE VSOP87 distribution](https://ftp.imcce.fr/pub/ephem/planets/vsop87/) as the theory source.
- Pinned implementation: [`vsop87` 1.0.5](https://www.npmjs.com/package/vsop87), MIT licensed, used only by the offline builder.
- Frame: heliocentric ecliptic rectangular coordinates, J2000 reference frame, in astronomical units.
- Runtime validity: 2025-01-01 through 2050-12-31 UTC. Dates outside that window use the visible Keplerian fallback.
- Supported bodies: Mercury through Neptune. Pluto remains on the separately disclosed Keplerian model.

This planetary asset is a visualization ephemeris, not an operational navigation product. It does not add covariance, Earth-orientation inputs, light-time handling or contemporary JPL/INPOP fitting. The shared Solar provider supplements it with the separately receipted analytical Moon and Galilean state models described in `controlled-satellite-ephemerides.md`; those states are not embedded in the VSOP87C binaries.

The exact package version, implementation path, implementation hash, licence hash, validity, planet order and sampling choices are recorded in `frontend/ephemeris-source/vsop87c-2025-2050.receipt.json` and copied into the generated manifest.

## Deterministic build

```bash
cd frontend
npm run ephemeris:build
npm run ephemeris:check
```

The builder produces:

- 26 overlapping yearly position blocks under `public/ephemerides/vsop87c/`;
- one 192-sample-per-planet representative orbit-guide block;
- a manifest containing SHA-256 Subresource Integrity values for every binary;
- 1,871,808 aggregate binary bytes across all years and the orbit guide.

`ephemeris:check` rebuilds everything in memory and fails if any checked-in output is missing or stale.

## Binary format

All `.svep` files use `spaceviewer-vsop87c-float64-v1`:

- 64-byte little-endian header with `SVEP` magic, schema, asset kind, planet count, sample count, start Julian date, step, year and scalar stride;
- yearly positions in sample-major, planet-major, XYZ order;
- representative orbits in planet-major, sample-major, XYZ order;
- Float64 scientific coordinates throughout decoding and interpolation.

The runtime checks manifest invariants, expected length, binary headers and SHA-256 integrity before a block becomes active. It retains at most three yearly blocks in memory.

## Runtime behaviour

The initial Solar canvas uses the existing Keplerian element solver and remains selectable, navigable and time-controllable. After the first paint, an idle callback requests the manifest and only the current year's roughly 70 KB position block. Solar Explorer also requests the roughly 37 KB representative orbit guide; SkyMap does not.

When the position block verifies, the shared provider switches major planets to VSOP87C without remounting either WebGL canvas. A visible status reports `Keplerian boot`, `loading precision`, or the active `VSOP87C` year. Structured renderer diagnostics report status, model, active and resident years, orbit-guide state and transferred bytes. Moon, Io, Europa, Ganymede and Callisto are evaluated synchronously from the separately pinned analytical package for the same UTC; their dossier and diagnostics expose the active satellite model independently of the planetary block.

Orbit-guide failure does not delay or disable precise planet positions. Any manifest, network, integrity, format or range failure leaves the explicit Keplerian fallback active.

## Production effect and verification

The previous production build emitted a 2,390.96 KB minified VSOP87 JavaScript chunk (825.32 KB gzip). The streamed build emits no VSOP87 runtime JavaScript chunk; `vsop87` is now a development-only build input. With the tree-shaken analytical Moon/Galilean evaluator included, the current Solar route chunk is 138.55 KB minified (40.65 KB gzip), up from the 135.26 KB/39.95 KB pre-satellite baseline. A normal active-year Solar session still requests only the planetary manifest, one yearly block and the orbit guide; satellite states add no position-data request.

Automated coverage validates the source/aggregate contract, direct parity with the pinned one-day interpolation for Earth and Jupiter, representative orbit decoding, corrupt headers, active-year-only fetching, deferred fallback interactivity and the absence of a VSOP87 JavaScript resource.
