# Solar small-body ephemeris

Date: 2026-09-02

## Scope

Solar Explorer includes the four officially recognized dwarf planets that were previously absent—Ceres, Haumea, Eris and Makemake—and five representative comets: 1P/Halley, 2P/Encke, 67P/Churyumov–Gerasimenko, 109P/Swift–Tuttle and C/1995 O1 (Hale–Bopp). Pluto remains in the established major-body path.

Each new object is searchable, selectable, focusable, date-driven and directly addressable as `/solar?object=small-body:<id>`. Dwarf-planet orbit guides remain visible as outer-system context. Comet orbit guides appear on selection so very long, highly inclined paths do not overwhelm the default atlas.

## Source receipt

Orbital and comet-nucleus physical values come from the [NASA/JPL Small-Body Database API](https://ssd-api.jpl.nasa.gov/doc/sbdb.html) using `full-prec=1`. JPL documents the returned elements as heliocentric ecliptic osculating elements at the record's stated epoch, with equinox J2000.

The public [source manifest](../frontend/public/data/solar/small-bodies/source-manifest.json) records, for every object:

- designation and SPK ID;
- orbit class and solution ID;
- element epoch in Julian Date TDB;
- last observation date and observation-arc length;
- exact API query;
- retrieval time; and
- SHA-256 of canonicalized upstream JSON.

Canonical JSON hashing recursively sorts object keys but preserves array order. This is necessary because SBDB may serialize identical values with different object-key order. `npm run ephemeris:small-bodies:check` re-fetches all nine records and fails on a meaningful source-value change.

No source imagery or third-party shape mesh is redistributed. Approximate dwarf-planet diameters missing from SBDB use the [NASA Solar System size summary](https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/), while Ceres and comet nucleus diameters use SBDB physical parameters directly.

## Coordinate and time contract

`smallBodyEphemeris.ts` evaluates each object's own element epoch rather than pretending the values share the older planet fallback epoch. For simulation Julian Date `t`:

`M(t) = M(epoch) + n × (t - epoch)`

The shared elliptic Kepler solver then derives eccentric anomaly, true anomaly, radius and heliocentric ecliptic position. The solver now permits up to 32 Newton iterations at `1e-12` step tolerance because near-parabolic comets such as Hale–Bopp do not reliably converge under the former eight-iteration planet-oriented limit.

Scientific state remains in AU in the `heliocentric-ecliptic` frame. Cinematic, educational and linear True AU projection happens only after the state is solved. Tests assert that every source-epoch state is finite and inside its published apsides, and that sampled paths reproduce the published perihelion and aphelion distances.

## Scientific boundary

The model is `jpl-sbdb-osculating-two-body`, not JPL Horizons. It propagates a single published osculating solution as an elliptic two-body orbit. It does not integrate:

- planetary perturbations;
- close-encounter solution changes;
- relativistic corrections;
- comet outgassing or other non-gravitational acceleration; or
- observational uncertainty through time.

Error therefore grows away from the source element epoch, especially for comets. The UI states this boundary beside the live orbit readout. A future high-accuracy continuation should ingest bounded Horizons state-vector windows behind the same provider contract rather than silently upgrading these claims.

## Rendering boundary

Visual treatment is deliberately downstream of the ephemeris:

- body colour is an unsourced orientation cue, not a spectral or cartographic product;
- body radius is presentation-scaled for selection and does not affect coordinates;
- Haumea uses a softly elongated glyph based on its known qualitative form, explicitly not a recovered shape model; and
- comet tails are constrained to the anti-solar scene axis, but their length and opacity are only a distance-based display heuristic inside 6 AU.

The tail is not an observed morphology, plasma simulation, dust-dynamics model or activity forecast. Its model ID and active state are exposed in the object dossier.

## Verification

Relevant checks:

```bash
cd frontend
npm run ephemeris:small-bodies:check
npm test -- --run src/domain/solar/smallBodyEphemeris.test.ts src/features/solar/solarRoutes.test.ts
npx tsc --noEmit
```

