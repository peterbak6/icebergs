import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { PathLayer } from "@deck.gl/layers";
import { colors } from "../types";
import type { IcebergPath, MapViewProps } from "../types";
import { buildPaths } from "./utils";
import { simplifyIcebergPathsRDPMeters } from "../hooks/RamerDuglasPeuker";
import { simplifyIcebergPathsVWMeters } from "../hooks/VisvalingamWhyatt";
import { smoothIcebergPathsSavitzkyGolay } from "../hooks/SavitzkyGolay";
import { smoothIcebergPathsKalman } from "../hooks/Kalman";

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
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // Cache pre-built paths so we don't recompute on every selection change
  const pathsRef = useRef<IcebergPath[]>([]);

  // Initialise map + overlay once
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom,
      pitch: initialViewState.pitch,
      minPitch: initialViewState.minPitch,
      maxPitch: initialViewState.maxPitch,
    });

    const overlay = new MapboxOverlay({
      layers: [],
      getTooltip: ({ object }: { object?: IcebergPath | null }) => {
        if (!object) return null;
        return {
          html: `<b>${object.id.toUpperCase()}</b><br/>${object.firstDate} → ${object.lastDate}<br/>${object.count} observations`,
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

  // Rebuild path geometry only when data changes
  useEffect(() => {
    if (!data) return;
    const build = buildPaths(data);
    const simplifiedRDP = simplifyIcebergPathsRDPMeters(build, {
      epsilonMeters: 10000,
    }); // Fallback to avoid empty array issues
    const simplifiedVW = simplifyIcebergPathsVWMeters(build, {
      areaThresholdM2: 50_000_000,
    });

    const smoothedSG = smoothIcebergPathsSavitzkyGolay(build, {
      windowSize: 13,
      polynomialOrder: 3,
    });
    const smoothedKalman = smoothIcebergPathsKalman(build, {
      measurementSigmaMeters: 10000,
      accelerationSigmaMetersPerDay2: 100,
    });

    console.info(smoothedKalman);
    pathsRef.current = [
      //   ...build,
      //   ...simplifiedRDP,
      //   ...simplifiedVW,
      //   ...smoothedSG,
      ...smoothedKalman,
    ];
  }, [data]);

  // Update layer styles when data or selection changes
  useEffect(() => {
    if (!overlayRef.current || !data) return;

    const paths = pathsRef.current;
    const layer = new PathLayer<IcebergPath>({
      id: "iceberg-paths",
      data: paths,
      getPath: (d) => d.path,
      getColor: (d) => {
        const [r, g, b] = colors[d.colorIndex] ?? [128, 128, 128];
        const alpha = selectedPath === null || d.id === selectedPath ? 255 : 64;
        return [r, g, b, alpha];
      },
      getWidth: (d) => (selectedPath !== null && d.id === selectedPath ? 7 : 1),
      widthUnits: "pixels",
      widthMinPixels: 1,
      wrapLongitude: true,
      pickable: true,
      jointRounded: true,
      updateTriggers: {
        getColor: [selectedPath],
        getWidth: [selectedPath],
      },
      onClick: ({ object }) => {
        if (object) onSelection(object.id === selectedPath ? null : object.id);
      },
    });

    overlayRef.current.setProps({ layers: [layer] });
  }, [data, selectedPath, onSelection]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
