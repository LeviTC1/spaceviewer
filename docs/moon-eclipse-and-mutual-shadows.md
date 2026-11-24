# Parent-planet and mutual moon eclipses

Selected moons now use the same finite solar-disc occultation kernel as planet-received moon shadows. The renderer can show a parent planet eclipsing its moon and one major moon casting a shadow across another without deriving event geometry from the compressed presentation scene.

## Geometry contract

For the selected target moon, the runtime evaluates:

- the parent planet as a spherical occluder;
- every other major moon in the same parent system as a possible mutual-eclipse occluder;
- the target-to-Sun, target-to-occluder and physical-radius inputs in AU and kilometres before any scene projection.

The finite apparent discs use exact circular-overlap area. Conservative umbra/antumbra/penumbra cone intersection prevents unrelated bodies from mounting shader work. The selected moon receives at most one pointer-passive spherical layer per candidate, using the same target-radius coordinate contract as the planetary eclipse path.

## Source and accuracy

- Eclipse terminology and finite-disc geometry follow [NASA eclipse geometry](https://science.nasa.gov/eclipses/geometry/).
- Solar radius conversion uses the exact nominal constant in [IAU 2015 Resolution B3](https://www.iau.org/static/resolutions/IAU2015_English.pdf).
- Parent positions use the current VSOP87-or-Keplerian planet provider.
- Earth's Moon uses Astronomy Engine 2.1.19's Brown/Improved-Lunar-Ephemeris-derived geocentric state. Io, Europa, Ganymede and Callisto use its implementation of the [IMCCE L1.2 Galilean theory](https://ftp.imcce.fr/pub/ephem/satel/galilean/L1/L1.2/). Both are rotated from EQJ into SpaceViewer's J2000 mean-ecliptic axes.
- Other moons retain the existing parent-relative circular seed model and are labelled accordingly.

Consequently, the light geometry is internally physical for the supplied states, and Moon/Galilean event timing no longer depends on the presentation seed orbit. The controlled five also have a separate date-evaluated NAIF body-frame contract, but the shadow solver remains spherical and does not use surface topography. It remains a visualization product: production prediction still requires controlled time-scale and light-time handling, higher-accuracy attitude and shape models, topocentric/ground-track treatment and independently qualified ephemerides. Limb topography, atmosphere/refraction and non-spherical occluders are not modeled.

## Rendering and quality

Ultra, High and Balanced render selected-moon eclipse candidates. Low/mobile preserves the geometry readout but removes the additional surface layers. The former selected-moon halo now renders as a back-face, depth-passive rim so it cannot mask the moon surface or write over scientific shadow layers.

The moon dossier exposes the satellite status/model, native and runtime frames, current parent distance and velocity-derived speed, candidate count, occluder name, parent-versus-mutual classification, center obscuration where applicable, theory/release and generated-manifest links, and the prediction boundary. Runtime diagnostics separately report the satellite model/control/velocity state, candidate IDs and the actual mounted pass count.

## Verification

- Europa at simulation day 15 (2025-01-16 in the route clock) is fully center-obscured by Jupiter and drives the browser fixture.
- Europa has a controlled mutual-event candidate from Io near 2026-05-11T01:56Z; the exact center fraction also depends on whether the current planetary VSOP87 block or visible Keplerian boot state supplies the Sun direction.
- Unit tests cover both event classes and compare position/velocity states with pinned JPL Horizons fixtures. Browser smoke checks the Europa readout, analytical model, runtime candidate/pass diagnostics, Low/mobile disablement and restoration to Auto, then checks the separate controlled lunar dossier.
- Headed desktop inspection verifies that Europa visibly darkens; a stale depth-writing selection shell discovered during QA was replaced with the depth-passive rim.
