# Planetary eclipse and moon-shadow model

Solar Explorer renders major-moon eclipse shadows on a selected planet from the current scientific-unit geometry. The effect is deterministic in simulation time and independent of the exaggerated scene spacing used to keep planets and moons visible.

## Source contract

- Eclipse terminology and the finite umbra/antumbra/penumbra model follow [NASA's eclipse geometry reference](https://science.nasa.gov/eclipses/geometry/).
- The solar disc uses the exact 695,700 km nominal solar-radius conversion factor from [IAU 2015 Resolution B3](https://www.iau.org/static/resolutions/IAU2015_English.pdf). The nominal value is a conversion constant, not a claim about an instantaneous photospheric radius.
- Planet and moon radii come from the existing rounded Solar object records. Major-planet positions use the shared VSOP87C provider. Earth's Moon and Jupiter's four Galilean moons use the pinned analytical states documented in `controlled-satellite-ephemerides.md`; other moons retain the disclosed parent-relative circular approximation.

Both references were retrieved on 2026-09-02. Their URLs and claim boundaries are registered in the shared attribution registry. No source media is redistributed.

## Geometry

All eclipse calculations happen before render-scale projection:

1. The target-to-Sun and target-to-moon vectors remain in heliocentric-ecliptic astronomical units.
2. Physical radii and distances are converted into target-planet-radius units.
3. A conservative cone-intersection test rejects moons whose penumbra cannot reach the target sphere.
4. For each surviving moon and each rendered surface fragment, the shader calculates the apparent angular radii of the Sun and moon from that surface point.
5. Exact circular-disc intersection area determines the fraction of the solar photosphere hidden at that point. That continuous fraction produces the umbra, antumbra and penumbra instead of painting a fixed dark spot.

The surface shader receives scene-axis directions but physical target-radius distances. Cinematic, Educational and True AU spacing therefore produce the same eclipse geometry.

## LOD and quality contract

Only the selected planet mounts the eclipse shell, because a sub-pixel shadow on a distant body is not useful work. Ultra, High and Balanced enable the analytic layer; Low/mobile disables it. The selected object dossier and runtime diagnostics expose the model ID, current candidate count, candidate moon IDs and quality state.

The overlay is pointer-passive, does not interfere with selection, and sits between the lit surface/detail layers and the atmosphere shell. Each cone candidate is one bounded shader draw; no geometry is rebuilt per frame and no remote request is required.

## Scientific boundary

This is an illustrative finite-disc lighting model, not an eclipse prediction service:

- event timing is improved only for the controlled Moon and Galilean states; remaining circular moon orbits are non-predictive;
- the Sun and moons are treated as spherical discs;
- light-time, solar limb darkening, atmospheric refraction, diffraction, terrain and irregular moon limbs are not modeled;
- only major moons can shadow their parent planet;
- surface irradiance/temperature response remains future work. Parent-planet and mutual major-moon shadows are now owned by the selected-moon eclipse model; planet-received ring shadows are owned by the separate source-backed ring-transmission model.

The UI uses “candidate” for the conservative cone stage and displays each candidate's actual orbit model next to the renderer state. Neither the analytical satellite inputs nor the finite-disc shader turn this into an operational prediction or ground-track product.

## Verification

Pure tests cover disjoint, contained and partially overlapping discs; a physical Earth-Moon-Sun alignment; a cone that misses the target; and deterministic controlled Jupiter major-moon events in the shared provider. Browser smoke opens the dated Jupiter route, asserts the visible source-carrying readout and runtime candidate, then verifies that Low/mobile disables the shader and Auto restores the governed quality path.
