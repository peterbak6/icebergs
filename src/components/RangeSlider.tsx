import React, { useMemo, useRef, useState } from "react";

export type DualRangeChange = {
  from: number;
  to: number;
  valueA: number;
  valueB: number;
};

export type DualRangeSliderProps = {
  min: number;
  max: number;
  step?: number;
  valueA?: number;
  valueB?: number;
  onChange?: (range: DualRangeChange) => void;
  className?: string;
  label?: (
    from: number,
    to: number,
    valueA: number,
    valueB: number,
  ) => React.ReactNode;
};

type DragMode = "handleA" | "handleB" | "range" | null;

type DragState = {
  mode: DragMode;
  startClientX: number;
  startA: number;
  startB: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

const snap = (v: number, min: number, step: number) =>
  min + Math.round((v - min) / step) * step;

export const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  step = 1,
  valueA,
  valueB,
  onChange,
  className,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [internalA, setInternalA] = useState<number>(valueA ?? min);
  const [internalB, setInternalB] = useState<number>(valueB ?? max);

  const a = valueA ?? internalA;
  const b = valueB ?? internalB;

  const total = Math.max(max - min, step);

  const from = Math.min(a, b);
  const to = Math.max(a, b);

  const aPct = ((a - min) / total) * 100;
  const bPct = ((b - min) / total) * 100;
  const fromPct = ((from - min) / total) * 100;
  const toPct = ((to - min) / total) * 100;

  const update = (nextA: number, nextB: number) => {
    const clampedA = clamp(snap(nextA, min, step), min, max);
    const clampedB = clamp(snap(nextB, min, step), min, max);

    if (onChange) {
      onChange({
        from: Math.min(clampedA, clampedB),
        to: Math.max(clampedA, clampedB),
        valueA: clampedA,
        valueB: clampedB,
      });
    } else {
      setInternalA(clampedA);
      setInternalB(clampedB);
    }
  };

  const clientXToValue = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return min;

    const x = clamp(clientX - rect.left, 0, rect.width);
    const ratio = x / rect.width;
    return min + ratio * total;
  };

  const startDrag =
    (mode: DragMode) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      dragRef.current = {
        mode,
        startClientX: e.clientX,
        startA: a,
        startB: b,
      };

      (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", stopDrag);
    };

  const onPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;

    if (drag.mode === "handleA") {
      update(clientXToValue(e.clientX), drag.startB);
      return;
    }

    if (drag.mode === "handleB") {
      update(drag.startA, clientXToValue(e.clientX));
      return;
    }

    if (drag.mode === "range") {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;

      const deltaPx = e.clientX - drag.startClientX;
      const deltaValue = (deltaPx / rect.width) * total;

      let nextA = drag.startA + deltaValue;
      let nextB = drag.startB + deltaValue;

      const low = Math.min(nextA, nextB);
      const high = Math.max(nextA, nextB);

      if (low < min) {
        const shift = min - low;
        nextA += shift;
        nextB += shift;
      }

      if (high > max) {
        const shift = high - max;
        nextA -= shift;
        nextB -= shift;
      }

      update(nextA, nextB);
    }
  };

  const stopDrag = () => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
  };

  const handleStyleA = useMemo(
    () => ({
      left: `${aPct}%`,
      zIndex: a >= b ? 5 : 4,
    }),
    [aPct, a, b],
  );

  const handleStyleB = useMemo(
    () => ({
      left: `${bPct}%`,
      zIndex: b > a ? 5 : 4,
    }),
    [bPct, a, b],
  );

  return (
    <div className={`dual-range-slider ${className ?? ""}`}>
      <div className="dual-range-slider__track" ref={trackRef}>
        <div className="dual-range-slider__rail" />

        <div
          className="dual-range-slider__range"
          style={{
            left: `${fromPct}%`,
            width: `${toPct - fromPct}%`,
          }}
          onPointerDown={startDrag("range")}
        />

        <div
          className="dual-range-slider__handle"
          style={handleStyleA}
          onPointerDown={startDrag("handleA")}
          role="slider"
          aria-label="Handle A"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={a}
          tabIndex={0}
        />

        <div
          className="dual-range-slider__handle"
          style={handleStyleB}
          onPointerDown={startDrag("handleB")}
          role="slider"
          aria-label="Handle B"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={b}
          tabIndex={0}
        />
      </div>
    </div>
  );
};
