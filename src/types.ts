export interface IcebergRecord {
  date: string;
  /** [lat, lon] as stored by the parser */
  pos: [number, number];
  source: number;
  size: number | null;
}

export interface IcebergPath {
  id: string;
  path: [number, number][];
  count: number;
  firstDate: string;
  lastDate: string;
  colorIndex: string;
  dates?: string[];
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  minPitch: number;
  maxPitch: number;
}

export interface MapViewProps {
  initialViewState: ViewState;
  data: IcebergData | null;
  selectedPath: string | null;
  onSelection: (id: string | null) => void;
}

export type IcebergData = Record<string, IcebergRecord[]>;

export const colors: Record<string, [number, number, number]> = {
  a: [27, 158, 119],
  b: [217, 95, 2],
  c: [117, 112, 179],
  d: [231, 41, 138],
  e: [102, 166, 30],
  s: [230, 171, 2],
  u: [166, 118, 29],

  //   a: [102, 194, 165],
  //   b: [252, 141, 98],
  //   c: [141, 160, 203],
  //   d: [231, 138, 195],
  //   e: [166, 216, 84],
  //   s: [255, 217, 47],
  //   u: [229, 196, 148],
};
