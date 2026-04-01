import type { IcebergPath } from "../types";

export type LonLat = [number, number];
type XYMeters = [number, number];

export interface KalmanPathOptions {
  /**
   * Observation noise in meters.
   * Higher => trust measurements less => smoother result.
   */
  measurementSigmaMeters?: number;

  /**
   * Process acceleration noise in meters / day^2.
   * Higher => allow stronger turns/changes => less smoothing.
   */
  accelerationSigmaMetersPerDay2?: number;

  /**
   * Used when dates are missing or invalid.
   */
  fallbackDtDays?: number;

  /**
   * Clamp dt to avoid pathological gaps or duplicates.
   */
  minDtDays?: number;
  maxDtDays?: number;
}

type Vec4 = [number, number, number, number];
type Vec2 = [number, number];
type Mat4 = [number[], number[], number[], number[]];
type Mat2 = [number[], number[]];
type Mat2x4 = [number[], number[]];
type Mat4x2 = [number[], number[], number[], number[]];

const EARTH_RADIUS_M = 6371008.8;

const H: Mat2x4 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
];

// -----------------------------------------------------------------------------
// Geo helpers
// -----------------------------------------------------------------------------

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function wrapLongitude180(lon: number): number {
  let x = lon;
  while (x < -180) x += 360;
  while (x > 180) x -= 360;
  return x;
}

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

export function unwrapPathLongitudes(path: LonLat[]): LonLat[] {
  if (path.length === 0) return [];

  const out: LonLat[] = new Array(path.length);
  out[0] = [path[0][0], path[0][1]];

  for (let i = 1; i < path.length; i++) {
    const [lon, lat] = path[i];
    const prevLon = out[i - 1][0];
    out[i] = [unwrapLongitudeNear(lon, prevLon), lat];
  }

  return out;
}

export function wrapPathLongitudes180(path: LonLat[]): LonLat[] {
  return path.map(([lon, lat]) => [wrapLongitude180(lon), lat]);
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
  projected: XYMeters[];
} {
  const unwrapped = unwrapPathLongitudes(path);
  const refLonLat = getReferenceLonLat(unwrapped);

  return {
    refLonLat,
    projected: unwrapped.map((p) => projectLonLatToLocalMeters(p, refLonLat)),
  };
}

// -----------------------------------------------------------------------------
// Date helpers
// -----------------------------------------------------------------------------

function parseDateMs(dateStr: string | undefined): number | undefined {
  if (!dateStr) return undefined;
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? t : undefined;
}

function buildDtDays(
  n: number,
  dates: string[] | undefined,
  fallbackDtDays: number,
  minDtDays: number,
  maxDtDays: number,
): number[] {
  const dts = new Array<number>(Math.max(0, n - 1)).fill(fallbackDtDays);

  if (!dates || dates.length !== n) {
    return dts;
  }

  for (let i = 1; i < n; i++) {
    const t0 = parseDateMs(dates[i - 1]);
    const t1 = parseDateMs(dates[i]);

    let dt = fallbackDtDays;

    if (t0 !== undefined && t1 !== undefined) {
      const raw = (t1 - t0) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(raw) && raw > 0) {
        dt = raw;
      }
    }

    if (dt < minDtDays) dt = minDtDays;
    if (dt > maxDtDays) dt = maxDtDays;

    dts[i - 1] = dt;
  }

  return dts;
}

// -----------------------------------------------------------------------------
// Matrix helpers
// -----------------------------------------------------------------------------

function identity4(): Mat4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const out: Mat4 = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      const aik = a[i][k];
      for (let j = 0; j < 4; j++) {
        out[i][j] += aik * b[k][j];
      }
    }
  }

  return out;
}

function mat4Add(a: Mat4, b: Mat4): Mat4 {
  return [
    [
      a[0][0] + b[0][0],
      a[0][1] + b[0][1],
      a[0][2] + b[0][2],
      a[0][3] + b[0][3],
    ],
    [
      a[1][0] + b[1][0],
      a[1][1] + b[1][1],
      a[1][2] + b[1][2],
      a[1][3] + b[1][3],
    ],
    [
      a[2][0] + b[2][0],
      a[2][1] + b[2][1],
      a[2][2] + b[2][2],
      a[2][3] + b[2][3],
    ],
    [
      a[3][0] + b[3][0],
      a[3][1] + b[3][1],
      a[3][2] + b[3][2],
      a[3][3] + b[3][3],
    ],
  ];
}

function mat4Sub(a: Mat4, b: Mat4): Mat4 {
  return [
    [
      a[0][0] - b[0][0],
      a[0][1] - b[0][1],
      a[0][2] - b[0][2],
      a[0][3] - b[0][3],
    ],
    [
      a[1][0] - b[1][0],
      a[1][1] - b[1][1],
      a[1][2] - b[1][2],
      a[1][3] - b[1][3],
    ],
    [
      a[2][0] - b[2][0],
      a[2][1] - b[2][1],
      a[2][2] - b[2][2],
      a[2][3] - b[2][3],
    ],
    [
      a[3][0] - b[3][0],
      a[3][1] - b[3][1],
      a[3][2] - b[3][2],
      a[3][3] - b[3][3],
    ],
  ];
}

