import { useEffect, useState } from "react";

// True below Tailwind's `sm` breakpoint (640px). Used by Modal to
// switch between the mobile sub-screen layout and the desktop
// centered-card layout, and by callers that need to suppress mobile
// keyboard jank (e.g. autoFocus on form inputs that pops the soft
// keyboard during the modal entrance animation).
const QUERY = "(max-width: 639.98px)";

function read(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return mobile;
}
