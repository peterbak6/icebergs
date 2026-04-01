import type { IcebergPath } from "../types";

export type LonLat = [number, number];
export type XYMeters = [number, number];

export interface SavitzkyGolayOptions {
  /**
   * Odd window size, e.g. 5, 7, 9, 11.
   */
  windowSize: number;

  /**
   * Polynomial order, must be < windowSize.
   * Typical values: 2 or 3.
   */
  polynomialOrder: number;

  /**
   * Number of repeated smoothing passes.
   * Usually 1 is enough, sometimes 2.
   */
  passes?: number;

  /**
   * If true, leaves edge points unchanged where a full window does not fit.
   * This is the safest default for trajectories.
   */
  preserveEdges?: boolean;
}

const EARTH_RADIUS_M = 6371008.8;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function validateIcebergPathDates(icebergPath: IcebergPath): void {
  if (
    icebergPath.dates &&
    icebergPath.dates.length !== icebergPath.path.length
  ) {
    throw new Error(
      `IcebergPath ${icebergPath.id}: dates length (${icebergPath.dates.length}) does not match path length (${icebergPath.path.length}).`,
    );
  }
}

function getReferenceLonLat(path: LonLat[]): LonLat {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of path) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [(minLon + maxLon) * 0.5, (minLat + maxLat) * 0.5];
}

function projectLonLatToLocalMeters(
  lonLat: LonLat,
  refLonLat: LonLat,
): XYMeters {
  const [lon, lat] = lonLat;
  const [refLon, refLat] = refLonLat;

  const lonRad = degToRad(lon);
  const latRad = degToRad(lat);
  const refLonRad = degToRad(refLon);
  const refLatRad = degToRad(refLat);

  const x = (lonRad - refLonRad) * Math.cos(refLatRad) * EARTH_RADIUS_M;
  const y = (latRad - refLatRad) * EARTH_RADIUS_M;

  return [x, y];
}

function unprojectLocalMetersToLonLat(xy: XYMeters, refLonLat: LonLat): LonLat {
  const [x, y] = xy;
  const [refLon, refLat] = refLonLat;

  const refLonRad = degToRad(refLon);
  const refLatRad = degToRad(refLat);

  const latRad = y / EARTH_RADIUS_M + refLatRad;
  const lonRad = x / (EARTH_RADIUS_M * Math.cos(refLatRad)) + refLonRad;

  return [radToDeg(lonRad), radToDeg(latRad)];
}

function projectPathToLocalMeters(path: LonLat[]): {
  refLonLat: LonLat;
  projected: [number, number][];
} {
  const unwrapped = unwrapPathLongitudes(path);
  const refLonLat = getReferenceLonLat(unwrapped);

  return {
    refLonLat,
    projected: unwrapped.map((p) => projectLonLatToLocalMeters(p, refLonLat)),
  };
}

function wrapLongitude180(lon: number): number {
  let x = lon;
  while (x < -180) x += 360;
  while (x > 180) x -= 360;
  return x;
}

/**
 * Convert a longitude to the equivalent value closest to referenceLon.
 * Example:
 *   lon = -179.9, referenceLon = 179.9  => 180.1
 */
function unwrapLongitudeNear(lon: number, referenceLon: number): number {
  let bestLon = lon;
  let bestDiff = Math.abs(lon - referenceLon);

  const lonPlus = lon + 360;
  const diffPlus = Math.abs(lonPlus - referenceLon);
  if (diffPlus < bestDiff) {
    bestLon = lonPlus;
    bestDiff = diffPlus;
  }

  const lonMinus = lon - 360;
  const diffMinus = Math.abs(lonMinus - referenceLon);
  if (diffMinus < bestDiff) {
    bestLon = lonMinus;
  }

  return bestLon;
}

/**
 * Unwrap a path so longitude is continuous across the antimeridian.
 * Latitudes are unchanged.
 */
export function unwrapPathLongitudes(path: LonLat[]): LonLat[] {
  if (path.length === 0) return [];

  const out: LonLat[] = new Array(path.length);
  out[0] = [path[0][0], path[0][1]];

  for (let i = 1; i < path.length; i++) {
    const [lon, lat] = path[i];
    const prevLon = out[i - 1][0];
    const unwrappedLon = unwrapLongitudeNear(lon, prevLon);
    out[i] = [unwrappedLon, lat];
  }

  return out;
}

/**
 * Re-wrap a path back to [-180, 180] for display/output.
 */
export function wrapPathLongitudes180(path: LonLat[]): LonLat[] {
  return path.map(([lon, lat]) => [wrapLongitude180(lon), lat]);
}

function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const out: number[][] = Array.from({ length: cols }, () =>
    new Array(rows).fill(0),
  );

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[c][r] = matrix[r][c];
    }
  }

  return out;
}

function multiplyMatrices(a: number[][], b: number[][]): number[][] {
  const aRows = a.length;
  const aCols = a[0].length;
  const bCols = b[0].length;

  const out: number[][] = Array.from({ length: aRows }, () =>
    new Array(bCols).fill(0),
  );

  for (let i = 0; i < aRows; i++) {
    for (let k = 0; k < aCols; k++) {
      const aik = a[i][k];
      for (let j = 0; j < bCols; j++) {
        out[i][j] += aik * b[k][j];
      }
    }
  }

  return out;
}

