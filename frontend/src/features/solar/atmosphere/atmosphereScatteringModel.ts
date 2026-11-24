import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import type { PlanetId } from "../solarData";

export type AtmosphereProfileStatus = "reference-parameterization" | "density-scaled-provisional";

export interface AtmosphereSourceReceipt {
  label: string;
  url: string;
  role: "method" | "physical-inputs" | "reference-implementation";
}

export interface AtmosphereScatteringProfile {
  id: string;
  bodyId: Extract<PlanetId, "earth" | "mars">;
  label: string;
  status: AtmosphereProfileStatus;
  topAltitudeKm: number;
  rayleighScaleHeightKm: number;
  mieScaleHeightKm: number;
  rayleighScatteringPerKm: readonly [number, number, number];
  mieScatteringPerKm: number;
  mieExtinctionPerKm: number;
  miePhaseG: number;
  rendererExposure: number;
  physicalInputNote: string;
  accuracyNote: string;
  sources: readonly AtmosphereSourceReceipt[];
}

export interface AtmosphereLutData {
  width: number;
  height: number;
  data: Uint8Array;
}

export const SOLAR_ATMOSPHERE_SCATTERING_MODEL = {
  id: "generated-single-scattering-lut-v1",
  label: "Generated single-scattering optical-depth LUT",
  methodSourceLabel: "Bruneton and Neyret precomputed atmosphere method",
  methodSourceUrl: "https://doi.org/10.1111/j.1467-8659.2008.01245.x",
  referenceSourceLabel: "Bruneton reference implementation",
  referenceSourceUrl: "https://ebruneton.github.io/precomputed_atmospheric_scattering/",
  fallbackId: "sun-aware-analytic-limb-v1",
  fallbackLabel: "Sun-aware analytic limb fallback",
  accuracyNote:
    "SpaceViewer precomputes a compact single-scattering optical-depth table, not the paper's full spectral multiple-scattering, irradiance and ozone solution.",
} as const;

const BRUNETON_REFERENCE_SOURCE: AtmosphereSourceReceipt = {
  label: "Bruneton reference Earth parameters",
  url: "https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/demo/demo.cc.html",
  role: "reference-implementation",
};

const BRUNETON_METHOD_SOURCE: AtmosphereSourceReceipt = {
  label: "Bruneton and Neyret 2008",
  url: SOLAR_ATMOSPHERE_SCATTERING_MODEL.methodSourceUrl,
  role: "method",
};

const JPL_MARS_ATMOSPHERE_SOURCE: AtmosphereSourceReceipt = {
  label: "JPL Mars atmospheric propagation model",
  url: "https://descanso.jpl.nasa.gov/propagation/mars/MarsPub020318.pdf",
  role: "physical-inputs",
};

// Bruneton's reference Earth spectrum evaluates beta_R(lambda) =
// 1.24062e-6 * lambda^-4 in m^-1. These are the resulting red, green and
// blue coefficients at 680, 550 and 440 nm, converted to km^-1.
const EARTH_RAYLEIGH_PER_KM = [0.005802, 0.013558, 0.0331] as const;
const EARTH_MIE_EXTINCTION_PER_KM = (5.328e-3 / 1.2) * 1e-3;
const MARS_TO_EARTH_NUMBER_DENSITY = 2.85e23 / 2.7e25;
const MARS_RAYLEIGH_PER_KM = EARTH_RAYLEIGH_PER_KM.map(
  (coefficient) => coefficient * MARS_TO_EARTH_NUMBER_DENSITY,
) as [number, number, number];

export const ATMOSPHERE_SCATTERING_PROFILES: Readonly<
  Partial<Record<PlanetId, AtmosphereScatteringProfile>>
