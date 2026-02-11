import type { SpaceImage } from "../models/SpaceImage";

const hasMatch = (text: string, patterns: RegExp[]) => patterns.some((pattern) => pattern.test(text));

export type ObjectType =
  | "Nebula"
  | "Galaxy"
  | "Star Cluster"
  | "Supernova Remnant"
  | "Planetary System"
  | "Deep Field"
  | "Unknown";

export const classifyObjectType = (image: SpaceImage): ObjectType => {
  const text = `${image.title ?? ""} ${image.description ?? ""} ${(image.keywords ?? []).join(" ")}`.toLowerCase();

  if (
    hasMatch(text, [
      /nebula/,
      /h\s?ii/,
      /stellar nursery/,
      /star-forming region/,
      /emission nebula/,
    ])
  ) {
    return "Nebula";
  }

  if (hasMatch(text, [/deep field/, /ultra deep/, /hdf/, /udf/])) {
    return "Deep Field";
  }

  if (hasMatch(text, [/supernova/, /snr/, /remnant/, /pulsar wind/])) {
    return "Supernova Remnant";
  }

  if (hasMatch(text, [/cluster/, /globular/, /open cluster/])) {
    return "Star Cluster";
  }

  if (hasMatch(text, [/planet/, /exoplanet/, /ring/, /rings/, /moon/, /asteroid/, /comet/])) {
    return "Planetary System";
  }

  if (hasMatch(text, [/galaxy/, /galaxies/, /spiral/, /elliptical/, /irregular/])) {
    return "Galaxy";
  }

  return "Unknown";
};
