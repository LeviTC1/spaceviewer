import { describe, expect, it } from "vitest";
import {
  SOLAR_ORIENTATION_SOURCES,
  getSolarBodyOrientation,
  getSolarBodyPrimeMeridianDeg,
  getSolarOrientationTimeArguments,
  isControlledSatelliteOrientationBodyId,
  normalizeDegrees,
} from "../src/domain/solar";

const J2000 = "2000-01-01T12:00:00.000Z";

const signedAngularDelta = (fromDeg: number, toDeg: number) => {
  const forward = normalizeDegrees(toDeg - fromDeg);
  return forward > 180 ? forward - 360 : forward;
};

describe("source-backed Solar body orientation", () => {
  it("uses the WGCCRE and IERS standard epoch", () => {
    const time = getSolarOrientationTimeArguments(J2000);
    expect(time.daysFromJ2000).toBeCloseTo(0, 12);
    expect(time.julianCenturiesFromJ2000).toBeCloseTo(0, 12);
  });

  it("evaluates published J2000 prime-meridian constants and periodic terms", () => {
    expect(getSolarBodyPrimeMeridianDeg("mercury", J2000)).toBeCloseTo(329.5999488046, 9);
    expect(getSolarBodyPrimeMeridianDeg("venus", J2000)).toBeCloseTo(160.2, 10);
    expect(getSolarBodyPrimeMeridianDeg("earth", J2000)).toBeCloseTo(280.46061837504, 9);
    expect(getSolarBodyPrimeMeridianDeg("pluto", J2000)).toBeCloseTo(302.695, 10);
  });

  it("advances and reverses deterministically from the simulation timestamp", () => {
    const marsStart = getSolarBodyPrimeMeridianDeg("mars", J2000);
    const marsNext = getSolarBodyPrimeMeridianDeg("mars", "2000-01-02T12:00:00.000Z");
    const marsPrevious = getSolarBodyPrimeMeridianDeg("mars", "1999-12-31T12:00:00.000Z");
    expect(signedAngularDelta(marsStart, marsNext)).toBeCloseTo(-9.108, 2);
    expect(signedAngularDelta(marsPrevious, marsStart)).toBeCloseTo(-9.108, 2);
    expect(getSolarBodyPrimeMeridianDeg("mars", J2000)).toBe(marsStart);
  });

  it("preserves retrograde rotation sense and nominal sidereal periods", () => {
    const venus = getSolarBodyOrientation("venus", J2000);
    const earth = getSolarBodyOrientation("earth", J2000);
    const uranus = getSolarBodyOrientation("uranus", J2000);
    expect(venus.rotationSense).toBe("retrograde");
    expect(venus.nominalSpinRateDegPerDay).toBeLessThan(0);
    expect(earth.rotationSense).toBe("prograde");
    expect(earth.nominalRotationPeriodHours).toBeCloseTo(23.93447, 4);
    expect(uranus.rotationSense).toBe("retrograde");
    expect(uranus.nominalRotationPeriodHours).toBeCloseTo(17.24, 2);
  });

  it("converts ICRF poles into normalized ecliptic and renderer axes", () => {
    const earth = getSolarBodyOrientation("earth", J2000);
    const uranus = getSolarBodyOrientation("uranus", J2000);
    const earthSceneMagnitude = Math.hypot(
      earth.pole.sceneUnitVector.x,
      earth.pole.sceneUnitVector.y,
      earth.pole.sceneUnitVector.z,
    );
    expect(earthSceneMagnitude).toBeCloseTo(1, 12);
    expect(earth.pole.poleAngleToJ2000EclipticNorthDeg).toBeCloseTo(23.4392911, 6);
    expect(uranus.pole.poleAngleToJ2000EclipticNorthDeg).toBeCloseTo(82.2782, 4);
    expect(uranus.rotationSense).toBe("retrograde");
  });

  it("constructs an orthonormal, right-handed body-fixed scene frame", () => {
    const earth = getSolarBodyOrientation("earth", J2000);
    const { primeMeridianUnitVector: x, poleUnitVector: y, thirdAxisUnitVector: z } = earth.sceneFrame;
    const dot = x.x * y.x + x.y * y.y + x.z * y.z;
    const cross = {
      x: x.y * y.z - x.z * y.y,
      y: x.z * y.x - x.x * y.z,
      z: x.x * y.y - x.y * y.x,
    };
    expect(Math.hypot(x.x, x.y, x.z)).toBeCloseTo(1, 12);
    expect(Math.hypot(y.x, y.y, y.z)).toBeCloseTo(1, 12);
    expect(dot).toBeCloseTo(0, 12);
    expect(cross.x).toBeCloseTo(z.x, 12);
    expect(cross.y).toBeCloseTo(z.y, 12);
    expect(cross.z).toBeCloseTo(z.z, 12);
  });

  it("carries source location and honest browser-time limitations", () => {
    const mars = getSolarBodyOrientation("mars", J2000);
    const earth = getSolarBodyOrientation("earth", J2000);
    expect(mars.source).toBe(SOLAR_ORIENTATION_SOURCES["iau-wgccre-2015"]);
    expect(mars.source.referenceLocation).toContain("Tables 1 and 3");
    expect(earth.source).toBe(SOLAR_ORIENTATION_SOURCES["iers-conventions-2010"]);
    expect(earth.accuracyNote).toMatch(/UTC.*UT1/i);
  });

  it("evaluates the pinned NAIF lunar ME periodic model at J2000", () => {
    const moon = getSolarBodyOrientation("moon", J2000);
    expect(moon.pole.rightAscensionDeg).toBeCloseTo(266.85773344495135, 10);
    expect(moon.pole.declinationDeg).toBeCloseTo(65.64110274784532, 10);
    expect(moon.primeMeridianDeg).toBeCloseTo(41.19526398074522, 10);
    expect(moon.nominalRotationPeriodHours / 24).toBeCloseTo(27.3216617142, 9);
    expect(moon.rotationSystem).toMatch(/Mean Earth\/Polar Axis/);
    expect(moon.source).toBe(SOLAR_ORIENTATION_SOURCES["naif-pck00011"]);
    expect(moon.accuracyNote).toMatch(/binary lunar PCK/i);
  });

  it("evaluates the pinned Galilean periodic models at J2000", () => {
    const expected = {
      io: [267.9569949340006, 64.52057958094856, 200.47412214127095],
      europa: [268.0398065240535, 64.96124602208816, 36.05873296058563],
      ganymede: [268.5068368734792, 64.43615139894895, 43.78699157850688],
      callisto: [268.219592372709, 64.68209527916105, 259.96172107726943],
    } as const;

    for (const [bodyId, [rightAscensionDeg, declinationDeg, primeMeridianDeg]] of Object.entries(expected)) {
      const orientation = getSolarBodyOrientation(bodyId as keyof typeof expected, J2000);
      expect(orientation.pole.rightAscensionDeg).toBeCloseTo(rightAscensionDeg, 10);
      expect(orientation.pole.declinationDeg).toBeCloseTo(declinationDeg, 10);
      expect(orientation.primeMeridianDeg).toBeCloseTo(primeMeridianDeg, 10);
      expect(orientation.source).toBe(SOLAR_ORIENTATION_SOURCES["naif-pck00011"]);
      expect(orientation.modelLabel).toMatch(/WGCCRE satellite/);
    }
  });

  it("limits controlled satellite attitude to the five source-backed bodies", () => {
    expect(isControlledSatelliteOrientationBodyId("moon")).toBe(true);
    expect(isControlledSatelliteOrientationBodyId("callisto")).toBe(true);
    expect(isControlledSatelliteOrientationBodyId("titan")).toBe(false);
    expect(isControlledSatelliteOrientationBodyId(null)).toBe(false);
  });

  it("constructs orthonormal body frames for every controlled satellite", () => {
    for (const bodyId of ["moon", "io", "europa", "ganymede", "callisto"] as const) {
      const { sceneFrame } = getSolarBodyOrientation(bodyId, "2038-04-19T03:15:00.000Z");
      const { primeMeridianUnitVector: x, poleUnitVector: y, thirdAxisUnitVector: z } = sceneFrame;
      expect(Math.hypot(x.x, x.y, x.z)).toBeCloseTo(1, 12);
      expect(Math.hypot(y.x, y.y, y.z)).toBeCloseTo(1, 12);
      expect(Math.hypot(z.x, z.y, z.z)).toBeCloseTo(1, 12);
      expect(x.x * y.x + x.y * y.y + x.z * y.z).toBeCloseTo(0, 12);
      expect(x.x * z.x + x.y * z.y + x.z * z.z).toBeCloseTo(0, 12);
      expect(y.x * z.x + y.y * z.y + y.z * z.z).toBeCloseTo(0, 12);
    }
  });
});