function mat4Transpose(a: Mat4): Mat4 {
  return [
    [a[0][0], a[1][0], a[2][0], a[3][0]],
    [a[0][1], a[1][1], a[2][1], a[3][1]],
    [a[0][2], a[1][2], a[2][2], a[3][2]],
    [a[0][3], a[1][3], a[2][3], a[3][3]],
  ];
}

function mat4Vec4Mul(a: Mat4, x: Vec4): Vec4 {
  return [
    a[0][0] * x[0] + a[0][1] * x[1] + a[0][2] * x[2] + a[0][3] * x[3],
    a[1][0] * x[0] + a[1][1] * x[1] + a[1][2] * x[2] + a[1][3] * x[3],
    a[2][0] * x[0] + a[2][1] * x[1] + a[2][2] * x[2] + a[2][3] * x[3],
    a[3][0] * x[0] + a[3][1] * x[1] + a[3][2] * x[2] + a[3][3] * x[3],
  ];
}

function mat2Add(a: Mat2, b: Mat2): Mat2 {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1]],
  ];
}

function invert2(a: Mat2): Mat2 {
  const det = a[0][0] * a[1][1] - a[0][1] * a[1][0];

  if (Math.abs(det) < 1e-12) {
    throw new Error("2x2 matrix is singular.");
  }

  const invDet = 1 / det;

  return [
    [a[1][1] * invDet, -a[0][1] * invDet],
    [-a[1][0] * invDet, a[0][0] * invDet],
  ];
}

function mat2x4Mul4(a: Mat2x4, b: Mat4): Mat2x4 {
  const out: Mat2x4 = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let i = 0; i < 2; i++) {
    for (let k = 0; k < 4; k++) {
      const aik = a[i][k];
      for (let j = 0; j < 4; j++) {
        out[i][j] += aik * b[k][j];
      }
    }
  }

  return out;
}

function mat4Mul4x2(a: Mat4, b: Mat4x2): Mat4x2 {
  const out: Mat4x2 = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];

  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      const aik = a[i][k];
      for (let j = 0; j < 2; j++) {
        out[i][j] += aik * b[k][j];
      }
    }
  }

  return out;
}

function mat4x2Mul2x2(a: Mat4x2, b: Mat2): Mat4x2 {
  const out: Mat4x2 = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];

  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 2; k++) {
      const aik = a[i][k];
      for (let j = 0; j < 2; j++) {
        out[i][j] += aik * b[k][j];
      }
    }
  }

  return out;
}

function mat4x2Mul2x4(a: Mat4x2, b: Mat2x4): Mat4 {
  const out: Mat4 = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 2; k++) {
      const aik = a[i][k];
      for (let j = 0; j < 4; j++) {
        out[i][j] += aik * b[k][j];
      }
    }
  }

  return out;
}

function mat2x4Vec4Mul(a: Mat2x4, x: Vec4): Vec2 {
  return [
    a[0][0] * x[0] + a[0][1] * x[1] + a[0][2] * x[2] + a[0][3] * x[3],
    a[1][0] * x[0] + a[1][1] * x[1] + a[1][2] * x[2] + a[1][3] * x[3],
  ];
}

function mat4x2Vec2Mul(a: Mat4x2, x: Vec2): Vec4 {
  return [
    a[0][0] * x[0] + a[0][1] * x[1],
    a[1][0] * x[0] + a[1][1] * x[1],
    a[2][0] * x[0] + a[2][1] * x[1],
    a[3][0] * x[0] + a[3][1] * x[1],
  ];
}

function vec4Add(a: Vec4, b: Vec4): Vec4 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
}

function vec2Sub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

// -----------------------------------------------------------------------------
// Kalman model helpers
// -----------------------------------------------------------------------------

