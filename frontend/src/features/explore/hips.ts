// HiPS (Hierarchical Progressive Surveys) helpers: HEALPix NESTED indexing, tile addressing and a
// gnomonic (TAN) cutout geometry. Used to build north-up, true-scale survey photographs of any patch
// of sky from public HiPS tile servers (DSS2 colour via ESA's ESASky mirror).
//
// HEALPix follows Górski et al. (2005); the continuous face coordinates below are the floating-point
// form of healpix_base's ang2pix_nest so a sample can also be located inside its pixel.

export const DSS2_COLOR_HIPS = {
  id: "CDS/P/DSS2/color",
  base: "https://skies.esac.esa.int/DSSColor",
  maxOrder: 9,
  tileWidth: 512,
  format: "jpg",
  credit: "Digitized Sky Survey (STScI/NASA), colour HiPS by CDS; served by ESA ESASky",
  ack: "The Digitized Sky Surveys were produced at the Space Telescope Science Institute under U.S. Government grant NAG W-2166.",
};

const interleave = (x: number, y: number) => {
  // Spread bits of x to even positions and y to odd positions (supports up to 26-bit inputs).
  let result = 0;
  let bit = 1;
  for (let i = 0; i < 26; i += 1) {
    if (x & (1 << i)) result += bit;
    bit *= 2;
    if (y & (1 << i)) result += bit;
    bit *= 2;
  }
  return result;
};

export interface FacePoint {
  face: number;
  /** Continuous coordinates inside the face, in units of pixels at the given nside. */
  ix: number;
  iy: number;
}

/** Locate a direction (RA, Dec in radians) on a HEALPix face at a given nside, continuously. */
export const faceCoordinates = (ra: number, dec: number, nside: number): FacePoint => {
  const z = Math.sin(dec);
  const za = Math.abs(z);
  let tt = (ra / (Math.PI / 2)) % 4;
  if (tt < 0) tt += 4;
  if (za <= 2 / 3) {
    const temp1 = nside * (0.5 + tt);
    const temp2 = nside * z * 0.75;
    const jp = temp1 - temp2;
    const jm = temp1 + temp2;
    const ifp = Math.floor(jp / nside);
    const ifm = Math.floor(jm / nside);
    const face = ifp === ifm ? (ifp % 4) | 4 : ifp < ifm ? ifp % 4 : (ifm % 4) + 8;
    const ix = jm - ifm * nside;
    const iy = nside - (jp - ifp * nside);
    return { face, ix, iy };
  }
  const ntt = Math.min(3, Math.floor(tt));
  const tp = tt - ntt;
  const tmp = nside * Math.sqrt(3 * (1 - za));
  const jp = tp * tmp;
  const jm = (1 - tp) * tmp;
  if (z > 0) return { face: ntt, ix: nside - jm, iy: nside - jp };
  return { face: ntt + 8, ix: jp, iy: jm };
};

/** HEALPix NESTED pixel index of a direction at nside (= 2^order). */
export const ang2pixNest = (ra: number, dec: number, order: number) => {
  const nside = 2 ** order;
  const { face, ix, iy } = faceCoordinates(ra, dec, nside);
  const x = Math.min(nside - 1, Math.max(0, Math.floor(ix)));
  const y = Math.min(nside - 1, Math.max(0, Math.floor(iy)));
  return face * nside * nside + interleave(x, y);
};

/**
 * Pixel layout of NESTED sub-pixels inside a HiPS tile image. Of the eight possible flips/transposes,
 * layout 4 (image column = local y, image row = local x) is the one that renders DSS2 colour fields
 * without seams across tile edges, and it puts M110 north-west of M31 and M43 north of M42.
 */
export const TILE_VARIANT = 4;

export interface TileSample {
  /** Tile (NESTED pixel at the tile order). */
  npix: number;
  /** Pixel inside the 512×512 tile image. */
  col: number;
  row: number;
}

/** Where a direction falls in a HiPS tile at `tileOrder`: the tile, and the pixel inside its image. */
export const tileSample = (ra: number, dec: number, tileOrder: number, tileWidthLog2 = 9, variant = TILE_VARIANT): TileSample => {
  const order = tileOrder + tileWidthLog2;
  const nside = 2 ** order;
  const width = 2 ** tileWidthLog2;
  const { face, ix, iy } = faceCoordinates(ra, dec, nside);
  const x = Math.min(nside - 1, Math.max(0, Math.floor(ix)));
  const y = Math.min(nside - 1, Math.max(0, Math.floor(iy)));
  const tileX = Math.floor(x / width);
  const tileY = Math.floor(y / width);
  const tilesPerFace = 4 ** tileOrder;
  const npix = face * tilesPerFace + interleave(tileX, tileY);
  const lx = x - tileX * width;
  const ly = y - tileY * width;
  const w = width - 1;
  const [col, row] =
    variant === 0 ? [lx, ly] : variant === 1 ? [lx, w - ly] : variant === 2 ? [w - lx, ly] : variant === 3 ? [w - lx, w - ly]
    : variant === 4 ? [ly, lx] : variant === 5 ? [ly, w - lx] : variant === 6 ? [w - ly, lx] : [w - ly, w - lx];
  return { npix, col, row };
};

export const tileUrl = (base: string, order: number, npix: number, format = "jpg") =>
  `${base}/Norder${order}/Dir${Math.floor(npix / 10_000) * 10_000}/Npix${npix}.${format}`;

/** Angular size of one pixel at a HEALPix order, in degrees. */
export const pixelSizeDeg = (order: number) => (Math.sqrt((4 * Math.PI) / (12 * 4 ** order)) * 180) / Math.PI;

/** Choose the tile order whose pixels best match the requested cutout resolution. */
export const chooseTileOrder = (fovDeg: number, widthPx: number, maxOrder: number, tileWidthLog2 = 9) => {
  const wanted = fovDeg / widthPx;
  for (let tileOrder = 0; tileOrder <= maxOrder; tileOrder += 1) {
    if (pixelSizeDeg(tileOrder + tileWidthLog2) <= wanted) return tileOrder;
  }
  return maxOrder;
};

/** Inverse gnomonic projection: offset (xi, eta) in radians on the tangent plane → RA/Dec. */
export const tanToRaDec = (ra0: number, dec0: number, xi: number, eta: number) => {
  const sinD0 = Math.sin(dec0);
  const cosD0 = Math.cos(dec0);
  const denom = cosD0 - eta * sinD0;
  const ra = ra0 + Math.atan2(xi, denom);
  const dec = Math.atan2(sinD0 + eta * cosD0, Math.hypot(xi, denom));
  return { ra: ((ra % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), dec };
};
