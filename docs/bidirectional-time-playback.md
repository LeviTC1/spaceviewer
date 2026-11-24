# Bidirectional simulation time

SpaceViewer uses one explicit playback-direction contract across Solar Explorer and SkyMap. Direction is stored as `forward` or `reverse`; speed remains a positive magnitude. Both clocks pass through the same bounded UTC advance primitive, so a negative number is never ambiguously treated as either a direction or malformed input.

## Surface behavior

### Solar Explorer

- Date interval: 2025-01-01 through 2050-12-31.
- Playback magnitudes: 1, 10 and 100 simulation days per real second.
- Reverse playback updates the same VSOP87C/planetary fallback date used by forward playback.
- The controlled Moon and Galilean analytical states are re-evaluated at that same bounded UTC in either direction; other moon paths retain their disclosed circular seeds.
- The signed direction also reverses the visible planet, cloud and solar-surface rotational flow while playback is active.
- Reaching either date boundary clamps the clock and pauses playback automatically.

The rotational motion remains a presentation aid: its accelerated visual rate is not a claim that the bodies physically spin once per selected simulation day. Planet positions and the selected UTC alignment remain the scientific clock outputs.

### SkyMap

- Date interval: 1900-01-01 through 2100-12-31.
- Playback magnitudes: 1, 7, 30 and 365 simulation days per real second.
- The Solar bridge resolves its approximate positions from the signed clock.
- Gaia DR3 positions propagate in either temporal direction from J2016.0. Worker updates remain quantized to one-twelfth of a Julian year so playback does not upload visually insignificant daily position changes.
- Deep-space landmarks, the fixed IAU J2000 boundary guide, the static 2019 Milky Way tracer/arm-fit layer, and the schematic cosmological layer remain time invariant and disclose that behavior in their layer metadata.
- Reaching either date boundary clamps the clock and pauses playback automatically.

## Interaction and accessibility

Both time surfaces expose the same labelled **Playback direction** button group. `Reverse` and `Forward` publish their state with `aria-pressed`, may be changed while paused or playing, and do not alter the selected speed magnitude. Date selection, manual stepping and **Now** continue to pause or restore the clock according to each surface's existing behavior.

## Verification

- Pure unit tests cover equal-magnitude forward/reverse advancement, invalid intervals and both boundary clamps.
- SkyMap reducer tests cover reverse advancement and automatic pause at the 1900 boundary.
- The desktop smoke journey asserts that Solar's slider value decreases under reverse playback, that SkyMap's UTC date decreases under reverse playback, and that both surfaces return to forward/present-time state.
- Mobile smoke coverage continues to exercise both time-control layouts as part of the complete route suite.

## Known boundaries

- SpaceViewer and EarthViewer still use separate runtime clocks; the surface bridge transfers an ISO timestamp rather than maintaining a shared live process.
- Gaia propagation uses published DR3 radial velocity for 13,492 catalogue sources and a disclosed zero fallback for 1,956. Selected-star angular uncertainty uses the published within-source astrometric correlations, but the runtime still omits light-time, non-single-star acceleration solutions and full six-parameter Jacobian covariance propagation.
- Pluto retains its explicitly labelled lower-precision planetary model. Mars, Saturn, Uranus and Neptune system moons retain seed paths; Earth's Moon and the four Galilean moons use their separately receipted analytical states inside the Solar 2025–2050 window.
- The Sun's moving texture layers and accelerated body spin are visual motion cues, not IAU rotation solutions.
