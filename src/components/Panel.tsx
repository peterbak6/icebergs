import { useEffect, useState } from "react";
import { colors } from "../types";
import type { AlgoSettings } from "../types";
import "./Panel.css";

interface PanelProps {
  settings: AlgoSettings;
  onChange: (settings: AlgoSettings) => void;
  onFilter: (filters: { [key: string]: boolean }) => void;
}

export function Panel({ settings, onChange, onFilter }: PanelProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{ [key: string]: boolean }>(
    Object.keys(colors).reduce((acc: any, key: string) => {
      acc[key] = true;
      return acc;
    }, {}),
  );

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

  const filter = (name: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      next[name] = !next[name];
      return next;
    });
  };

  useEffect(() => {
    onFilter(filters ? filters : {});
  }, [filters, onFilter]);

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
              Trajectories from the BYU/NIC Antarctic Iceberg Tracking Database.
              Each path shows one iceberg&apos;s drift from calving to
              disintegration or grounding. Colors denote the naming series
              assigned at calving.
            </p>
            <div className="palette">
              {Object.entries(colors).map(([key, [r, g, b]]) => (
                <div key={key} className="swatch" onClick={() => filter(key)}>
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
