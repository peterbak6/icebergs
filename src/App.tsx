import { useMemo } from "react";
import "./App.css";
import { useLoader } from "./hooks/useLoader";
import { buildIcebergLayer } from "./layers/IcebergLayer";
import { MapView } from "./components/MapView";

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: -90,
  zoom: 2,
  pitch: 0,
  minPitch: 0,
  maxPitch: 0,
};

function App() {
  const { data, loading, error } = useLoader();

  const layer = useMemo(() => (data ? buildIcebergLayer(data) : null), [data]);

  if (error) {
    return <div id="error">Failed to load data: {error.message}</div>;
  }

  return (
    <div id="app">
      {loading && <div id="loading">Loading…</div>}
      <MapView initialViewState={INITIAL_VIEW_STATE} layer={layer} />
    </div>
  );
}

export default App;
