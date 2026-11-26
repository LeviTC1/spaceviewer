// Explorer camera: an orbit camera around a (possibly moving) target, expressed in float64 kilometres,
// with flights, inertia and trackpad/mouse/touch/keyboard input. Pure logic — the renderer reads the
// resulting pose every frame and never stores world positions in float32.

import { planFlight, sampleFlight, type FlightKind, type FlightPlan } from "./flight";
import { altAzToWorld, type HorizonFrame } from "./observer";
import { cross3, dot3, normalize3, slerpUnit3, sub3, length3, type Vec3 } from "./units";

export interface CameraTargetInfo {
  id: string | null;
  world: Vec3;
  /** Minimum allowed camera distance from the look-at point (km). */
  minDistance: number;
  /** Preferred orbit axis ("up") for this target. */
  up: Vec3;
}

export interface CameraPose {
  target: Vec3;
  distance: number;
  direction: Vec3;
  up: Vec3;
  world: Vec3;
}

export interface ActiveFlight {
  plan: FlightPlan;
  startedAt: number;
  toId: string | null;
  label: string;
  kind: FlightKind;
}

export type CameraEvent =
  | { type: "flight-start"; flight: ActiveFlight }
  | { type: "flight-end"; toId: string | null; interrupted: boolean }
  | { type: "manual" };

const MIN_POLAR = 0.035;
export const MAX_CAMERA_DISTANCE_KM = 6e22;

const rotateAround = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  // Rodrigues' rotation formula.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = axis;
  const kxv = cross3(k, v);
  const kdv = dot3(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
};

export class ExplorerCamera {
  targetId: string | null = null;
  /** Look-at point when no target is tracked, or the last resolved target position. */
  lookAt: Vec3 = [0, 0, 0];
  /** Pan offset from the tracked target (km). */
  panOffset: Vec3 = [0, 0, 0];
  direction: Vec3 = normalize3([0.35, 0.45, 1]);
  up: Vec3 = [0, 1, 0];
  logDistance = Math.log(4e8);
  logDistanceGoal = Math.log(4e8);
  orbitVelocity: [number, number] = [0, 0];
  flight: ActiveFlight | null = null;
  minDistance = 1e-3;
  reducedMotion = false;
  /** Time of last deliberate manual orbit, used to preserve the user's chosen angle on short hops. */
  lastManualOrbitAt = -Infinity;
  /** Gentle yaw (rad/s) for the opening scene; cleared by any manual input or flight. */
  idleSpin = 0;
  listeners = new Set<(event: CameraEvent) => void>();
  private lastTargetWorld: Vec3 | null = null;

  // ------------------------------------------------------------------------------------------
  // Standing on the ground: a look-around camera at an observer on the Earth's surface. Drags turn
  // the view (azimuth / altitude), zoom changes the field of view like a pair of binoculars.
  ground: { latDeg: number; lonDeg: number } | null = null;
  groundAzDeg = 180;
  groundAltDeg = 30;
  groundFovDeg = 70;
  groundFovGoal = 70;
  private groundSlew: { fromAz: number; fromAlt: number; toAz: number; toAlt: number; startedAt: number; durationMs: number } | null = null;

  get distance() {
    return Math.exp(this.logDistance);
  }

