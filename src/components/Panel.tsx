import { useState } from "react";
import { colors } from "../types";
import type { AlgoSettings } from "../types";
import "./Panel.css";
import { DualRangeSlider } from "./RangeSlider";

interface PanelProps {
  settings: AlgoSettings;
  yearRange: [number, number];
  filters: Record<string, boolean>;
  onChange: (settings: AlgoSettings) => void;
  onFiltersChange: (filters: Record<string, boolean>) => void;
  onYearRangeChange: (range: [number, number]) => void;
}

export function Panel({
  settings,
  yearRange,
  filters,
  onChange,
  onFiltersChange,
  onYearRangeChange,
}: PanelProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [fromYear, setFromYear] = useState(yearRange[0]);
  const [toYear, setToYear] = useState(yearRange[1]);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const update = <K extends keyof AlgoSettings>(
    key: K,
    patch: Partial<AlgoSettings[K]>,
  ) => onChange({ ...settings, [key]: { ...settings[key], ...patch } });

  const toggleFilter = (name: string) => {
    onFiltersChange({ ...filters, [name]: !filters[name] });
  };

  return (
    <div id="panel">
      {/* ── ICEBERG ── */}
      <div className="section">
        <button
          className={`section-header${open.has("iceberg") ? " open" : ""}`}
          onClick={() => toggle("iceberg")}
        >
          <span>ICEBERG</span>
          <span>{open.has("iceberg") ? "▼" : "▶"}</span>
        </button>
        {open.has("iceberg") && (
          <div className="section-body">
            <p className="description">
              Iceberg trajectories show drift from calving to disintegration or
              grounding. Colors denote the naming series assigned at calving.
            </p>
            <div className="palette">
              {Object.entries(colors).map(([key, [r, g, b]]) => (
                <div
                  key={key}
                  className="swatch"
                  onClick={() => toggleFilter(key)}
                >
                  <span
                    className="swatch-dot"
                    style={{
                      background: filters[key] ? `rgb(${r},${g},${b})` : "none",
                      border: `2px rgb(${r},${g},${b}) solid`,
                    }}
                  />
                  <span>{key.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <div className="range-slider">
              <p className="slider-label-row">
                <span>Year range:</span>
                <span className="slider-value">
                  {fromYear} – {toYear}
                </span>
              </p>
              <DualRangeSlider
                min={1970}
                max={2020}
                valueA={fromYear}
                valueB={toYear}
                onChange={({ from, to }) => {
                  setFromYear(from);
                  setToYear(to);
                  onYearRangeChange([from, to]);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── SIMPLIFICATION ── */}
      <div className="section">
        <button
          className={`section-header${open.has("simplification") ? " open" : ""}`}
          onClick={() => toggle("simplification")}
        >
          <span>SIMPLIFICATION</span>
          <span>{open.has("simplification") ? "▼" : "▶"}</span>
        </button>
        {open.has("simplification") && (
          <div className="section-body">
            <div className="algo-block">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.rdp.enabled}
                  onChange={(e) => update("rdp", { enabled: e.target.checked })}
                />
                Ramer–Douglas–Peuker
              </label>
              <p className="description">
                Removes collinear points that fall within a distance threshold
                of the straight line between neighbours.
              </p>
              <SliderRow
                label="Epsilon"
                unit="km"
                min={1}
                max={200}
                step={1}
                value={settings.rdp.epsilonKm}
                disabled={!settings.rdp.enabled}
                onChange={(v) => update("rdp", { epsilonKm: v })}
              />
            </div>

            <div className="algo-block">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.vw.enabled}
                  onChange={(e) => update("vw", { enabled: e.target.checked })}
                />
                Visvalingam–Whyatt
              </label>
              <p className="description">
                Iteratively removes the point that forms the smallest triangle
                area with its two neighbours.
              </p>
              <SliderRow
                label="Area threshold"
                unit="km²"
                min={1}
                max={500}
                step={1}
                value={settings.vw.areaThresholdKm2}
                disabled={!settings.vw.enabled}
                onChange={(v) => update("vw", { areaThresholdKm2: v })}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── SMOOTHING ── */}
      <div className="section">
        <button
          className={`section-header${open.has("smoothing") ? " open" : ""}`}
          onClick={() => toggle("smoothing")}
        >
          <span>SMOOTHING</span>
          <span>{open.has("smoothing") ? "▼" : "▶"}</span>
        </button>
        {open.has("smoothing") && (
          <div className="section-body">
            <div className="algo-block">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.sg.enabled}
                  onChange={(e) => update("sg", { enabled: e.target.checked })}
                />
                Savitzky–Golay
              </label>
              <p className="description">
                Fits a polynomial to a sliding window, preserving peaks and
                overall trajectory shape while reducing noise.
              </p>
              <SliderRow
                label="Window size"
                unit=""
                min={5}
                max={50}
                step={2}
                value={settings.sg.windowSize}
                disabled={!settings.sg.enabled}
                onChange={(v) => update("sg", { windowSize: v })}
              />
              <SliderRow
                label="Polynomial order"
                unit=""
                min={2}
                max={4}
                step={1}
                value={settings.sg.polynomialOrder}
                disabled={!settings.sg.enabled}
                onChange={(v) => update("sg", { polynomialOrder: v })}
              />
            </div>

            <div className="algo-block">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.kalman.enabled}
                  onChange={(e) =>
                    update("kalman", { enabled: e.target.checked })
                  }
                />
                Kalman Filter
              </label>
              <p className="description">
                Uses a constant-velocity motion model to balance GPS measurement
                noise against physically plausible drift paths.
              </p>
              <SliderRow
                label="Measurement σ"
                unit="km"
                min={1}
                max={100}
                step={1}
                value={settings.kalman.measurementSigmaKm}
                disabled={!settings.kalman.enabled}
                onChange={(v) => update("kalman", { measurementSigmaKm: v })}
              />
              <SliderRow
                label="Acceleration σ"
                unit="km/day²"
                min={10}
                max={1000}
                step={10}
                value={settings.kalman.accelerationSigmaKmPerDay2}
                disabled={!settings.kalman.enabled}
                onChange={(v) =>
                  update("kalman", { accelerationSigmaKmPerDay2: v })
                }
              />
            </div>
          </div>
        )}
      </div>
      {/* ── Footer: always visible ── */}
      <div className="panel-divider" />
      <div className="panel-footer">
        <a
          className="data-source-link"
          href="https://movingpandas.github.io/movingpandas-website/2-analysis-examples/iceberg.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          Budge & Long, BYU MERS Consolidated Antarctic Iceberg Database
        </a>
        <p className="data-source-link" style={{ opacity: 0.75 }}>
          © 2026 Peter Bak ·{" "}
          <a
            href="https://visualanalytics.co.il"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
            VisualAnalytics
          </a>
        </p>
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}

function SliderRow({
  label,
  unit,
  min,
  max,
  step,
  value,
  disabled,
  onChange,
}: SliderRowProps) {
  return (
    <div className={`slider-row${disabled ? " disabled" : ""}`}>
      <div className="slider-label-row">
        <span>{label}</span>
        <span className="slider-value">
          {value}
          {unit ? `\u2009${unit}` : ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
