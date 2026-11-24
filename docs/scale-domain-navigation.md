# Scale-domain navigation and renderer handoffs

SpaceViewer presents one ordered astronomical journey while retaining separate renderers where the current runtime and scientific representations differ. The interaction is continuous at product level, but it never describes compressed scene coordinates as one physical ruler.

## Renderer-surface mapping

| Scale domain | Active surface | Transition behavior |
|---|---|---|
| Surface | EarthViewer bridge | Timed departure before the versioned external handoff |
| Planetary | Solar Explorer | Native Solar camera flight |
| Solar | Solar Explorer | Native Solar camera flight |
| Stellar | SkyMap | Native SkyMap focus flight after renderer entry |
| Galactic | SkyMap | Native SkyMap focus flight |
| Local Group / deep space | SkyMap | Native SkyMap focus flight |
| Cosmological | SkyMap | Native SkyMap focus flight |

`buildScaleTransitionPlan()` owns this mapping. It combines the ordered-domain transition from `ScaleDomainManager` with the target path from `ReferenceFrameManager`, producing inward/outward direction, adjacency, renderer-swap state and the target frame hierarchy without putting UI policy into either renderer.

## Handoff contract

A user event determines the final destination before navigation begins. When source and target use different renderer surfaces, `App` performs two short phases:

1. **Departing** brings an opaque astronomical instrument over the current canvas.
2. The route and renderer change while that instrument is opaque.
3. **Arriving** fades the same instrument over the target renderer.

The overlay identifies the source and target domains and shows the last four target reference frames with their `physical`, `derived` or `visualization` interpretation. It is a representation-boundary cue, not a loading claim or a simulation of travel time.

Moves within Solar Explorer or within SkyMap do not invoke the overlay. Those surfaces already preserve spatial comprehension with their own camera flights and scale-band controls, so hiding them would make navigation less informative.

Those native movements share a destination status plus button, `Escape` and manual-input cancellation contract. See [camera-flight-navigation.md](camera-flight-navigation.md).

## History and entry points

The coordinator is event-driven and shared by:

- the seven-step scale journey;
- header mode navigation;
- global command and object jumps;
- SkyMap's “Open in Solar Explorer” handoff;
- browser Back/Forward when the history entry crosses Solar and SkyMap.

Solar and SkyMap object-selection Back/Forward remains in place inside the mounted renderer. A route refinement therefore does not animate or remount merely because its URL changes.

## Reference-frame breadcrumb

The journey bar shows the active domain plus the last three frames on its authoritative root-to-current path. Examples include `Milky Way / Local stellar neighbourhood / Heliocentric ecliptic` for Solar and `Local Group / Milky Way / Local stellar neighbourhood` for the stellar domain. Full origin and axis descriptions remain available through the item title and the same definitions drive the transition overlay.

The breadcrumb describes frame ancestry, not physical containment at one uniform visual scale.

## Accessibility and reduced motion

The handoff is a short `role="status"` region with an assertive route announcement. It accepts no focus and temporarily blocks pointer input so a second destination cannot race the first transition.

If the operating system requests reduced motion or the in-app preference adds `body.reduce-motion`, navigation commits immediately and no transition overlay mounts. CSS also disables transition animations defensively if the preference changes during a handoff.

## Verification

Pure tests cover renderer mapping, direction, same-surface behavior and target-frame ancestry. The Playwright `scale-journey` smoke flow:

1. enters Solar Explorer and verifies the heliocentric breadcrumb;
2. selects the stellar domain;
3. checks the Solar-to-stellar overlay and target frame hierarchy;
4. verifies the Solar canvas unmount and one mounted SkyMap canvas;
5. returns through the inward transition;
6. replays both directions with browser Back/Forward;
7. enables reduced motion and confirms that the overlay is absent.

Headed inspection at 1280×720 confirms that both handoff directions mask the hard canvas boundary without obscuring the arrived workspace beyond the sub-second transition window.

## Known boundary

This is not a shared WebGL scene, a floating-origin flight over every physical scale, or proof that EarthViewer and SpaceViewer can safely share one Three.js runtime. A future renderer-preserving handoff should be evaluated only after React/R3F/Three version convergence and memory profiling. Until then, the explicit crossfade is the honest browser-native boundary.
