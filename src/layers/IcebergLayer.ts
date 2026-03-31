import { PathLayer } from "@deck.gl/layers";
import type { IcebergData } from "../types";
import { colors } from "../types";

export interface IcebergPath {
  id: string;
  segmentId?: number;
  /** Array of [lon, lat] for deck.gl */
  path: [number, number][];
  count: number;
  dates?: string[];
  firstDate: string;
  lastDate: string;
  colorIndex: string;
  deltaDays?: number[];
  deltaDist?: number[];
}

/**
 * Converts iceberg tracking data into a deck.gl PathLayer.
 * Input pos is [lat, lon]; deck.gl expects [lon, lat].
 */
type FullIcebergPath = Required<IcebergPath>;

const segment = (pathObj: FullIcebergPath, days = 30, distPerDay = 100) => {
  const { id, colorIndex, dates, deltaDays, deltaDist, path } = pathObj;
  let o = [],
    s: any[] = [],
    sd: string[] = [];
  path.forEach((p: any, i: any) =>
    ((deltaDist[i] ?? 0) / (deltaDays[i] ?? 1) >= distPerDay ||
      (deltaDays[i] ?? 0) >= days) &&
    i
      ? (s.length > 1 &&
          o.push({
            id,
            segmentId: o.length,
            colorIndex,
            path: s,
            count: s.length,
            firstDate: sd[0],
            lastDate: sd[sd.length - 1],
          }),
        (s = [p]),
        (sd = [dates[i]]))
      : (s.push(p), sd.push(dates[i])),
  );
  return (
    s.length > 1 &&
      o.push({
        id,
        segmentId: o.length,
        colorIndex,
        path: s,
        count: s.length,
        firstDate: sd[0],
        lastDate: sd[sd.length - 1],
      }),
    o
  );
};

export function buildIcebergLayer(data: IcebergData): PathLayer<IcebergPath> {
  //   const filteredData = Object.fromEntries(
  //     Object.entries(data).filter(([id]) => ["b15k"].includes(id)),
  //   );
  const paths: IcebergPath[] = Object.entries(data).map(([id, records]) => ({
    id,
    path: records.map((r) => [r.pos[1], r.pos[0]]),
    count: records.length,
    dates: records.map((d) => d.date),
    firstDate: records[0]?.date ?? "",
    lastDate: records[records.length - 1]?.date ?? "",
    colorIndex: id[0], // first char indicates source/type
    deltaDays: records.map((r, i, all) => {
      if (i === 0) return 0;
      const prevDate = new Date(all[i - 1].date);
      const currDate = new Date(r.date);
      return (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
    }),
    deltaDist: records.map((r, i, all) => {
      if (i === 0) return 0;
      const prevPos = all[i - 1].pos;
      const currPos = r.pos;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const R = 6371; // Earth radius in km
      const dLat = toRad(currPos[0] - prevPos[0]);
      const dLon = toRad(currPos[1] - prevPos[1]);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(prevPos[0])) *
          Math.cos(toRad(currPos[0])) *
          Math.sin(dLon / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // distance in km
    }),
  }));

  const segmentedPaths: IcebergPath[] = paths.flatMap((p) =>
    segment(p as FullIcebergPath),
  );

  return new PathLayer<IcebergPath>({
    id: "iceberg-trajectories",
    data: segmentedPaths,
    getPath: (d) => d.path,
    getColor: (d) => colors[d.colorIndex] || [128, 128, 128],
    getWidth: 2,
    widthMinPixels: 1,
    wrapLongitude: true,
    pickable: true,
  });
}
