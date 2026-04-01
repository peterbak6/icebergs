import type { IcebergPath } from "../types";

export type LonLat = [number, number];
export type XYMeters = [number, number];

export interface VWOptions {
  areaThresholdM2: number;
}

const EARTH_RADIUS_M = 6371008.8;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
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

function projectPathToLocalMeters(path: LonLat[]): XYMeters[] {
  const ref = getReferenceLonLat(path);
  return path.map((p) => projectLonLatToLocalMeters(p, ref));
}

function triangleAreaM2(a: XYMeters, b: XYMeters, c: XYMeters): number {
  const [ax, ay] = a;
  const [bx, by] = b;
  const [cx, cy] = c;

  return Math.abs(0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)));
}

interface VWNode {
  index: number;
  prev: VWNode | null;
  next: VWNode | null;
  area: number;
  removed: boolean;
}

type HeapEntry = {
  nodeIndex: number;
  area: number;
};

class MinHeap<T> {
  private data: T[] = [];
  private compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.data.length;
  }

  push(value: T): void {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    if (this.data.length === 1) return this.data.pop();

    const root = this.data[0];
    this.data[0] = this.data.pop() as T;
    this.bubbleDown(0);
    return root;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.data[index], this.data[parent]) >= 0) break;
      [this.data[index], this.data[parent]] = [
        this.data[parent],
        this.data[index],
      ];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.data.length;

    while (true) {
      let smallest = index;
      const left = index * 2 + 1;
      const right = index * 2 + 2;

      if (
        left < length &&
        this.compare(this.data[left], this.data[smallest]) < 0
      ) {
        smallest = left;
      }

      if (
        right < length &&
        this.compare(this.data[right], this.data[smallest]) < 0
      ) {
        smallest = right;
      }

      if (smallest === index) break;

      [this.data[index], this.data[smallest]] = [
        this.data[smallest],
        this.data[index],
      ];
      index = smallest;
    }
  }
}

function computeNodeArea(node: VWNode, projected: XYMeters[]): number {
  if (!node.prev || !node.next) return Infinity;

  return triangleAreaM2(
    projected[node.prev.index],
    projected[node.index],
    projected[node.next.index],
  );
}

export function simplifyVWIndicesMeters(
  lonLatPoints: LonLat[],
  areaThresholdM2: number,
): number[] {
  const n = lonLatPoints.length;

  if (n <= 2) return lonLatPoints.map((_, i) => i);
  if (areaThresholdM2 <= 0) return lonLatPoints.map((_, i) => i);

  const projected = projectPathToLocalMeters(lonLatPoints);

  const nodes: VWNode[] = new Array(n);
  for (let i = 0; i < n; i++) {
    nodes[i] = {
      index: i,
      prev: null,
      next: null,
      area: Infinity,
      removed: false,
    };
  }

  for (let i = 0; i < n; i++) {
    nodes[i].prev = i > 0 ? nodes[i - 1] : null;
    nodes[i].next = i < n - 1 ? nodes[i + 1] : null;
  }

  const heap = new MinHeap<HeapEntry>((a, b) => a.area - b.area);

  for (let i = 1; i < n - 1; i++) {
    nodes[i].area = computeNodeArea(nodes[i], projected);
    heap.push({
      nodeIndex: i,
      area: nodes[i].area,
    });
  }

  while (heap.size > 0) {
    const entry = heap.pop();
    if (!entry) break;

    const node = nodes[entry.nodeIndex];

    if (node.removed) continue;
    if (!node.prev || !node.next) continue;

    // stale heap entry
    if (entry.area !== node.area) continue;

    if (node.area >= areaThresholdM2) break;

    node.removed = true;

    const prev = node.prev;
    const next = node.next;

    prev.next = next;
    next.prev = prev;

    if (prev.prev) {
      prev.area = computeNodeArea(prev, projected);
      heap.push({
        nodeIndex: prev.index,
        area: prev.area,
      });
    }

    if (next.next) {
      next.area = computeNodeArea(next, projected);
      heap.push({
        nodeIndex: next.index,
        area: next.area,
      });
    }
  }

  const indices: number[] = [];
  let current: VWNode | null = nodes[0];

  while (current) {
    if (!current.removed) indices.push(current.index);
    current = current.next;
  }

  return indices;
}

export function pickIcebergPathIndices(
  icebergPath: IcebergPath,
  indices: number[],
): IcebergPath {
  const newPath = indices.map((i) => icebergPath.path[i]);
  const newDates = icebergPath.dates
    ? indices.map((i) => icebergPath.dates![i])
    : undefined;

  return {
    ...icebergPath,
    path: newPath,
    count: newPath.length,
    firstDate: newDates?.[0] ?? icebergPath.firstDate,
    lastDate: newDates?.[newDates.length - 1] ?? icebergPath.lastDate,
    dates: newDates,
  };
}

export function simplifyIcebergPathVWMeters(
  icebergPath: IcebergPath,
  options: VWOptions,
): IcebergPath {
  validateIcebergPathDates(icebergPath);

  if (icebergPath.path.length <= 2) {
    return {
      ...icebergPath,
      count: icebergPath.path.length,
    };
  }

  const indices = simplifyVWIndicesMeters(
    icebergPath.path,
    options.areaThresholdM2,
  );

  return pickIcebergPathIndices(icebergPath, indices);
}

export function simplifyIcebergPathsVWMeters(
  icebergPaths: IcebergPath[],
  options: VWOptions,
): IcebergPath[] {
  return icebergPaths.map((p) => simplifyIcebergPathVWMeters(p, options));
}
