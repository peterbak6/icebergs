import { useCallback, useState } from "react";
import "./App.css";
import { useLoader } from "./hooks/useLoader";
import { MapView } from "./components/MapView";
import { Panel } from "./components/Panel";
import { DEFAULT_ALGO_SETTINGS } from "./types";
import type { AlgoSettings } from "./types";

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
  const [selectedPath, setSelectedPath] = useState<string | null>("a68a");
  const [algoSettings, setAlgoSettings] = useState<AlgoSettings>(
    DEFAULT_ALGO_SETTINGS,
  );

  const onSelection = useCallback((pathId: string | null) => {
    setSelectedPath(pathId);
  }, []);

  if (error) {
    return <div id="error">Failed to load data: {error.message}</div>;
  }

  return (
    <div id="app">
      {loading && <div id="loading">Loading…</div>}
      <MapView
        initialViewState={INITIAL_VIEW_STATE}
        data={data}
        selectedPath={selectedPath}
        onSelection={onSelection}
        algoSettings={algoSettings}
      />
      <Panel settings={algoSettings} onChange={setAlgoSettings} />
    </div>
  );
}

export default App;