> = {
  earth: {
    id: "earth-bruneton-reference-rgb-v1",
    bodyId: "earth",
    label: "Earth reference molecular and aerosol profile",
    status: "reference-parameterization",
    topAltitudeKm: 60,
    rayleighScaleHeightKm: 8,
    mieScaleHeightKm: 1.2,
    rayleighScatteringPerKm: EARTH_RAYLEIGH_PER_KM,
    mieScatteringPerKm: EARTH_MIE_EXTINCTION_PER_KM * 0.9,
    mieExtinctionPerKm: EARTH_MIE_EXTINCTION_PER_KM,
    miePhaseG: 0.8,
    rendererExposure: 7.5,
    physicalInputNote:
      "8.0 km molecular and 1.2 km aerosol density scales, 60 km model top and RGB coefficients sampled from the reference Earth parameterization.",
    accuracyNote:
      "Reference coefficients are source-backed, but this browser shell omits spectral integration, ozone, ground irradiance and multiple scattering.",
    sources: [BRUNETON_METHOD_SOURCE, BRUNETON_REFERENCE_SOURCE],
  },
  mars: {
    id: "mars-jpl-density-scaled-molecular-v1",
    bodyId: "mars",
    label: "Mars density-scaled molecular profile",
    status: "density-scaled-provisional",
    topAltitudeKm: 70,
    rayleighScaleHeightKm: 11.1,
    mieScaleHeightKm: 1.2,
    rayleighScatteringPerKm: MARS_RAYLEIGH_PER_KM,
    mieScatteringPerKm: 0,
    mieExtinctionPerKm: 0,
    miePhaseG: 0.8,
    rendererExposure: 36,
    physicalInputNote:
      "JPL supplies the 11.1 km scale height and the 2.85e23 m^-3 versus 2.7e25 m^-3 Mars/Earth surface number densities. Molecular RGB coefficients are density-scaled from the Earth reference.",
    accuracyNote:
      "This provisional molecular-only table does not model CO2 refractivity, season, altitude, dust loading or Martian aerosol phase functions; it is not a radiance or weather product.",
    sources: [BRUNETON_METHOD_SOURCE, BRUNETON_REFERENCE_SOURCE, JPL_MARS_ATMOSPHERE_SOURCE],
  },
};

export const getAtmosphereScatteringProfile = (
  planetId: PlanetId,
): AtmosphereScatteringProfile | null => ATMOSPHERE_SCATTERING_PROFILES[planetId] ?? null;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const distanceToTopAtmosphereKm = (radiusKm: number, topRadiusKm: number, rayCosine: number) => {
  const discriminant = radiusKm * radiusKm * rayCosine * rayCosine + topRadiusKm * topRadiusKm - radiusKm * radiusKm;
  return -radiusKm * rayCosine + Math.sqrt(Math.max(0, discriminant));
};

const rayIntersectsGround = (radiusKm: number, bottomRadiusKm: number, rayCosine: number) =>
  rayCosine < 0 && radiusKm * radiusKm * (1 - rayCosine * rayCosine) < bottomRadiusKm * bottomRadiusKm;

const integrateDensityColumnKm = ({
  bottomRadiusKm,
  topRadiusKm,
  startAltitudeKm,
  rayCosine,
  scaleHeightKm,
  sampleCount,
}: {
  bottomRadiusKm: number;
  topRadiusKm: number;
  startAltitudeKm: number;
  rayCosine: number;
  scaleHeightKm: number;
  sampleCount: number;
}) => {
  const startRadiusKm = bottomRadiusKm + startAltitudeKm;
  if (rayIntersectsGround(startRadiusKm, bottomRadiusKm, rayCosine)) return Number.POSITIVE_INFINITY;
  const pathLengthKm = distanceToTopAtmosphereKm(startRadiusKm, topRadiusKm, rayCosine);
  if (!Number.isFinite(pathLengthKm) || pathLengthKm <= 0) return 0;
  const stepKm = pathLengthKm / sampleCount;
  let columnKm = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const distanceKm = (index + 0.5) * stepKm;
    const sampleRadiusKm = Math.sqrt(
      startRadiusKm * startRadiusKm + distanceKm * distanceKm + 2 * startRadiusKm * rayCosine * distanceKm,
    );
    const altitudeKm = Math.max(0, sampleRadiusKm - bottomRadiusKm);
    columnKm += Math.exp(-altitudeKm / scaleHeightKm) * stepKm;
  }
  return columnKm;
};

