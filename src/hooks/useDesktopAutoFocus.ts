import { useEffect } from "react";
import type { RefObject } from "react";

import { useIsMobile } from "./useIsMobile";

// Focuses `ref` when `when` becomes true (or when `refreshKey`
// changes while `when` is true), but only on desktop. On mobile,
// autofocus during a modal's entrance animation pops the soft
// keyboard before the modal has finished sliding in, which jolts the
// layout and hides the input the user just opened. Mobile users tap
// the field they want themselves; desktop users get the keyboard-
// driven shortcut the original `autoFocus` attribute gave them.
//
// `refreshKey` is for inputs that are remounted by React (e.g. via a
// `key={row.id}` on the element) and need to re-focus when the keyed
// identity changes — pass the same key here.
export function useDesktopAutoFocus(
  ref: RefObject<HTMLElement | null>,
  when: boolean,
  refreshKey?: string | number | null,
): void {
  const isMobile = useIsMobile();
  useEffect(() => {
    if (!when || isMobile) return;
    ref.current?.focus();
  }, [when, isMobile, ref, refreshKey]);
}
