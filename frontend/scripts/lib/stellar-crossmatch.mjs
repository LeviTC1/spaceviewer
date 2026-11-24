import { createHash } from "node:crypto";

export const EXOPLANET_GAIA_CROSSMATCH_METHOD =
  "nasa-exoplanet-archive-gaia-dr3-source-id-exact";
export const EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC = 10;

const cleanString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56) || "system";

export const stableExoplanetSystemId = (hostName) =>
  `exoplanet-system:${slugify(hostName)}-${createHash("sha256").update(hostName).digest("hex").slice(0, 8)}`;

export const parseGaiaDr3SourceId = (value) => {
  const normalized = cleanString(value);
  if (!normalized) return undefined;
  const match = /^Gaia DR3 (\d+)$/.exec(normalized);
  return match?.[1];
};

export const buildExoplanetHostIdentityIndex = (rows) => {
  const index = new Map();
  for (const row of rows) {
    const hostName = cleanString(row.hostname);
    const sourceId = parseGaiaDr3SourceId(row.gaia_dr3_id);
    if (!hostName || !sourceId) continue;
    const existing = index.get(sourceId);
    if (existing && existing.hostName !== hostName) {
      throw new Error(`Gaia DR3 source ${sourceId} maps to multiple exoplanet hosts.`);
    }
    const aliases = new Set(existing?.aliases ?? []);
    [hostName, cleanString(row.gaia_dr2_id), cleanString(row.hip_name), cleanString(row.hd_name), cleanString(row.tic_id)]
      .filter(Boolean)
      .forEach((alias) => aliases.add(alias));
    index.set(sourceId, {
      sourceId,
      hostName,
      systemId: stableExoplanetSystemId(hostName),
      aliases: Array.from(aliases).sort((left, right) => left.localeCompare(right)),
    });
  }
  return index;
};

export const buildGaiaAstrometryIndex = (csvBuffer) => {
  const lines = csvBuffer.toString("utf8").trim().split(/\r?\n/);
  const columns = lines.shift()?.split(",") ?? [];
  const sourceIdIndex = columns.indexOf("source_id");
  const raIndex = columns.indexOf("ra");
  const decIndex = columns.indexOf("dec");
  const parallaxIndex = columns.indexOf("parallax");
  if ([sourceIdIndex, raIndex, decIndex, parallaxIndex].some((index) => index < 0)) {
    throw new Error("Gaia source snapshot is missing cross-match astrometry columns.");
  }
  const index = new Map();
  lines.forEach((line, rowIndex) => {
    const values = line.split(",");
    const sourceId = values[sourceIdIndex];
    const raDeg = Number(values[raIndex]);
    const decDeg = Number(values[decIndex]);
    const parallaxMas = Number(values[parallaxIndex]);
    if (!/^\d+$/.test(sourceId) || !Number.isFinite(raDeg) || !Number.isFinite(decDeg) || !(parallaxMas > 0)) {
      throw new Error(`Gaia cross-match row ${rowIndex + 2} is invalid.`);
    }
    if (index.has(sourceId)) throw new Error(`Duplicate Gaia source ${sourceId} in cross-match snapshot.`);
    index.set(sourceId, {
      sourceId,
      raDeg,
      decDeg,
      inverseParallaxDistancePc: 1000 / parallaxMas,
    });
  });
  return index;
};

export const calculateAngularSeparationArcsec = (left, right) => {
  const degreesToRadians = Math.PI / 180;
  const leftRa = left.raDeg * degreesToRadians;
  const rightRa = right.raDeg * degreesToRadians;
  const leftDec = left.decDeg * degreesToRadians;
  const rightDec = right.decDeg * degreesToRadians;
  const dot =
    Math.sin(leftDec) * Math.sin(rightDec) +
    Math.cos(leftDec) * Math.cos(rightDec) * Math.cos(leftRa - rightRa);
  return (Math.acos(Math.max(-1, Math.min(1, dot))) / degreesToRadians) * 3600;
};

export const createExactGaiaRendererCrossmatch = ({
  sourceId,
  hostName,
  raDeg,
  decDeg,
  distancePc,
  gaiaRecord,
  gaiaCatalog,
}) => {
  if (!sourceId || !gaiaRecord) return undefined;
  const angularSeparationArcsec = calculateAngularSeparationArcsec(
    { raDeg, decDeg },
    gaiaRecord,
  );
  if (angularSeparationArcsec > EXOPLANET_GAIA_MAX_ANGULAR_SEPARATION_ARCSEC) {
    throw new Error(
      `${hostName} exact Gaia DR3 identifier differs by ${angularSeparationArcsec.toFixed(3)} arcsec.`,
    );
  }
  return {
    sourceId,
    rendererObjectId: `star:gaia-dr3:${sourceId}`,
    method: EXOPLANET_GAIA_CROSSMATCH_METHOD,
    gaiaCatalogId: gaiaCatalog.id,
    gaiaCatalogVersion: gaiaCatalog.version,
    gaiaReferenceEpoch: gaiaCatalog.epoch.value,
    angularSeparationArcsec,
    gaiaInverseParallaxDistancePc: gaiaRecord.inverseParallaxDistancePc,
    distanceDifferencePc: Math.abs(distancePc - gaiaRecord.inverseParallaxDistancePc),
  };
};
