import { useMemo, useState } from "react";
import "./App.css";
import { useLoader } from "./hooks/useLoader";
import { MapView } from "./components/MapView";
import { Panel } from "./components/Panel";
import { DEFAULT_ALGO_SETTINGS, colors } from "./types";
import type { AlgoSettings, IcebergData } from "./types";

const INITIAL_VIEW_STATE = {
  longitude: 0.6,
  latitude: -89.0,
  zoom: 2,
  pitch: 0,
  bearing: 0,
};

function App() {
  const { data, firstDate, lastDate, loading, error } = useLoader();
  const [selectedPath, setSelectedPath] = useState<string | null>("a68a");
  const [algoSettings, setAlgoSettings] = useState<AlgoSettings>(
    DEFAULT_ALGO_SETTINGS,
  );
  const [yearRange, setYearRange] = useState<[number, number]>([
    firstDate ?? 1970,
    lastDate ?? 2020,
  ]);
  const [filters, setFilters] = useState<Record<string, boolean>>(
    Object.keys(colors).reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}),
  );

  const onSelection = (pathId: string | null) => setSelectedPath(pathId);

  const showPaths = useMemo<IcebergData>(() => {
    if (!data) return {};
    const [fromYear, toYear] = yearRange;
    const result: IcebergData = {};
    for (const [key, records] of Object.entries(data)) {
      if (!filters[key[0]]) continue;
      const filtered = records.filter((r) => {
        const year = parseInt(r.date, 10);
        return year >= fromYear && year <= toYear;
      });
      if (filtered.length > 2) result[key] = filtered;
    }
    return result;
  }, [data, filters, yearRange]);

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
      {!loading && (
        <Panel
          settings={algoSettings}
          yearRange={yearRange}
          filters={filters}
          onChange={setAlgoSettings}
          onFiltersChange={setFilters}
          onYearRangeChange={setYearRange}
        />
      )}
    </div>
  );
}

export default App;
