import { useEffect, useRef, useMemo, useState } from "react";
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
  algoSettings,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const layerVersionRef = useRef(0);

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

    return p;
  }, [data, algoSettings]);

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
          ? 7
          : 1,
      widthUnits: "pixels",
      widthMinPixels: 1,
      wrapLongitude: true,
      pickable: true,
      jointRounded: true,
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

  // Paths changed → new layer ID forces deck.gl to destroy + recreate GPU buffers
  // (prevents wrapLongitude geometry being cached from a previous projection state)
  useEffect(() => {
    if (!overlayRef.current || !mapReady || !paths.length) return;
    const id = `iceberg-paths-${++layerVersionRef.current}`;
    overlayRef.current.setProps({ layers: [makeLayer(id)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, mapReady]);

  // Selection changed → same layer ID so deck.gl updates only color/width in place
  useEffect(() => {
    if (!overlayRef.current || !mapReady || !paths.length) return;
    const id = `iceberg-paths-${layerVersionRef.current}`;
    overlayRef.current.setProps({ layers: [makeLayer(id)] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, onSelection, mapReady]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