function makeTransition(dtDays: number): Mat4 {
  return [
    [1, 0, dtDays, 0],
    [0, 1, 0, dtDays],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function makeProcessNoise(dtDays: number, sigmaA: number): Mat4 {
  const dt2 = dtDays * dtDays;
  const dt3 = dt2 * dtDays;
  const dt4 = dt2 * dt2;
  const q = sigmaA * sigmaA;

  return [
    [(q * dt4) / 4, 0, (q * dt3) / 2, 0],
    [0, (q * dt4) / 4, 0, (q * dt3) / 2],
    [(q * dt3) / 2, 0, q * dt2, 0],
    [0, (q * dt3) / 2, 0, q * dt2],
  ];
}

function makeMeasurementNoise(sigmaZ: number): Mat2 {
  const r = sigmaZ * sigmaZ;
  return [
    [r, 0],
    [0, r],
  ];
}

function initialVelocity(points: XYMeters[], dts: number[]): Vec2 {
  if (points.length < 2) return [0, 0];
  const dt = Math.max(dts[0] ?? 1, 1e-9);

  return [
    (points[1][0] - points[0][0]) / dt,
    (points[1][1] - points[0][1]) / dt,
  ];
}

// -----------------------------------------------------------------------------
// Core filter
// -----------------------------------------------------------------------------

export function smoothPathKalmanMeters(
  path: LonLat[],
  dates?: string[],
  options: KalmanPathOptions = {},
): LonLat[] {
  const n = path.length;
  if (n <= 2) return path.slice();

  const measurementSigmaMeters = options.measurementSigmaMeters ?? 10_000;
  const accelerationSigmaMetersPerDay2 =
    options.accelerationSigmaMetersPerDay2 ?? 1_000;
  const fallbackDtDays = options.fallbackDtDays ?? 1;
  const minDtDays = options.minDtDays ?? 0.25;
  const maxDtDays = options.maxDtDays ?? 30;

  const { refLonLat, projected } = projectPathToLocalMeters(path);

  const dts = buildDtDays(n, dates, fallbackDtDays, minDtDays, maxDtDays);

  const R = makeMeasurementNoise(measurementSigmaMeters);
  const filtered: XYMeters[] = new Array(n);

  const [vx0, vy0] = initialVelocity(projected, dts);
  let x: Vec4 = [projected[0][0], projected[0][1], vx0, vy0];

  let P: Mat4 = [
    [measurementSigmaMeters ** 2, 0, 0, 0],
    [0, measurementSigmaMeters ** 2, 0, 0],
    [0, 0, 1e8, 0],
    [0, 0, 0, 1e8],
  ];

  filtered[0] = [x[0], x[1]];

  const HT: Mat4x2 = [
    [1, 0],
    [0, 1],
    [0, 0],
    [0, 0],
  ];

  for (let i = 1; i < n; i++) {
    const dt = dts[i - 1];
    const F = makeTransition(dt);
    const Q = makeProcessNoise(dt, accelerationSigmaMetersPerDay2);

    // Predict
    const xPred = mat4Vec4Mul(F, x);
    const PPred = mat4Add(mat4Mul(mat4Mul(F, P), mat4Transpose(F)), Q);

    // Update
    const z: Vec2 = [projected[i][0], projected[i][1]];
    const y = vec2Sub(z, mat2x4Vec4Mul(H, xPred)); // innovation

    const HP = mat2x4Mul4(H, PPred); // 2x4
    const PHt = mat4Mul4x2(PPred, HT); // 4x2

    const S: Mat2 = mat2Add(
      [
        [HP[0][0], HP[0][1]],
        [HP[1][0], HP[1][1]],
      ],
      R,
    );

    const SInv = invert2(S);
    const K = mat4x2Mul2x2(PHt, SInv); // 4x2

    x = vec4Add(xPred, mat4x2Vec2Mul(K, y));

    const KH = mat4x2Mul2x4(K, H);
    P = mat4Mul(mat4Sub(identity4(), KH), PPred);

    filtered[i] = [x[0], x[1]];
  }

  const outUnwrapped: LonLat[] = filtered.map((xy) =>
    unprojectLocalMetersToLonLat(xy, refLonLat),
  );

  return wrapPathLongitudes180(outUnwrapped);
}

// -----------------------------------------------------------------------------
// IcebergPath wrappers
// -----------------------------------------------------------------------------

function validateIcebergPathDates(icebergPath: {
  id: string;
  path: LonLat[];
  dates?: string[];
}): void {
  if (
    icebergPath.dates &&
    icebergPath.dates.length !== icebergPath.path.length
  ) {
    throw new Error(
      `IcebergPath ${icebergPath.id}: dates length (${icebergPath.dates.length}) does not match path length (${icebergPath.path.length}).`,
    );
  }
}

export function smoothIcebergPathKalman<
  T extends {
    id: string;
    path: LonLat[];
    count: number;
    firstDate: string;
    lastDate: string;
    colorIndex: string;
    dates?: string[];
  },
>(icebergPath: T, options: KalmanPathOptions = {}): T {
  validateIcebergPathDates(icebergPath);

  if (icebergPath.path.length <= 2) {
    return {
      ...icebergPath,
      count: icebergPath.path.length,
      dates: icebergPath.dates ? icebergPath.dates.slice() : undefined,
    };
  }

  return {
    ...icebergPath,
    path: smoothPathKalmanMeters(icebergPath.path, icebergPath.dates, options),
    count: icebergPath.path.length,
    firstDate: icebergPath.firstDate,
    lastDate: icebergPath.lastDate,
    dates: icebergPath.dates ? icebergPath.dates.slice() : undefined,
  };
}

export function smoothIcebergPathsKalman<
  T extends {
    id: string;
    path: LonLat[];
    count: number;
    firstDate: string;
    lastDate: string;
    colorIndex: string;
    dates?: string[];
  },
>(icebergPaths: T[], options: KalmanPathOptions = {}): T[] {
  return icebergPaths.map((p) => smoothIcebergPathKalman(p, options));
}
