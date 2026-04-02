import { useCallback, useState } from "react";
import "./App.css";
import { useLoader } from "./hooks/useLoader";
import { MapView } from "./components/MapView";
import { Panel } from "./components/Panel";
import { DEFAULT_ALGO_SETTINGS } from "./types";
import type { AlgoSettings } from "./types";
import type { IcebergData } from "./types";

const INITIAL_VIEW_STATE = {
  longitude: 0.6,
  latitude: -89.0,
  zoom: 2,
  pitch: 0,
  minPitch: 0,
  maxPitch: 0,
};

function App() {
  const { data, loading, error } = useLoader();
  const [showPaths, setShowPaths] = useState<IcebergData>({});
  const [selectedPath, setSelectedPath] = useState<string | null>("a68a");
  const [algoSettings, setAlgoSettings] = useState<AlgoSettings>(
    DEFAULT_ALGO_SETTINGS,
  );

  const onSelection = useCallback((pathId: string | null) => {
    setSelectedPath(pathId);
  }, []);

  /**
   * Filter iceberg paths by first letter (e.g. 'a', 'b', etc.) according to the
   * provided filters and at least two coordiantes present. Size Filter:
   *  Object.entries(data).map(([key, value]) => { 
          const size = [Math.min(...value.filter(v => v.size).map(v => v.size)), Math.max(...value.filter(v => v.size).map(v => v.size))];
          if (!isFinite(size[0]) || !isFinite(size[1])) return null;
          const entry = {};
          entry[key] = size;
          return entry
      }).filter(v => v)
   */
  const onFilter = useCallback(
    (filters: { [key: string]: boolean }) => {
      if (!data) return;
      setShowPaths(
        Object.fromEntries(
          Object.entries(data).filter(
            ([key, value]) => value.length > 2 && filters[key[0]],
          ),
        ),
      );
    },
    [data],
  );

  if (error) {
    return <div id="error">Failed to load data: {error.message}</div>;
  }

  return (
    <div id="app">
      {loading && <div id="loading">Loading…</div>}
      {showPaths && (
        <MapView
          initialViewState={INITIAL_VIEW_STATE}
          data={showPaths}
          selectedPath={selectedPath}
          onSelection={onSelection}
          algoSettings={algoSettings}
        />
      )}
      <Panel
        settings={algoSettings}
        onChange={setAlgoSettings}
        onFilter={onFilter}
      />
    </div>
  );
}

export default App;
