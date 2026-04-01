import { useCallback, useState } from "react";
import "./App.css";
import { useLoader } from "./hooks/useLoader";
import { MapView } from "./components/MapView";

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
  const [selectedPath, setSelectedPath] = useState<string | null>(null); // "b15d"

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
        data={{ b15d: data?.["b15d"] ?? [] }}
        selectedPath={selectedPath}
        onSelection={onSelection}
      />
    </div>
  );
}

export default App;
