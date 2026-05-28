import { useCallback, useRef } from "react";

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

type Thumb = "min" | "max";

type Props = {
  min: number;
  max: number;
  // Current [from, to] pair. The component keeps the thumbs from
  // crossing, but callers should still pass min <= from <= to <= max.
  value: [number, number];
  onChange: (next: [number, number]) => void;
  step?: number;
  ariaLabelMin: string;
  ariaLabelMax: string;
  // Optional formatter for each thumb's `aria-valuetext` so a screen
  // reader announces a human value (currency, a date) rather than the
  // raw numeric domain (e.g. an epoch-day integer for date ranges).
  formatValueText?: (value: number) => string;
};

// Dual-thumb range slider in the project style. Built on pointer +
// keyboard handlers rather than two overlaid native `<input
// type="range">` so the track and thumbs read through theme tokens on
// every browser (the native thumb can't be themed consistently to the
// One Dark / One Light look). Track + fill + thumbs use tokens only;
// `rounded-full` and `border-2` are deliberately literal so a thumb
// keeps its shape and weight regardless of the Custom theme.
export function RangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
  ariaLabelMin,
  ariaLabelMax,
  formatValueText,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Keep the latest onChange / value in refs so the window-level
  // pointermove listener attached on drag-start always sees fresh
  // values without re-subscribing on every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  const span = max - min || 1;
  const [lo, hi] = value;
  const loPct = ((clamp(lo, min, max) - min) / span) * 100;
  const hiPct = ((clamp(hi, min, max) - min) / span) * 100;

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
    (thumb: Thumb, e: React.PointerEvent) => {
      e.preventDefault();
      const move = (ev: PointerEvent) => {
        const v = valueFromClientX(ev.clientX);
        const [curLo, curHi] = valueRef.current;
        if (thumb === "min") onChangeRef.current([Math.min(v, curHi), curHi]);
        else onChangeRef.current([curLo, Math.max(v, curLo)]);
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

  function onKey(thumb: Thumb, e: React.KeyboardEvent) {
    const [curLo, curHi] = value;
    if (e.key === "Home") {
      e.preventDefault();
      if (thumb === "min") onChange([min, curHi]);
      else onChange([curLo, curLo]);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      if (thumb === "min") onChange([curHi, curHi]);
      else onChange([curLo, max]);
      return;
    }
    let delta = 0;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -step;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = step;
    else return;
    e.preventDefault();
    if (thumb === "min") onChange([clamp(curLo + delta, min, curHi), curHi]);
    else onChange([curLo, clamp(curHi + delta, curLo, max)]);
  }

  const thumbClass =
    "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-accent bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg active:cursor-grabbing";

  return (
    <div className="relative flex h-5 items-center">
      <div
        ref={trackRef}
        className="relative h-1 w-full rounded-full bg-surface-3"
      >
        <div
          aria-hidden
          className="absolute h-full rounded-full bg-accent"
          style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
        />
        <button
          type="button"
          role="slider"
          aria-label={ariaLabelMin}
          aria-valuemin={min}
          aria-valuemax={hi}
          aria-valuenow={lo}
          aria-valuetext={formatValueText?.(lo)}
          onPointerDown={(e) => startDrag("min", e)}
          onKeyDown={(e) => onKey("min", e)}
          // Raise the lower thumb above the upper one when both pile up
          // near the high end, so it stays grabbable instead of buried.
          style={{ left: `${loPct}%`, zIndex: loPct > 90 ? 2 : 1 }}
          className={thumbClass}
        />
        <button
          type="button"
          role="slider"
          aria-label={ariaLabelMax}
          aria-valuemin={lo}
          aria-valuemax={max}
          aria-valuenow={hi}
          aria-valuetext={formatValueText?.(hi)}
          onPointerDown={(e) => startDrag("max", e)}
          onKeyDown={(e) => onKey("max", e)}
          style={{ left: `${hiPct}%` }}
          className={thumbClass}
        />
      </div>
    </div>
  );
}
