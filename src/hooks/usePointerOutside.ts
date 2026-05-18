import { useEffect, useRef } from "react";
import type { RefObject } from "react";

// Fires `onOutside` when a `pointerdown` lands outside every element
// referenced by `refs`. Used by pickers + popovers that dismiss on
// click-outside. Refs whose `.current` is null are ignored, so callers
// can pass refs that only attach to portals while open.
//
// `pointerdown` is used (rather than `mousedown` or `click`) to capture
// touch and pen interactions uniformly — this matches the rest of the
// project's pickers (TypePicker, CategoryPicker, BackendPicker).
//
// `refs` and `onOutside` may change identity between renders without
// re-attaching the listener — the hook reads through a latest-ref so
// callers don't need to memoise.
export function usePointerOutside(
  enabled: boolean,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onOutside: (event: PointerEvent) => void,
): void {
  const refsRef = useRef(refs);
  const onOutsideRef = useRef(onOutside);
  refsRef.current = refs;
  onOutsideRef.current = onOutside;

  useEffect(() => {
    if (!enabled) return;
    function handlePointer(e: PointerEvent) {
      const target = e.target as Node;
      for (const ref of refsRef.current) {
        if (ref.current?.contains(target)) return;
      }
      onOutsideRef.current(e);
    }
    document.addEventListener("pointerdown", handlePointer);
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [enabled]);
}
