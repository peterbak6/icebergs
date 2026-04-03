# Icebergs

Interactive 3-D globe map of Antarctic iceberg trajectories, built with React, Vite, deck.gl, and MapLibre GL.

Live: **https://icebergs.pages.dev** — Source: **https://github.com/peterbak6/icebergs**

## What is this?

This project visualises the full historical record of **630 named Antarctic icebergs** tracked between **1978 and 2023**, totalling **415 731 individual observations**. Each iceberg is drawn as a coloured path on an interactive globe. Users can:

- Pan and zoom the globe (pitch and bearing are locked to keep the view flat and readable)
- Filter icebergs by name-prefix category (a–u) and by year range
- Select a single iceberg to highlight its path and see size circles (km²) at each observation point
- Apply path-simplification algorithms (Ramer–Douglas–Peucker, Visvalingam–Whyatt) and smoothing filters (Savitzky–Golay, Kalman) to reduce visual clutter

## Data

The underlying data comes from the **NIC / BYU Antarctic Iceberg Tracking Database**, which compiles satellite and ship-based observations from 1978 onward. Icebergs are named by quadrant (A = 0–90°W, B = 90–0°W, C = 0–90°E, D = 90–180°E) and sequence number. The raw data was parsed using the Python scripts in `sources/`.

## Path simplification and smoothing

Because raw iceberg paths can contain thousands of points, the panel exposes four optional preprocessing methods. They can be combined in sequence: simplification runs first, then smoothing.

### Simplification

Simplification reduces the number of points while preserving the overall shape of the path. This improves rendering performance, reduces visual clutter, and makes patterns easier to interpret.

#### Ramer–Douglas–Peucker (RDP)

Removes intermediate points that fall within a distance threshold from the straight line between their neighbours.

**UI parameter:** Epsilon (km) — maximum allowed deviation from the original path.

**How it works:** The algorithm recursively keeps only points that contribute significantly to the global shape. Points that lie close to straight segments are removed.

| Epsilon value | Effect                                              |
| ------------- | --------------------------------------------------- |
| Small         | Very close to original path, minimal reduction      |
| Large         | Aggressive simplification — only major turns remain |

**Best for:** Preserving the overall structure and major direction changes with strong data reduction.

#### Visvalingam–Whyatt (VW)

Iteratively removes the point that contributes the least local area (triangle formed with its two neighbours).

**UI parameter:** Area threshold (km²) — minimum triangle area a point must contribute to survive.

**How it works:** Points with the smallest effective area (least visual importance) are removed first, in order of increasing area.

| Threshold value | Effect                           |
| --------------- | -------------------------------- |
| Low             | Gentle simplification            |
| High            | Smoother, more generalised paths |

**Best for:** Visually smooth simplification that avoids sharp artifacts and preserves natural flow.

---

### Smoothing

Smoothing adjusts point positions to reduce noise and small-scale jitter while preserving the overall trajectory trend. Runs after simplification if both are enabled.

#### Savitzky–Golay

Fits a polynomial over a sliding window to smooth the trajectory without distorting peaks.

**UI parameters:**

- Window size — number of neighbouring points used for fitting
- Polynomial order — flexibility of the fitted curve (must be < window size)

**How it works:** Instead of plain averaging, a local polynomial is fitted, which better preserves the curvature characteristics of the motion.

| Parameter      | Effect                                                 |
| -------------- | ------------------------------------------------------ |
| Larger window  | Smoother, less local detail                            |
| Smaller window | Retains local variation                                |
| Higher order   | More flexible fit; can introduce artifacts if too high |

**Best for:** Reducing noise while keeping the characteristic shape of the trajectory.

#### Kalman filter

Uses a constant-velocity motion model with allowed acceleration to estimate the most physically plausible trajectory.

**UI parameters:**

- Measurement σ (km) — assumed noise in observed GPS/satellite positions
- Acceleration σ (km/day²) — how much the trajectory is allowed to deviate from straight-line motion

**How it works:** The filter balances each observed position against a physical motion model. It produces a smoothed, physically plausible path — particularly effective for long tracks with sporadic outliers.

| Parameter             | Effect                                          |
| --------------------- | ----------------------------------------------- |
| Higher measurement σ  | Smoother result; less trust in raw observations |
| Higher acceleration σ | More responsive to rapid direction changes      |

**Best for:** Physically realistic smoothing that accounts for motion dynamics, not just geometry.

---

## Tech stack

| Layer           | Library                                                          |
| --------------- | ---------------------------------------------------------------- |
| Map basemap     | [MapLibre GL JS](https://maplibre.org/) v5 — globe projection    |
| Data layers     | [deck.gl](https://deck.gl/) v9 — `PathLayer`, `ScatterplotLayer` |
| Map ↔ deck sync | `@deck.gl/mapbox` `MapboxOverlay` in **interleaved** mode        |
| UI              | React 19 + Vite 8                                                |
| Hosting         | Cloudflare Pages                                                 |

## Development

```bash
npm install
npm run dev
```

## Deploy

**Cloudflare Pages**

- Build command: `npm run build`
- Build output directory: `dist`

**GitHub Pages** — push to `main`; configure Pages in repo settings to deploy from `dist/` or use a workflow.
