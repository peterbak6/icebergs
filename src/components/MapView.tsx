import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer } from "@deck.gl/core";
import type { IcebergPath } from "../layers/IcebergLayer";

/** Satellite raster style — no API key required (ESRI World Imagery) */
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
  layers: [
    {
      id: "satellite",
      type: "raster",
      source: "satellite",
    },
  ],
};

interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  minPitch: number;
  maxPitch: number;
}

interface MapViewProps {
  initialViewState: ViewState;
  layer: Layer | null;
}

export function MapView({ initialViewState, layer }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);

  // Initialise map once
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

    map.on("load", () => {
      map.setProjection({ type: "globe" });
    });

    const tooltip = ({ object }: { object?: IcebergPath | null }) => {
      if (!object) return null;
      return {
        html: `<b>${object.id.toUpperCase()}</b><br/>
                  ${object.firstDate} → ${object.lastDate}<br/>
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
    };

    const overlay = new MapboxOverlay({
      layers: [],
      getTooltip: tooltip,
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

  // Push layer updates to the overlay
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.setProps({ layers: layer ? [layer] : [] });
  }, [layer]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
