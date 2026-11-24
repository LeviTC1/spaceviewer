import axios from "axios";

export interface Ps1Item {
  id: string;
  title: string;
  description: string;
  ra: number;
  dec: number;
  imageUrl: string;
  fullRes: string;
  archiveUrl: string;
  source: "Pan-STARRS";
  keywords: string[];
}

const PS1_FILENAMES_URL = "https://ps1images.stsci.edu/cgi-bin/ps1filenames.py";
const PS1_CUTOUT_URL = "https://ps1images.stsci.edu/cgi-bin/fitscut.cgi";
const PS1_VIEW_URL = "https://ps1images.stsci.edu/cgi-bin/ps1cutouts";
const PS1_TIMEOUT_MS = 10000;

const parseFilenames = (text: string): Record<string, string> => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return {};
  }

  const header = lines[0].trim().split(/\s+/);
  const filterIndex = header.indexOf("filter");
  const filenameIndex = header.indexOf("filename");
  if (filterIndex === -1 || filenameIndex === -1) {
    return {};
  }

  const mapping: Record<string, string> = {};
  for (let i = 1; i < lines.length; i += 1) {
    const columns = lines[i].trim().split(/\s+/);
    const filter = columns[filterIndex];
    const filename = columns[filenameIndex];
    if (filter && filename && !mapping[filter]) {
      mapping[filter] = filename;
    }
  }

  return mapping;
};

const buildCutoutUrl = (
  ra: number,
  dec: number,
  size: number,
  colors: { red?: string; green?: string; blue?: string },
) => {
  const params = new URLSearchParams({
    ra: ra.toString(),
    dec: dec.toString(),
    size: size.toString(),
    format: "jpg",
  });
  if (colors.red) {
    params.set("red", colors.red);
  }
  if (colors.green) {
    params.set("green", colors.green);
  }
  if (colors.blue) {
    params.set("blue", colors.blue);
  }
  return `${PS1_CUTOUT_URL}?${params.toString()}`;
};

export const getPs1ServiceDiagnostics = () => ({
  endpoint: {
    filenames: PS1_FILENAMES_URL,
    cutout: PS1_CUTOUT_URL,
    viewer: PS1_VIEW_URL,
  },
  timeoutMs: PS1_TIMEOUT_MS,
});

export const buildPs1Item = async (ra: number, dec: number, targetName: string): Promise<Ps1Item | null> => {
  const filters = "gri";
  const filenameParams = new URLSearchParams({
    ra: ra.toString(),
    dec: dec.toString(),
    size: "240",
    filters,
  });

  try {
    const response = await axios.get(`${PS1_FILENAMES_URL}?${filenameParams.toString()}`, {
      headers: { "User-Agent": "SpaceViewer" },
      timeout: PS1_TIMEOUT_MS,
    });
    const filenameMap = parseFilenames(String(response.data));
    if (!Object.keys(filenameMap).length) {
      return null;
    }

    const pick = (options: string[]) => options.find((option) => filenameMap[option]);
    const red = pick(["i", "z", "y", "r"]);
    const green = pick(["r", "g", "i"]);
    const blue = pick(["g", "r"]);
    const isRgb = Boolean(red && green && blue);
    const fallback = red || green || blue;
    if (!fallback) {
      return null;
    }

    const preview = buildCutoutUrl(ra, dec, 640, isRgb ? { red, green, blue } : { red: fallback });
    const fullRes = buildCutoutUrl(ra, dec, 1400, isRgb ? { red, green, blue } : { red: fallback });
    const archiveParams = new URLSearchParams({
      pos: `${ra},${dec}`,
      size: "240",
      filters,
    });
    const archiveUrl = `${PS1_VIEW_URL}?${archiveParams.toString()}`;
    const title = `${targetName} · Pan-STARRS cutout`;
    const description = isRgb
      ? `Pan-STARRS RGB composite cutout centered on ${targetName}.`
      : `Pan-STARRS image cutout centered on ${targetName}.`;

    return {
      id: `ps1-${ra.toFixed(5)}-${dec.toFixed(5)}`,
      title,
      description,
      ra,
      dec,
      imageUrl: preview,
      fullRes,
      archiveUrl,
      source: "Pan-STARRS",
      keywords: [targetName, "Pan-STARRS", isRgb ? "RGB composite" : "cutout"],
    };
  } catch (error) {
    console.error("buildPs1Item error", error);
    throw error;
  }
};
