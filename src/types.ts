/** [lon, lat] coordinate pair used throughout the app */
export type LonLat = [number, number];

export interface IcebergRecord {
  date: string;
  /** [lat, lon] as stored by the parser */
  pos: LonLat;
  /** Area in km², often null */
  size?: number | null;
}

export interface IcebergPath {
  id: string;
  path: LonLat[];
  /** Original observation count (before any simplification) */
  count: number;
  firstDate: string;
  lastDate: string;
  colorIndex: string;
  dates?: string[];
  minSize?: number;
  maxSize?: number;
}

export type IcebergData = Record<string, IcebergRecord[]>;

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  minPitch: number;
  maxPitch: number;
}

export interface RDPSettings {
  enabled: boolean;
  epsilonKm: number;
}

export interface VWSettings {
  enabled: boolean;
  areaThresholdKm2: number;
}

export interface SGSettings {
  enabled: boolean;
  windowSize: number;
  polynomialOrder: number;
}

export interface KalmanSettings {
  enabled: boolean;
  measurementSigmaKm: number;
  accelerationSigmaKmPerDay2: number;
}

export interface AlgoSettings {
  rdp: RDPSettings;
  vw: VWSettings;
  sg: SGSettings;
  kalman: KalmanSettings;
}

export const DEFAULT_ALGO_SETTINGS: AlgoSettings = {
  rdp: { enabled: false, epsilonKm: 10 },
  vw: { enabled: false, areaThresholdKm2: 50 },
  sg: { enabled: false, windowSize: 13, polynomialOrder: 3 },
  kalman: {
    enabled: false,
    measurementSigmaKm: 10,
    accelerationSigmaKmPerDay2: 300,
  },
};

export const colors: Record<string, [number, number, number]> = {
  //   a: [27, 158, 119],
  //   b: [217, 95, 2],
  //   c: [117, 112, 179],
  //   d: [231, 41, 138],
  //   e: [102, 166, 30],
  //   s: [230, 171, 2],
  //   u: [166, 118, 29],

  a: [102, 194, 165],
  b: [252, 141, 98],
  c: [141, 160, 203],
  d: [231, 138, 195],
  e: [166, 216, 84],
  s: [255, 217, 47],
  u: [229, 196, 148],
};
