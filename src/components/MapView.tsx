import { useEffect, useRef, useMemo, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { colors } from "../types";
import type {
  IcebergPath,
  IcebergData,
  IcebergRecord,
  AlgoSettings,
  ViewState,
} from "../types";
import { buildPaths, unrollLongitude } from "./utils";

interface MapViewProps {
  initialViewState: ViewState;
  data: IcebergData | null;
  selectedPath: string | null;
  onSelection: (id: string | null) => void;
  algoSettings: AlgoSettings;
}
import { simplifyIcebergPathsRDPMeters } from "../hooks/RamerDuglasPeuker";
import { simplifyIcebergPathsVWMeters } from "../hooks/VisvalingamWhyatt";
import { smoothIcebergPathsSavitzkyGolay } from "../hooks/SavitzkyGolay";
import { smoothIcebergPathsKalman } from "../hooks/Kalman";

// Set to an iceberg id (e.g. 'b10b') to render only that path for debugging.
const DEBUG_SINGLE_PATH = "";

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [{ id: "satellite", type: "raster", source: "satellite" }],
};

export function MapView({
  initialViewState,
  data,
  selectedPath,
  onSelection,
  algoSettings,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const layerVersionRef = useRef(0);
  const currentLayerIdRef = useRef("iceberg-paths-0");

  // Stable refs so layer callbacks never go stale
  const selectedPathRef = useRef<string | null>(selectedPath);
  const onSelectionRef = useRef(onSelection);
  selectedPathRef.current = selectedPath;
  onSelectionRef.current = onSelection;

  // Initialise map + overlay once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom,
      pitch: 0,
      bearing: 0,
      minPitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
    });

    const overlay = new MapboxOverlay({
      layers: [],
      pickingRadius: 12,
      getTooltip: ({ object }: { object?: IcebergPath | null }) => {
        if (!object) return null;
        return {
          html: `<b>${object.id.toUpperCase()}</b><br/>
          ${object.firstDate} → ${object.lastDate}<br/>
          ${
            isFinite(object.minSize ?? NaN) && isFinite(object.maxSize ?? NaN)
              ? `Size range: ${object.minSize} → ${object.maxSize} km²<br/>`
              : ""
          }
          ${object.count} observations`,
          style: {
            backgroundColor: "rgba(0,0,0,0.75)",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: "4px",
            fontSize: "12px",
            pointerEvents: "none",
          },
        };
      },
    });

    map.on("load", () => {
      map.setProjection({ type: "globe" });
      map.touchZoomRotate.disableRotation();
      setMapReady(true);
    });

    map.addControl(overlay);
    overlayRef.current = overlay;

    return () => {
      overlay.finalize();
      map.remove();
      overlayRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild path geometry only when data or algorithm settings change
  const paths = useMemo<IcebergPath[]>(() => {
    if (!data) return [];
    let p = buildPaths(data);

    if (algoSettings.rdp.enabled)
      p = simplifyIcebergPathsRDPMeters(p, {
        epsilonMeters: algoSettings.rdp.epsilonKm * 1000,
      });

    if (algoSettings.vw.enabled)
      p = simplifyIcebergPathsVWMeters(p, {
        areaThresholdM2: algoSettings.vw.areaThresholdKm2 * 1_000_000,
      });

    if (algoSettings.sg.enabled)
      p = smoothIcebergPathsSavitzkyGolay(p, {
        windowSize: algoSettings.sg.windowSize,
        polynomialOrder: algoSettings.sg.polynomialOrder,
      });

    if (algoSettings.kalman.enabled)
      p = smoothIcebergPathsKalman(p, {
        measurementSigmaMeters: algoSettings.kalman.measurementSigmaKm * 1000,
        accelerationSigmaMetersPerDay2:
          algoSettings.kalman.accelerationSigmaKmPerDay2,
      });

    // SG and Kalman re-wrap output to [-180, 180], creating 358° antimeridian
    // jumps that break globe rendering. Ensure all paths are unrolled before
    // deck.gl sees them — continuous coords render correctly without wrapLongitude.
    p = p.map((ip) => ({ ...ip, path: unrollLongitude(ip.path) }));

    if (DEBUG_SINGLE_PATH) p = p.filter((ip) => ip.id === DEBUG_SINGLE_PATH);
    return p;
  }, [data, algoSettings]);

  // Scatter layer showing true size circles for the selected iceberg's observations
  const makeScatterLayer = (selectedId: string | null) => {
    if (!selectedId || !data) return null;
    const records = (data[selectedId] ?? []).filter(
      (r): r is IcebergRecord & { size: number } => r.size != null,
    );
    if (!records.length) return null;
    const [r, g, b] = colors[selectedId[0]] ?? [200, 200, 200];
    return new ScatterplotLayer<IcebergRecord & { size: number }>({
      id: "iceberg-size-scatter",
      data: records,
      // pos is stored as [lat, lon]; deck.gl expects [lon, lat]
      getPosition: (rec) => [rec.pos[1], rec.pos[0]],
      // Convert area (km²) to circle radius (m): r = sqrt(area / π) * 1000
      getRadius: (rec) => Math.sqrt((rec.size * 1_000_000) / Math.PI),
      radiusUnits: "meters",
      filled: true,
      stroked: true,
      getFillColor: [r, g, b, 180],
      getLineColor: [r, g, b, 255],
      getLineWidth: 1,
      lineWidthUnits: "pixels",
      pickable: false,
      parameters: { depthCompare: "always" },
    });
  };

  // Layer factory — accessors read from refs so they're always current
  const makeLayer = (layerId: string) =>
    new PathLayer<IcebergPath>({
      id: layerId,
      data: paths,
      getPath: (d) => d.path,
      getColor: (d) => {
        const [r, g, b] = colors[d.colorIndex] ?? [128, 128, 128];
        const alpha =
          selectedPathRef.current === null || d.id === selectedPathRef.current
            ? 255
            : 64;
        return [r, g, b, alpha];
      },
      getWidth: (d) =>
        selectedPathRef.current !== null && d.id === selectedPathRef.current
          ? 3
          : 1,
      widthUnits: "pixels",
      widthMinPixels: 1,
      pickable: true,
      jointRounded: true,
      capRounded: true,
      parameters: { depthCompare: "always" },
      updateTriggers: {
        getColor: [selectedPathRef.current],
        getWidth: [selectedPathRef.current],
      },
      onClick: ({ object }) => {
        if (object)
          onSelectionRef.current(
            object.id === selectedPathRef.current ? null : object.id,
          );
      },
    });

  // Paths changed → new layer ID so deck.gl fully recreates GPU buffers
  useEffect(() => {
    if (!overlayRef.current || !mapReady || !paths.length) return;
    const id = `iceberg-paths-${++layerVersionRef.current}`;
    currentLayerIdRef.current = id;
    const scatter = makeScatterLayer(selectedPathRef.current);
    // algoSettings has any enabled:
    const hasAlgo = Object.values(algoSettings).some((s) => s.enabled);
    overlayRef.current.setProps({
      layers: [makeLayer(id), ...(scatter && !hasAlgo ? [scatter] : [])],
    });
  }, [paths, mapReady]);

  // Selection changed → reuse same layer ID so only accessors are re-evaluated
  useEffect(() => {
    if (!overlayRef.current || !mapReady) return;
    const scatter = makeScatterLayer(selectedPathRef.current);
    const hasAlgo = Object.values(algoSettings).some((s) => s.enabled);
    overlayRef.current.setProps({
      layers: [
        makeLayer(currentLayerIdRef.current),
        ...(scatter && !hasAlgo ? [scatter] : []),
      ],
    });
  }, [selectedPath, onSelection]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