function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  const inv: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(a[col][col]);

    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(a[r][col]);
      if (v > maxAbs) {
        maxAbs = v;
        pivotRow = r;
      }
    }

    if (maxAbs === 0) {
      throw new Error("Matrix is singular and cannot be inverted.");
    }

    if (pivotRow !== col) {
      [a[col], a[pivotRow]] = [a[pivotRow], a[col]];
      [inv[col], inv[pivotRow]] = [inv[pivotRow], inv[col]];
    }

    const pivot = a[col][col];
    for (let j = 0; j < n; j++) {
      a[col][j] /= pivot;
      inv[col][j] /= pivot;
    }

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r][col];
      if (factor === 0) continue;

      for (let j = 0; j < n; j++) {
        a[r][j] -= factor * a[col][j];
        inv[r][j] -= factor * inv[col][j];
      }
    }
  }

  return inv;
}

/**
 * Build SG smoothing coefficients for the center point of an odd window.
 *
 * Example:
 * - windowSize = 5
 * - polynomialOrder = 2
 *
 * Returns an array of length windowSize.
 */
export function getSavitzkyGolayCoefficients(
  windowSize: number,
  polynomialOrder: number,
): number[] {
  if (windowSize < 3 || windowSize % 2 === 0) {
    throw new Error("windowSize must be an odd integer >= 3.");
  }

  if (polynomialOrder < 0) {
    throw new Error("polynomialOrder must be >= 0.");
  }

  if (polynomialOrder >= windowSize) {
    throw new Error("polynomialOrder must be < windowSize.");
  }

  const half = Math.floor(windowSize / 2);

  // Design matrix A: rows are sample offsets, columns are polynomial powers
  // offset = -half ... +half
  const A: number[][] = [];
  for (let i = -half; i <= half; i++) {
    const row: number[] = [];
    for (let p = 0; p <= polynomialOrder; p++) {
      row.push(Math.pow(i, p));
    }
    A.push(row);
  }

  const AT = transpose(A);
  const ATA = multiplyMatrices(AT, A);
  const ATAInv = invertMatrix(ATA);
  const pseudoInv = multiplyMatrices(ATAInv, AT);

  // For smoothing at the center, evaluate polynomial at x = 0.
  // The evaluation vector is [1, 0, 0, ...], so we take row 0.
  return pseudoInv[0].slice();
}

function smooth1DSavitzkyGolay(
  values: number[],
  coefficients: number[],
  preserveEdges: boolean,
): number[] {
  const n = values.length;
  const windowSize = coefficients.length;
  const half = Math.floor(windowSize / 2);

  if (n <= windowSize) {
    return values.slice();
  }

  const out = values.slice();

  for (let i = 0; i < n; i++) {
    const start = i - half;
    const end = i + half;

    if (start < 0 || end >= n) {
      if (preserveEdges) {
        out[i] = values[i];
      } else {
        // Clamp sampling at boundaries
        let sum = 0;
        for (let k = 0; k < windowSize; k++) {
          let idx = i + k - half;
          if (idx < 0) idx = 0;
          if (idx >= n) idx = n - 1;
          sum += coefficients[k] * values[idx];
        }
        out[i] = sum;
      }
      continue;
    }

    let sum = 0;
    for (let k = 0; k < windowSize; k++) {
      sum += coefficients[k] * values[start + k];
    }
    out[i] = sum;
  }

  return out;
}

export function smoothPathSavitzkyGolayMeters(
  path: LonLat[],
  options: SavitzkyGolayOptions,
): LonLat[] {
  const {
    windowSize,
    polynomialOrder,
    passes = 1,
    preserveEdges = true,
  } = options;

  if (path.length <= 2) {
    return path.slice();
  }

  if (windowSize >= path.length) {
    return path.slice();
  }

  const coefficients = getSavitzkyGolayCoefficients(
    windowSize,
    polynomialOrder,
  );

  const { refLonLat, projected } = projectPathToLocalMeters(path);

  let xs = projected.map((p) => p[0]);
  let ys = projected.map((p) => p[1]);

  for (let pass = 0; pass < passes; pass++) {
    xs = smooth1DSavitzkyGolay(xs, coefficients, preserveEdges);
    ys = smooth1DSavitzkyGolay(ys, coefficients, preserveEdges);
  }

  const smoothed: LonLat[] = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    smoothed[i] = unprojectLocalMetersToLonLat([xs[i], ys[i]], refLonLat);
  }

  return wrapPathLongitudes180(smoothed);
}

export function smoothIcebergPathSavitzkyGolay(
  icebergPath: IcebergPath,
  options: SavitzkyGolayOptions,
): IcebergPath {
  validateIcebergPathDates(icebergPath);

  if (icebergPath.path.length <= 2) {
    return {
      ...icebergPath,
      count: icebergPath.path.length,
    };
  }

  return {
    ...icebergPath,
    path: smoothPathSavitzkyGolayMeters(icebergPath.path, options),
    count: icebergPath.path.length,
    firstDate: icebergPath.firstDate,
    lastDate: icebergPath.lastDate,
    dates: icebergPath.dates ? icebergPath.dates.slice() : undefined,
  };
}

export function smoothIcebergPathsSavitzkyGolay(
  icebergPaths: IcebergPath[],
  options: SavitzkyGolayOptions,
): IcebergPath[] {
  return icebergPaths.map((p) => smoothIcebergPathSavitzkyGolay(p, options));
}
