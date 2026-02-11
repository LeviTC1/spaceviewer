export interface SdssItem {
  id: string;
  title: string;
  description: string;
  ra: number;
  dec: number;
  imageUrl: string;
  fullRes: string;
  archiveUrl: string;
  source: "SDSS";
  keywords: string[];
}

const SDSS_CUTOUT_URL = "https://skyserver.sdss.org/dr17/SkyServerWS/ImgCutout/getjpeg";
const SDSS_NAV_URL = "https://skyserver.sdss.org/dr17/en/tools/chart/navi.aspx";

const buildCutoutUrl = (ra: number, dec: number, width: number, height: number, scale: number) => {
  const params = new URLSearchParams({
    ra: ra.toString(),
    dec: dec.toString(),
    width: width.toString(),
    height: height.toString(),
    scale: scale.toString(),
  });
  return `${SDSS_CUTOUT_URL}?${params.toString()}`;
};

export const buildSdssItem = (ra: number, dec: number, targetName: string): SdssItem => {
  const preview = buildCutoutUrl(ra, dec, 640, 640, 0.3);
  const fullRes = buildCutoutUrl(ra, dec, 1400, 1400, 0.2);
  const archiveParams = new URLSearchParams({ ra: ra.toString(), dec: dec.toString() });
  const archiveUrl = `${SDSS_NAV_URL}?${archiveParams.toString()}`;
  const title = `${targetName} · SDSS cutout`;
  const description = `Sloan Digital Sky Survey image cutout centered on ${targetName}.`;

  return {
    id: `sdss-${ra.toFixed(5)}-${dec.toFixed(5)}`,
    title,
    description,
    ra,
    dec,
    imageUrl: preview,
    fullRes,
    archiveUrl,
    source: "SDSS",
    keywords: [targetName, "SDSS", "cutout"],
  };
};
