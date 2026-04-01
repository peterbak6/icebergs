import type { IcebergPath } from "../types";

export type LonLat = [number, number];

export interface RDPMetersOptions {
  /**
   * Simplification tolerance in meters.
   */
  epsilonMeters: number;
}

/**
 * Mean Earth radius in meters.
 */
const EARTH_RADIUS_M = 6371008.8;

/**
 * Converts degrees to radians.
 */
function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Validate optional dates array.
 */
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

/**
 * Compute a stable local reference point for the path.
 * Using the bbox center is cheap and robust.
 */
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

export type XYMeters = [number, number];

/**
 * Project lon/lat to a local tangent-plane approximation in meters.
 *
 * x = east-west meters
 * y = north-south meters
 *
 * This is effectively an equirectangular local projection centered on refLon/refLat.
 * For single trajectories this is usually a very good tradeoff between accuracy and speed.
 */
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

/**
 * Project an entire lon/lat path into local meters.
 */
function projectPathToLocalMeters(path: LonLat[]): XYMeters[] {
  const ref = getReferenceLonLat(path);
  return path.map((p) => projectLonLatToLocalMeters(p, ref));
}

/**
 * Squared perpendicular distance from point p to segment a-b in planar meters.
 * Projection is clamped to the segment.
 */
function perpendicularDistanceSqMeters(
  p: XYMeters,
  a: XYMeters,
  b: XYMeters,
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);

  // Clamp to segment
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  const ex = px - projX;
  const ey = py - projY;

  return ex * ex + ey * ey;
}

/**
 * Recursive RDP over projected meter coordinates.
 */
function rdpRecursiveMeters(
  points: XYMeters[],
  startIndex: number,
  endIndex: number,
  epsilonSq: number,
  keep: boolean[],
): void {
  if (endIndex <= startIndex + 1) return;

  const a = points[startIndex];
  const b = points[endIndex];

  let maxDistSq = -1;
  let maxIndex = -1;

  for (let i = startIndex + 1; i < endIndex; i++) {
    const distSq = perpendicularDistanceSqMeters(points[i], a, b);
    if (distSq > maxDistSq) {
      maxDistSq = distSq;
      maxIndex = i;
    }
  }

  if (maxDistSq > epsilonSq && maxIndex !== -1) {
    keep[maxIndex] = true;
    rdpRecursiveMeters(points, startIndex, maxIndex, epsilonSq, keep);
    rdpRecursiveMeters(points, maxIndex, endIndex, epsilonSq, keep);
  }
}

/**
 * Returns the indices kept by RDP, where epsilon is in meters.
 */
export function simplifyRDPIndicesMeters(
  lonLatPoints: LonLat[],
  epsilonMeters: number,
): number[] {
  const n = lonLatPoints.length;

  if (n <= 2) {
    return lonLatPoints.map((_, i) => i);
  }

  if (epsilonMeters <= 0) {
    return lonLatPoints.map((_, i) => i);
  }

  const projected = projectPathToLocalMeters(lonLatPoints);

  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;

  rdpRecursiveMeters(projected, 0, n - 1, epsilonMeters * epsilonMeters, keep);

  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) indices.push(i);
  }

  return indices;
}

/**
 * Apply kept indices to path and optional dates.
 */
export function pickIcebergPathIndices(
  icebergPath: IcebergPath,
  indices: number[],
): IcebergPath {
  const newPath = indices.map((i) => icebergPath.path[i]);

  const newDates = icebergPath.dates
    ? indices.map((i) => icebergPath.dates![i])
    : undefined;

  const firstDate =
    newDates && newDates.length > 0 ? newDates[0] : icebergPath.firstDate;

  const lastDate =
    newDates && newDates.length > 0
      ? newDates[newDates.length - 1]
      : icebergPath.lastDate;

  return {
    ...icebergPath,
    path: newPath,
    count: newPath.length,
    firstDate,
    lastDate,
    dates: newDates,
  };
}

/**
 * Simplify a single IcebergPath using RDP with epsilon in meters.
 */
export function simplifyIcebergPathRDPMeters(
  icebergPath: IcebergPath,
  options: RDPMetersOptions,
): IcebergPath {
  validateIcebergPathDates(icebergPath);

  const { path } = icebergPath;
  const { epsilonMeters } = options;

  if (!path || path.length <= 2) {
    return {
      ...icebergPath,
      count: icebergPath.path.length,
    };
  }

  const indices = simplifyRDPIndicesMeters(path, epsilonMeters);
  return pickIcebergPathIndices(icebergPath, indices);
}

/**
 * Simplify multiple IcebergPath objects using meter-based RDP.
 */
export function simplifyIcebergPathsRDPMeters(
  icebergPaths: IcebergPath[],
  options: RDPMetersOptions,
): IcebergPath[] {
  return icebergPaths.map((p) => simplifyIcebergPathRDPMeters(p, options));
}
