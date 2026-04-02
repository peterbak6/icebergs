import React, { useRef, useState } from "react";
import "./RangeSlider.css";

type DualRangeChange = {
  from: number;
  to: number;
};

type DualRangeSliderProps = {
  min: number;
  max: number;
  step?: number;

  // controlled
  from?: number;
  to?: number;
  onChange?: (range: DualRangeChange) => void;

  // optional styling hook
  className?: string;
};

export const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  step = 1,
  from,
  to,
  onChange,
  className,
}) => {
  const sliderRef = useRef<HTMLDivElement | null>(null);

  const dragStateRef = useRef<{
    startX: number;
    startFrom: number;
    width: number;
  } | null>(null);

  // fallback internal state (uncontrolled mode)
  const [internalFrom, setInternalFrom] = useState<number>(from ?? min);
  const [internalTo, setInternalTo] = useState<number>(to ?? max);

  const fromValue = from ?? internalFrom;
  const toValue = to ?? internalTo;

  const totalRange = max - min;

  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);

  const update = (newFrom: number, newTo: number) => {
    if (onChange) {
      onChange({ from: newFrom, to: newTo });
    } else {
      setInternalFrom(newFrom);
      setInternalTo(newTo);
    }
  };

  const fromPct = ((fromValue - min) / totalRange) * 100;
  const toPct = ((toValue - min) / totalRange) * 100;

  // --- Thumb handlers

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.min(Number(e.target.value), toValue - step);
    update(val, toValue);
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(Number(e.target.value), fromValue + step);
    update(fromValue, val);
  };

  // --- Range drag

  const handleRangeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();

    dragStateRef.current = {
      startX: e.clientX,
      startFrom: fromValue,
      width: toValue - fromValue,
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleMove = (e: MouseEvent) => {
    if (!dragStateRef.current || !sliderRef.current) return;

    const { startX, startFrom, width } = dragStateRef.current;
    const rect = sliderRef.current.getBoundingClientRect();

    const deltaPx = e.clientX - startX;
    const deltaValue =
      Math.round(((deltaPx / rect.width) * totalRange) / step) * step;

    let newFrom = startFrom + deltaValue;
    let newTo = newFrom + width;

    if (newFrom < min) {
      newFrom = min;
      newTo = min + width;
    }

    if (newTo > max) {
      newTo = max;
      newFrom = max - width;
    }

    update(newFrom, newTo);
  };

  const handleUp = () => {
    dragStateRef.current = null;
    window.removeEventListener("mousemove", handleMove);
    window.removeEventListener("mouseup", handleUp);
  };

  return (
    <div className={`range-slider ${className ?? ""}`}>
      <div className="slider-container" ref={sliderRef}>
        <div
          className="slider-range"
          style={{
            left: `${fromPct}%`,
            width: `${toPct - fromPct}%`,
          }}
          onMouseDown={handleRangeMouseDown}
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={fromValue}
          onChange={handleFromChange}
          className="thumb thumb-left"
        />

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={toValue}
          onChange={handleToChange}
          className="thumb thumb-right"
        />
      </div>
    </div>
  );
};
