import { useCallback, useRef } from "react";

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

type Props = {
  min: number;
  max: number;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  ariaLabel: string;
  // Optional formatter for the thumb's `aria-valuetext` so a screen
  // reader announces a human value rather than the raw domain integer.
  formatValueText?: (value: number) => string;
};

// Single-thumb slider in the project style — the one-value sibling of
// `RangeSlider`. Built on pointer + keyboard handlers rather than a
// native `<input type="range">` so the track and thumb read through
// theme tokens on every browser (the native thumb can't be themed
// consistently to the One Dark / One Light look). `rounded-full` and
// `border-2` are deliberately literal so the thumb keeps its shape and
// weight regardless of the Custom theme.
export function Slider({
  min,
  max,
  value,
  onChange,
  step = 1,
  ariaLabel,
  formatValueText,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Keep the latest onChange in a ref so the window-level pointermove
  // listener attached on drag-start always calls the fresh handler
  // without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const span = max - min || 1;
  const pct = ((clamp(value, min, max) - min) / span) * 100;

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
      const raw = min + clamp(ratio, 0, 1) * span;
      const snapped = Math.round(raw / step) * step;
      return clamp(snapped, min, max);
    },
    [min, max, span, step],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const move = (ev: PointerEvent) => {
        onChangeRef.current(valueFromClientX(ev.clientX));
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [valueFromClientX],
  );

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      onChange(max);
      return;
    }
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = step;
    else return;
    e.preventDefault();
    onChange(clamp(value + delta, min, max));
  }

  return (
    <div className="relative flex h-5 w-full items-center">
      <div
        ref={trackRef}
        className="relative h-1 w-full rounded-full bg-surface-3"
      >
        <div
          aria-hidden
          className="absolute h-full rounded-full bg-accent"
          style={{ left: 0, width: `${pct}%` }}
        />
        <button
          type="button"
          role="slider"
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={formatValueText?.(value)}
          onPointerDown={startDrag}
          onKeyDown={onKey}
          style={{ left: `${pct}%` }}
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-accent bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg active:cursor-grabbing"
        />
      </div>
    </div>
  );
}