  on(listener: (event: CameraEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: CameraEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  /** Jump without animation (cold links, reduced motion, restoring a shared pose). */
  setPose(target: CameraTargetInfo, distance: number, direction?: Vec3) {
    this.cancelFlight(false);
    this.targetId = target.id;
    this.lookAt = target.world;
    this.panOffset = [0, 0, 0];
    this.up = normalize3(target.up);
    if (direction) this.direction = normalize3(direction);
    this.minDistance = target.minDistance;
    this.logDistance = this.logDistanceGoal = Math.log(Math.max(target.minDistance, distance));
    this.orbitVelocity = [0, 0];
    this.lastTargetWorld = target.world;
  }

  flyTo(
    target: CameraTargetInfo,
    distance: number,
    direction: Vec3,
    now: number,
    label: string,
  ) {
    const start = { target: this.currentLookAt(), distance: this.distance, direction: this.direction };
    const end = { target: target.world, distance: Math.max(target.minDistance, distance), direction: normalize3(direction) };
    const plan = planFlight(start, end, { reducedMotion: this.reducedMotion });
    this.cancelFlight(false);
    this.targetId = target.id;
    this.minDistance = Math.min(this.minDistance, target.minDistance);
    this.panOffset = [0, 0, 0];
    this.orbitVelocity = [0, 0];
    this.idleSpin = 0;
    this.flight = { plan, startedAt: now, toId: target.id, label, kind: plan.kind };
    this.flightUpStart = this.up;
    this.flightUpEnd = normalize3(target.up);
    this.emit({ type: "flight-start", flight: this.flight });
    if (plan.durationMs <= 0) this.finishFlight(target);
  }

  private flightUpStart: Vec3 = [0, 1, 0];
  private flightUpEnd: Vec3 = [0, 1, 0];

  cancelFlight(interrupted = true) {
    if (!this.flight) return;
    const toId = this.flight.toId;
    this.flight = null;
    this.logDistanceGoal = this.logDistance;
    if (interrupted) this.emit({ type: "flight-end", toId, interrupted: true });
  }

  private finishFlight(target: CameraTargetInfo) {
    if (!this.flight) return;
    const { plan, toId } = this.flight;
    this.lookAt = target.world;
    this.direction = plan.end.direction;
    this.logDistance = this.logDistanceGoal = Math.log(plan.end.distance);
    this.up = this.flightUpEnd;
    this.minDistance = target.minDistance;
    this.flight = null;
    this.lastTargetWorld = target.world;
    this.emit({ type: "flight-end", toId, interrupted: false });
  }

  currentLookAt(): Vec3 {
    return [this.lookAt[0] + this.panOffset[0], this.lookAt[1] + this.panOffset[1], this.lookAt[2] + this.panOffset[2]];
  }

  // ------------------------------------------------------------------------------------------
  // Manual input. Every manual input takes control immediately: it interrupts a flight at its
  // current pose so there is no snap.

  private takeControl() {
    this.idleSpin = 0;
    if (this.flight) this.cancelFlight(true);
    this.emit({ type: "manual" });
  }

  enterGround(place: { latDeg: number; lonDeg: number }, look?: { azDeg: number; altDeg: number }) {
    this.cancelFlight(false);
    this.ground = place;
    this.targetId = null;
    this.orbitVelocity = [0, 0];
    this.idleSpin = 0;
    this.groundSlew = null;
    if (look) {
      this.groundAzDeg = look.azDeg;
      this.groundAltDeg = look.altDeg;
    }
  }

  leaveGround() {
    this.ground = null;
    this.groundSlew = null;
    this.orbitVelocity = [0, 0];
  }

  /** Turn smoothly to face an altitude / azimuth (ground mode). */
  lookAtAltAz(azDeg: number, altDeg: number, now: number) {
    if (!this.ground) return;
    this.orbitVelocity = [0, 0];
    const delta = ((((azDeg - this.groundAzDeg) % 360) + 540) % 360) - 180;
    const distance = Math.hypot(delta, altDeg - this.groundAltDeg);
    this.groundSlew = {
      fromAz: this.groundAzDeg,
      fromAlt: this.groundAltDeg,
      toAz: this.groundAzDeg + delta,
      toAlt: Math.min(89, Math.max(-5, altDeg)),
      startedAt: now,
      durationMs: this.reducedMotion ? 0 : Math.min(1_800, 500 + distance * 9),
    };
  }

  private applyLook(dYaw: number, dPitch: number) {
    // A full view-height drag (≈ 0.9π of orbit input) turns the view by one field of view.
    const scale = this.groundFovDeg / (0.9 * Math.PI);
    this.groundAzDeg = (((this.groundAzDeg - dYaw * scale) % 360) + 360) % 360;
    this.groundAltDeg = Math.min(89, Math.max(-5, this.groundAltDeg + dPitch * scale));
  }

  /** Advance the ground camera one frame. `eye` is the observer's world position (km). */
  updateGround(dtSeconds: number, now: number, frame: HorizonFrame, eye: Vec3): CameraPose {
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    if (this.groundSlew) {
      const slew = this.groundSlew;
      const t = slew.durationMs <= 0 ? 1 : Math.min(1, (now - slew.startedAt) / slew.durationMs);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      this.groundAzDeg = (((slew.fromAz + (slew.toAz - slew.fromAz) * e) % 360) + 360) % 360;
      this.groundAltDeg = slew.fromAlt + (slew.toAlt - slew.fromAlt) * e;
      if (t >= 1) this.groundSlew = null;
    } else {
      const [vy, vp] = this.orbitVelocity;
      if (Math.abs(vy) + Math.abs(vp) > 1e-4) {
        this.applyLook(vy * dt, vp * dt);
        const decay = Math.exp(-dt * 4.2);
        this.orbitVelocity = [vy * decay, vp * decay];
      } else this.orbitVelocity = [0, 0];
    }
    this.groundFovDeg += (this.groundFovGoal - this.groundFovDeg) * (1 - Math.exp(-dt * 10));
    const look = altAzToWorld(this.groundAltDeg, this.groundAzDeg, frame);
    // The look-at point only sets the render scale; nothing we show from the ground is nearer than the Moon.
    const distance = 50_000;
    return {
      target: [eye[0] + look[0] * distance, eye[1] + look[1] * distance, eye[2] + look[2] * distance],
      distance,
      direction: [-look[0], -look[1], -look[2]],
      up: frame.zenith,
      world: eye,
    };
  }

  orbit(dYaw: number, dPitch: number, withInertia = true) {
    if (this.ground) {
      this.groundSlew = null;
      this.idleSpin = 0;
      this.emit({ type: "manual" });
      this.applyLook(dYaw, dPitch);
      if (withInertia) this.orbitVelocity = [this.orbitVelocity[0] * 0.4 + dYaw * 0.6 * 60, this.orbitVelocity[1] * 0.4 + dPitch * 0.6 * 60];
      return;
    }
    this.takeControl();
    this.applyOrbit(dYaw, dPitch);
    this.lastManualOrbitAt = performance.now();
    if (withInertia) {
      // Exponential moving average of input velocity (per ~16 ms frame).
      this.orbitVelocity = [this.orbitVelocity[0] * 0.4 + dYaw * 0.6 * 60, this.orbitVelocity[1] * 0.4 + dPitch * 0.6 * 60];
    }
  }

  releaseOrbit() {
    // Keep the measured velocity for the coast; it decays in update().
  }

  stopInertia() {
    this.orbitVelocity = [0, 0];
  }

  private applyOrbit(dYaw: number, dPitch: number) {
    const up = this.up;
    let dir = rotateAround(this.direction, up, -dYaw);
    const right = normalize3(cross3(up, dir));
    const proposed = normalize3(rotateAround(dir, right, dPitch));
    const polar = Math.acos(Math.min(1, Math.max(-1, dot3(proposed, up))));
    if (polar > MIN_POLAR && polar < Math.PI - MIN_POLAR) dir = proposed;
    this.direction = normalize3(dir);
  }

  /** Zoom by a log-distance delta (positive = out). Smoothly approached in update(). */
  zoom(dLog: number) {
    if (this.ground) {
      this.groundFovGoal = Math.min(100, Math.max(0.5, this.groundFovGoal * Math.exp(dLog)));
      return;
    }
    this.takeControl();
    this.logDistanceGoal = Math.min(
      Math.log(MAX_CAMERA_DISTANCE_KM),
      Math.max(Math.log(this.minDistance), this.logDistanceGoal + dLog),
    );
  }

  /** Pan in screen space: dx, dy are fractions of the view height. */
  pan(dx: number, dy: number, fovY: number) {
    if (this.ground) {
      this.orbit(dx * Math.PI * 0.9, dy * Math.PI * 0.9, false);
      return;
    }
    this.takeControl();
    const scale = this.distance * Math.tan(fovY / 2) * 2;
    const forward: Vec3 = [-this.direction[0], -this.direction[1], -this.direction[2]];
    const right = normalize3(cross3(forward, this.up));
    const camUp = normalize3(cross3(right, forward));
    this.panOffset = [
      this.panOffset[0] - right[0] * dx * scale + camUp[0] * dy * scale,
      this.panOffset[1] - right[1] * dx * scale + camUp[1] * dy * scale,
      this.panOffset[2] - right[2] * dx * scale + camUp[2] * dy * scale,
    ];
  }

  /** Re-centre on the tracked object (removes any pan offset) without changing distance. */
  recentre() {
    this.panOffset = [0, 0, 0];
  }

  /**
   * Advance one frame. `resolveTarget` returns the live position for the tracked/flight target so that
   * moving bodies (moons, planets under fast time) stay locked without relaunching a flight.
   */
  update(dtSeconds: number, now: number, resolveTarget: (id: string | null) => CameraTargetInfo | null): CameraPose {
    const dt = Math.min(0.1, Math.max(0, dtSeconds));
    if (this.flight) {
      const target = resolveTarget(this.flight.toId);
      const liveEnd = target?.world ?? this.flight.plan.end.target;
      const sample = sampleFlight(this.flight.plan, now - this.flight.startedAt, liveEnd);
      if (sample.done && target) {
        this.finishFlight(target);
      } else {
        this.lookAt = sample.target;
        this.direction = normalize3(sample.direction);
        this.logDistance = this.logDistanceGoal = Math.log(sample.distance);
        this.up = normalize3(slerpUnit3(this.flightUpStart, this.flightUpEnd, sample.progress));
        if (sample.done) {
          this.flight = null;
        }
      }
    } else {
      const target = resolveTarget(this.targetId);
      if (target) {
        this.lookAt = target.world;
        this.minDistance = target.minDistance;
        // Settle "up" toward the target's natural axis slowly so it never snaps.
        const k = 1 - Math.exp(-dt * 1.5);
        this.up = normalize3(slerpUnit3(this.up, normalize3(target.up), k));
        this.lastTargetWorld = target.world;
      }
      if (this.idleSpin) this.applyOrbit(this.idleSpin * dt, 0);
      // Inertia
      const [vy, vp] = this.orbitVelocity;
      if (Math.abs(vy) + Math.abs(vp) > 1e-4) {
        this.applyOrbit(vy * dt, vp * dt);
        const decay = Math.exp(-dt * 4.2);
        this.orbitVelocity = [vy * decay, vp * decay];
      } else {
        this.orbitVelocity = [0, 0];
      }
      // Smooth zoom (critically damped toward goal)
      const goal = Math.max(Math.log(this.minDistance), this.logDistanceGoal);
      this.logDistanceGoal = goal;
      const kz = 1 - Math.exp(-dt * 10);
      this.logDistance += (goal - this.logDistance) * kz;
    }
    const target = this.currentLookAt();
    const distance = this.distance;
    const world: Vec3 = [
      target[0] + this.direction[0] * distance,
      target[1] + this.direction[1] * distance,
      target[2] + this.direction[2] * distance,
    ];
    return { target, distance, direction: this.direction, up: this.up, world };
  }

  /** Distance travelled since the last frame is useful for motion cues. */
  static separation(a: Vec3, b: Vec3) {
    return length3(sub3(a, b));
  }
}

// ---------------------------------------------------------------------------------------------
// Input binding

export interface InputBindingOptions {
  getFovY: () => number;
  onClick: (x: number, y: number, event: PointerEvent) => void;
  onDoubleClick: (x: number, y: number) => void;
  onHover: (x: number, y: number) => void;
}

export const bindCameraInput = (element: HTMLElement, camera: ExplorerCamera, options: InputBindingOptions) => {
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number; button: number; shift: boolean }>();
  let pinchStart: { distance: number; midX: number; midY: number } | null = null;
  let downAt = 0;
  let lastClickAt = 0;
  let moved = 0;

  const rect = () => element.getBoundingClientRect();

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button > 2) return;
    element.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      button: event.button,
      shift: event.shiftKey,
    });
    camera.stopInertia();
    downAt = performance.now();
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === "mouse") {
        const r = rect();
        options.onHover(event.clientX - r.left, event.clientY - r.top);
      }
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    const height = Math.max(1, rect().height);
    if (pointers.size >= 2 && pinchStart) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (distance > 0 && pinchStart.distance > 0) camera.zoom(-Math.log(distance / pinchStart.distance));
      camera.orbit(((midX - pinchStart.midX) / height) * Math.PI * 0.8, ((midY - pinchStart.midY) / height) * Math.PI * 0.8);
      pinchStart = { distance, midX, midY };
      return;
    }
    if (pointer.button === 2 || pointer.shift) {
      camera.pan(dx / height, dy / height, options.getFovY());
      return;
    }
    // One pointer: orbit. Full view height drag ≈ 160°.
    const speed = Math.PI * 0.9;
    camera.orbit((dx / height) * speed, (dy / height) * speed);
  };

  const onPointerUp = (event: PointerEvent) => {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!pointer) return;
    const isTap = moved < 6 && performance.now() - downAt < 450 && pointer.button === 0;
    if (!isTap) {
      camera.releaseOrbit();
      return;
    }
    camera.stopInertia();
    const r = rect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    const now = performance.now();
    if (now - lastClickAt < 320) {
      options.onDoubleClick(x, y);
      lastClickAt = 0;
    } else {
      options.onClick(x, y, event);
      lastClickAt = now;
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const lineScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    const dy = event.deltaY * lineScale;
    const dx = event.deltaX * lineScale;
    if (event.ctrlKey) {
      // Trackpad pinch (Chromium/Safari report it as ctrl+wheel): precise and proportional.
      camera.zoom(dy * 0.0105);
      return;
    }
    const isMouseNotch = event.deltaMode !== 0 || (Math.abs(dy) >= 50 && Number.isInteger(dy) && Math.abs(dx) < 1);
    if (isMouseNotch) {
      camera.zoom(Math.sign(dy) * 0.24 * Math.min(4, Math.abs(dy) / 100 || 1));
      return;
    }
    // Two-finger trackpad scroll: vertical zooms gently, horizontal orbits.
    if (Math.abs(dy) > 0) camera.zoom(dy * 0.0042);
    if (Math.abs(dx) > 0.5) camera.orbit((dx / Math.max(1, rect().height)) * Math.PI * 0.6, 0, false);
  };

  const onContextMenu = (event: Event) => event.preventDefault();

  // Safari gesture events (pinch on trackpad when not reported as ctrl+wheel)
  let gestureScale = 1;
  const onGestureStart = (event: Event) => {
    event.preventDefault();
    gestureScale = (event as unknown as { scale: number }).scale ?? 1;
  };
  const onGestureChange = (event: Event) => {
    event.preventDefault();
    const scale = (event as unknown as { scale: number }).scale ?? 1;
    if (scale > 0 && gestureScale > 0) camera.zoom(-Math.log(scale / gestureScale));
    gestureScale = scale;
  };

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerUp);
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("contextmenu", onContextMenu);
  element.addEventListener("gesturestart", onGestureStart as EventListener);
  element.addEventListener("gesturechange", onGestureChange as EventListener);
  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerUp);
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("contextmenu", onContextMenu);
    element.removeEventListener("gesturestart", onGestureStart as EventListener);
    element.removeEventListener("gesturechange", onGestureChange as EventListener);
  };
};
