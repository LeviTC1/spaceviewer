# Camera-flight navigation

Solar Explorer and SkyMap retain renderer-native camera movement inside their own scale domains. Both now expose the same cancellation and accessibility contract without claiming that their compressed scene coordinates form one physical ruler.

## Shared interaction contract

An active flight publishes a short `CameraFlightState` containing its renderer surface and human-readable destination. The UI renders that state as a temporary `role="status"` instrument with:

- the destination or camera-mode action;
- an accessible **Cancel flight** button;
- an instruction that drag, tap or `Escape` cancels the movement.

The status is temporary and does not reserve permanent canvas space. Solar renders its fixed instrument through a body portal so it remains above the scale journey without changing the stacking order of the whole Solar control surface. SkyMap keeps the same instrument inside its map frame.

## Ownership and cancellation

Flight request tokens start movement. Live ephemeris, catalogue, camera-distance and diagnostics updates do not restart it.

Solar keeps interpolation progress in a ref and cancels the active flight on button/`Escape` requests, OrbitControls pointer or touch start, or tracking activation. The latest simulation time and planet positions are sampled when a request token starts a flight; advancing the clock cannot silently relaunch a cancelled movement.

SkyMap uses the same external cancel token and status callback. Object-focus and overview-reset requests start transitions, while pointer or touch input cancels the transition before switching the navigation state to free exploration.

The demand-render helper keeps `requestRender` stable while publishing current diagnostics separately. This prevents diagnostic object churn from becoming camera-flight input.

## Reduced motion

If the operating system requests reduced motion, the saved in-app preference is enabled, or `body.reduce-motion` is active, both renderers snap directly to the requested camera and target pose. No camera-flight status is mounted because there is no animated movement to cancel.

## Verification

Pure tests cover the shared motion-preference and flight-state contract. The Playwright `camera-flights` journey verifies:

1. Solar destination status and button cancellation;
2. Solar cancellation through a real pointer drag;
3. Solar cancellation through `Escape`;
4. SkyMap cancellation through `Escape` and the button;
5. reduced-motion snapping with no animated status in either renderer.

The full smoke matrix also rechecks renderer lifecycle, object history, desktop and 390×844 layouts, texture timeout recovery, three desktop Solar cold loads and two mobile Solar cold loads.
