import { useEffect, useState } from "react";

// True when the page is running as an installed PWA — `display-mode:
// standalone` on Chromium/Android/desktop Chrome, or
// `navigator.standalone === true` on iOS Safari (the only iOS browser
// that installs PWAs to the home screen). Reactive so a window that
// flips between modes during the session (rare but possible on
// Android when the system relaunches the app) updates immediately.
const STANDALONE_QUERY = "(display-mode: standalone)";

type StandaloneNavigator = Navigator & { standalone?: boolean };

function read(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as StandaloneNavigator;
  if (nav.standalone === true) return true;
  if (window.matchMedia && window.matchMedia(STANDALONE_QUERY).matches)
    return true;
  return false;
}

// Non-reactive snapshot for touch handlers that only need the current
// value (e.g. row-swipe gestures deciding whether to surrender the
// touch to the document-level sheet-swipe hook). Avoids subscribing
// every row to the matchMedia change event.
export function readIsStandalone(): boolean {
  return read();
}

export function useIsStandalone(): boolean {
  const [standalone, setStandalone] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(STANDALONE_QUERY);
    const handler = () => setStandalone(read());
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return standalone;
}
