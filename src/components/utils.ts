import type { IcebergPath, IcebergData } from "../types";

/** Split a path wherever observations jump >30 days or >100 km/day */
function segmentPath(
  id: string,
  colorIndex: string,
  path: [number, number][],
  dates: string[],
  sizes: (number | null | undefined)[],
  deltaDays: number[],
  deltaDist: number[],
  maxDays = 30,
  maxKmPerDay = 100,
): IcebergPath[] {
  const segments: IcebergPath[] = [];
  let seg: [number, number][] = [];
  let segDates: string[] = [];
  let segSizes: (number | null | undefined)[] = [];

  path.forEach((p, i) => {
    const jump =
      i > 0 &&
      ((deltaDist[i] ?? 0) / (deltaDays[i] ?? 1) >= maxKmPerDay ||
        (deltaDays[i] ?? 0) >= maxDays);

    if (jump && seg.length > 1) {
      segments.push({
        id,
        colorIndex,
        path: seg,
        count: seg.length,
        dates: segDates,
        firstDate: segDates[0],
        lastDate: segDates[segDates.length - 1],
        minSize: Math.min(...segSizes.filter((s): s is number => s != null)),
        maxSize: Math.max(...segSizes.filter((s): s is number => s != null)),
      });
      seg = [];
      segDates = [];
      segSizes = [];
    }
    seg.push(p);
    segDates.push(dates[i]);
    segSizes.push(sizes[i]);
  });

  if (seg.length > 1) {
    segments.push({
      id,
      colorIndex,
      path: seg,
      count: seg.length,
      firstDate: segDates[0],
      lastDate: segDates[segDates.length - 1],
      dates: segDates,
      minSize: Math.min(...segSizes.filter((s): s is number => s != null)),
      maxSize: Math.max(...segSizes.filter((s): s is number => s != null)),
    });
  }

  return segments;
}

/**
 * Make longitude continuous — no jumps > 180° at the antimeridian.
 * Algorithms that project to local metres need this to work correctly
 * on circumpolar paths (lon range -180 → +180).
 * Also ensures deck.gl on a globe projection renders arcs correctly
 * (wrapLongitude is not needed when paths are already continuous).
 */
export function unrollLongitude(path: [number, number][]): [number, number][] {
  if (path.length === 0) return path;
  const out: [number, number][] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    let lon = path[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (prev - lon > 180) lon += 360;
    out.push([lon, path[i][1]]);
  }
  return out;
}

export function buildPaths(data: IcebergData): IcebergPath[] {
  return Object.entries(data).flatMap(([id, records]) => {
    const path: [number, number][] = unrollLongitude(
      records.map((r) => [r.pos[1], r.pos[0]]),
    );
    const dates = records.map((r) => r.date);
    const sizes = records.map((r) => r.size);
    const deltaDays = records.map((r, i, all) => {
      if (i === 0) return 0;
      return (
        (new Date(r.date).getTime() - new Date(all[i - 1].date).getTime()) /
        86400000
      );
    });
    const deltaDist = records.map((r, i, all) => {
      if (i === 0) return 0;
      const [lat1, lon1] = all[i - 1].pos;
      const [lat2, lon2] = r.pos;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    });
    return segmentPath(id, id[0], path, dates, sizes, deltaDays, deltaDist);
  });
}
