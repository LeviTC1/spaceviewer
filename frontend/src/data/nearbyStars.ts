export interface NearbyStar {
  name: string;
  distanceLy: number;
  x: number;
  y: number;
  z: number;
  spectralType: string;
  luminosity: number;
  temperature: number;
}

const raDecToXYZ = (raHours: number, decDeg: number, distanceLy: number) => {
  const ra = (raHours / 24) * Math.PI * 2;
  const dec = (decDeg * Math.PI) / 180;
  const x = distanceLy * Math.cos(dec) * Math.cos(ra);
  const y = distanceLy * Math.sin(dec);
  const z = distanceLy * Math.cos(dec) * Math.sin(ra);
  return { x, y, z };
};

const star = (
  name: string,
  distanceLy: number,
  raHours: number,
  decDeg: number,
  spectralType: string,
  luminosity: number,
  temperature: number,
): NearbyStar => {
  const { x, y, z } = raDecToXYZ(raHours, decDeg, distanceLy);
  return { name, distanceLy, x, y, z, spectralType, luminosity, temperature };
};

export const NEARBY_STARS: NearbyStar[] = [
  {
    name: "Sun",
    distanceLy: 0,
    x: 0,
    y: 0,
    z: 0,
    spectralType: "G2V",
    luminosity: 1,
    temperature: 5778,
  },
  star("Proxima Centauri", 4.24, 14.49, -62.68, "M5.5V", 0.0017, 3042),
  star("Alpha Centauri A", 4.37, 14.66, -60.83, "G2V", 1.52, 5790),
  star("Alpha Centauri B", 4.37, 14.66, -60.83, "K1V", 0.5, 5260),
  star("Barnard's Star", 5.96, 17.96, 4.69, "M4V", 0.0035, 3130),
  star("Wolf 359", 7.86, 10.94, 7.01, "M6V", 0.0006, 2800),
  star("Lalande 21185", 8.31, 11.05, 35.97, "M2V", 0.02, 3510),
  star("Sirius A", 8.6, 6.75, -16.72, "A1V", 25, 9940),
  star("Sirius B", 8.6, 6.75, -16.72, "DA2", 0.02, 25200),
  star("Luyten 726-8 A", 8.73, 1.65, -17.0, "M5.5V", 0.003, 2700),
  star("Luyten 726-8 B", 8.73, 1.65, -17.0, "M6V", 0.002, 2600),
  star("Ross 154", 9.68, 18.85, -23.84, "M3.5V", 0.003, 3240),
  star("Ross 248", 10.3, 23.71, 44.1, "M6V", 0.002, 2700),
  star("Epsilon Eridani", 10.5, 3.55, -9.46, "K2V", 0.34, 5084),
  star("Procyon", 11.46, 7.65, 5.22, "F5IV", 7, 6530),
  star("61 Cygni A", 11.4, 21.07, 38.7, "K5V", 0.15, 4450),
  star("61 Cygni B", 11.4, 21.07, 38.7, "K7V", 0.08, 4040),
  star("Tau Ceti", 11.9, 1.73, -15.94, "G8V", 0.52, 5340),
  star("Epsilon Indi", 11.8, 22.03, -56.78, "K5V", 0.22, 4630),
  star("Groombridge 34 A", 11.6, 0.3, 44.02, "M1V", 0.09, 3520),
  star("Groombridge 34 B", 11.6, 0.3, 44.02, "M3V", 0.05, 3300),
  star("Wolf 1061", 13.8, 16.47, -12.39, "M3V", 0.01, 3390),
  star("82 Eridani", 20.4, 3.0, -43.07, "G5V", 0.74, 5300),
  star("Epsilon Ceti", 11.8, 1.53, -9.42, "K0V", 0.54, 5200),
  star("Delta Pavonis", 19.9, 20.1, -66.18, "G8IV", 0.8, 5600),
  star("Eta Cassiopeiae", 19.4, 0.82, 57.81, "G0V", 1.2, 6030),
  star("Xi Bootis", 22.0, 14.85, 19.1, "G8V", 0.6, 5450),
  star("40 Eridani", 16.5, 4.15, -7.66, "K1V", 0.45, 5100),
  star("Altair", 16.7, 19.85, 8.87, "A7V", 10, 7550),
  star("Vega", 25.0, 18.62, 38.78, "A0V", 40, 9600),
  star("Fomalhaut", 25.1, 22.95, -29.62, "A3V", 16, 8590),
  star("Arcturus", 36.7, 14.26, 19.18, "K1.5III", 170, 4286),
  star("Capella", 42.9, 5.28, 46.0, "G8III", 80, 5700),
  star("Pollux", 34.0, 7.75, 28.03, "K0III", 43, 4860),
  star("Denebola", 36.0, 11.82, 14.57, "A3V", 14, 8500),
  star("Beta Comae", 29.8, 13.2, 27.9, "G0V", 1.6, 5930),
  star("Zeta Reticuli", 39.2, 3.3, -62.5, "G2V", 1.1, 5800),
  star("Gamma Leporis", 29.0, 5.0, -22.8, "F6V", 2, 6600),
  star("Epsilon Leporis", 29.1, 5.1, -22.5, "K4III", 15, 3900),
  star("Delta Eridani", 29.5, 3.72, -9.76, "K0IV", 3, 5200),
  star("Omicron2 Eridani", 16.3, 4.22, -7.78, "K1V", 0.6, 5000),
  star("Luyten 372-58", 24.0, 7.45, 0.0, "M3V", 0.02, 3300),
  star("Kapteyn's Star", 12.8, 5.18, -45.0, "M1V", 0.012, 3550),
  star("Wolf 424 A", 14.3, 12.63, 9.1, "M5.5V", 0.002, 2600),
  star("Wolf 424 B", 14.3, 12.63, 9.1, "M6V", 0.0018, 2550),
  star("Gliese 667 C", 23.6, 17.57, -34.99, "M1.5V", 0.013, 3700),
  star("Lacaille 9352", 10.7, 23.09, -35.85, "M2V", 0.005, 3660),
  star("Van Maanen's Star", 14.3, 0.68, 5.0, "DZ7", 0.0005, 6000),
  star("Gliese 1", 14.2, 0.09, -37.7, "M1V", 0.02, 3600),
  star("Gliese 15 A", 11.7, 0.28, 44.0, "M1V", 0.02, 3600),
  star("Gliese 15 B", 11.7, 0.28, 44.0, "M3V", 0.003, 3300),
  star("Gliese 581", 20.3, 15.3, -7.7, "M3V", 0.013, 3400),
  star("Gliese 876", 15.2, 22.91, -14.0, "M4V", 0.012, 3200),
  star("Gliese 832", 16.2, 21.3, -49.0, "M1.5V", 0.03, 3700),
  star("Gliese 163", 49.0, 4.1, -53.0, "M3V", 0.02, 3300),
];
