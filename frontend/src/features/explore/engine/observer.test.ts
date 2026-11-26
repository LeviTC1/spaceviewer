import { describe, expect, it } from "vitest";
import { altAz, altAzToWorld, dateToJ2000, gmstRad, horizonFrame } from "./observer";
import { dot3, icrsToWorld, raDecToIcrsUnit } from "./units";

const DEG = Math.PI / 180;

describe("sidereal time", () => {
  it("matches the J2000.0 value", () => {
    expect(gmstRad(Date.UTC(2000, 0, 1, 12)) / DEG).toBeCloseTo(280.460_618_37, 6);
  });

  it("matches Meeus example 12.a (1987 April 10, 0h UT: 13h10m46.3668s)", () => {
    const expected = (13 + 10 / 60 + 46.3668 / 3600) * 15;
    expect(gmstRad(Date.UTC(1987, 3, 10)) / DEG).toBeCloseTo(expected, 3);
  });
});

describe("precession", () => {
  it("moves the pole of date about 20″ a year away from the J2000 pole", () => {
    const pole = dateToJ2000([0, 0, 1], Date.UTC(2026, 0, 1));
    const offsetArcsec = (Math.acos(pole[2]) / DEG) * 3600;
    expect(offsetArcsec).toBeGreaterThan(20.04 * 25.5);
    expect(offsetArcsec).toBeLessThan(20.04 * 26.5);
  });
});

describe("horizon frame", () => {
  const time = Date.UTC(2026, 10, 26, 21, 30);

  it("is orthonormal and right-handed (east = north × zenith)", () => {
    const frame = horizonFrame(-33.87, 151.21, time);
    expect(dot3(frame.zenith, frame.north)).toBeCloseTo(0, 12);
    expect(dot3(frame.zenith, frame.east)).toBeCloseTo(0, 12);
    expect(dot3(frame.north, frame.east)).toBeCloseTo(0, 12);
  });

  it("puts the zenith at the observer's latitude in declination", () => {
    for (const lat of [-60, -33.87, 0, 51.48, 78]) {
      const { zenithJ2000 } = horizonFrame(lat, 10, time);
      expect(Math.asin(zenithJ2000[2]) / DEG).toBeCloseTo(lat, 0);
    }
  });

  it("raises Polaris to the observer's latitude", () => {
    const polaris = icrsToWorld(...raDecToIcrsUnit(37.954_56, 89.264_11));
    for (const hour of [0, 6, 12, 18]) {
      const frame = horizonFrame(51.48, 0, Date.UTC(2026, 10, 26, hour));
      const { altDeg, azDeg } = altAz(polaris, frame);
      expect(Math.abs(altDeg - 51.48)).toBeLessThan(1);
      expect(Math.min(azDeg, 360 - azDeg)).toBeLessThan(1.5);
    }
  });

  it("round-trips altitude and azimuth", () => {
    const frame = horizonFrame(40, -74, time);
    const v = altAzToWorld(32, 117, frame);
    const back = altAz(v, frame);
    expect(back.altDeg).toBeCloseTo(32, 9);
    expect(back.azDeg).toBeCloseTo(117, 9);
  });

  it("puts a meridian star due south (northern observer) at upper culmination", () => {
    // At local sidereal time = RA, a star on the meridian with dec < lat is due south.
    const lon = 0;
    let t = Date.UTC(2026, 10, 26, 0);
    // Find when LST ≈ 83.82° (Orion Nebula) to within a minute.
    for (let i = 0; i < 1440 && Math.abs(((horizonFrame(51.48, lon, t).lst / DEG - 83.82 + 540) % 360) - 180) > 0.3; i += 1) t += 60_000;
    const frame = horizonFrame(51.48, lon, t);
    const { altDeg, azDeg } = altAz(icrsToWorld(...raDecToIcrsUnit(83.82, -5.39)), frame);
    expect(azDeg).toBeCloseTo(180, 0);
    // 90 − 51.48 − 5.39 ≈ 33.1°, within the precession since J2000.
    expect(altDeg).toBeCloseTo(33.1, 0);
  });
});