const encodeOpticalDepth = (opticalDepth: number) => {
  if (!Number.isFinite(opticalDepth)) return 255;
  const encoded = 1 - Math.exp(-clamp(opticalDepth, 0, 16));
  return Math.round(encoded * 255);
};

export const createAtmosphereOpticalDepthLut = ({
  profile,
  bottomRadiusKm,
  width,
  height,
  sampleCount = 48,
}: {
  profile: AtmosphereScatteringProfile;
  bottomRadiusKm: number;
  width: number;
  height: number;
  sampleCount?: number;
}): AtmosphereLutData => {
  const safeWidth = clamp(Math.round(width), 4, 512);
  const safeHeight = clamp(Math.round(height), 4, 256);
  const safeSamples = clamp(Math.round(sampleCount), 8, 128);
  const topRadiusKm = bottomRadiusKm + profile.topAltitudeKm;
  const representativeScatterAltitudeKm = Math.min(
    profile.topAltitudeKm * 0.5,
    profile.rayleighScaleHeightKm * 1.5,
  );
  const rayleighBluePerKm = profile.rayleighScatteringPerKm[2];
  const data = new Uint8Array(safeWidth * safeHeight * 4);

  for (let y = 0; y < safeHeight; y += 1) {
    const sunCosine = ((y + 0.5) / safeHeight) * 2 - 1;
    const sunRayleighColumnKm = integrateDensityColumnKm({
      bottomRadiusKm,
      topRadiusKm,
      startAltitudeKm: representativeScatterAltitudeKm,
      rayCosine: sunCosine,
      scaleHeightKm: profile.rayleighScaleHeightKm,
      sampleCount: safeSamples,
    });
    const sunMieColumnKm = integrateDensityColumnKm({
      bottomRadiusKm,
      topRadiusKm,
      startAltitudeKm: representativeScatterAltitudeKm,
      rayCosine: sunCosine,
      scaleHeightKm: profile.mieScaleHeightKm,
      sampleCount: safeSamples,
    });

    for (let x = 0; x < safeWidth; x += 1) {
      const viewCosine = (x + 0.5) / safeWidth;
      const viewRayleighColumnKm = integrateDensityColumnKm({
        bottomRadiusKm,
        topRadiusKm,
        startAltitudeKm: 0,
        rayCosine: viewCosine,
        scaleHeightKm: profile.rayleighScaleHeightKm,
        sampleCount: safeSamples,
      });
      const viewMieColumnKm = integrateDensityColumnKm({
        bottomRadiusKm,
        topRadiusKm,
        startAltitudeKm: 0,
        rayCosine: viewCosine,
        scaleHeightKm: profile.mieScaleHeightKm,
        sampleCount: safeSamples,
      });
      const offset = (y * safeWidth + x) * 4;
      data[offset] = encodeOpticalDepth(viewRayleighColumnKm * rayleighBluePerKm);
      data[offset + 1] = encodeOpticalDepth(viewMieColumnKm * profile.mieExtinctionPerKm);
      data[offset + 2] = encodeOpticalDepth(sunRayleighColumnKm * rayleighBluePerKm);
      data[offset + 3] = encodeOpticalDepth(sunMieColumnKm * profile.mieExtinctionPerKm);
    }
  }

  return { width: safeWidth, height: safeHeight, data };
};

const LUT_TEXTURE_CACHE = new Map<string, DataTexture>();

export const getAtmosphereOpticalDepthTexture = ({
  profile,
  bottomRadiusKm,
  width,
  height,
}: {
  profile: AtmosphereScatteringProfile;
  bottomRadiusKm: number;
  width: number;
  height: number;
}) => {
  const cacheKey = `${profile.id}:${bottomRadiusKm}:${width}x${height}`;
  const cached = LUT_TEXTURE_CACHE.get(cacheKey);
  if (cached) return cached;
  const lut = createAtmosphereOpticalDepthLut({ profile, bottomRadiusKm, width, height });
  const texture = new DataTexture(lut.data, lut.width, lut.height, RGBAFormat, UnsignedByteType);
  texture.name = `atmosphere-lut:${cacheKey}`;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  LUT_TEXTURE_CACHE.set(cacheKey, texture);
  return texture;
};
