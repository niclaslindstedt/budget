// Runtime platform probes. UA sniffing is a last resort, used only
// where a behaviour genuinely has to branch on the OS — here, iOS is
// the one platform where a text field's only Enter source is the soft
// keyboard's "Search"/"Go" key rather than a physical Return, so an
// Enter handler that navigates has to treat iOS differently.
export function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPhone / iPod always identify themselves; iPad on iPadOS 13+
  // masquerades as "MacIntel" with multi-touch, so fall back to that
  // pair to catch iPads too.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
}
