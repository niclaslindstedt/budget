import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// TEMPORARY diagnostic overlay for the iOS 26 standalone-PWA viewport
// split (bottom bar / fullscreen modal anchoring above the physical
// screen bottom). It prints every length-related signal side by side so
// we can see which one actually equals the physical screen on a real
// device — `100vh` is the codebase's current assumption and the bug
// reports show it reading short on iOS 26. NOT shipped: remove this file
// and its mount in AppShell once the correct unit is identified.
//
// The four CSS-unit rows are measured from real probe elements
// (`position: fixed; height: 100<unit>`) rather than guessed, so the
// numbers reflect exactly what the engine resolves each unit to.

type Probe = {
  vh: number;
  svh: number;
  dvh: number;
  lvh: number;
};

function readProbe(els: {
  vh: HTMLDivElement | null;
  svh: HTMLDivElement | null;
  dvh: HTMLDivElement | null;
  lvh: HTMLDivElement | null;
}): Probe {
  const h = (el: HTMLDivElement | null) =>
    el ? Math.round(el.getBoundingClientRect().height) : 0;
  return { vh: h(els.vh), svh: h(els.svh), dvh: h(els.dvh), lvh: h(els.lvh) };
}

export function ViewportDebug() {
  const vhRef = useRef<HTMLDivElement | null>(null);
  const svhRef = useRef<HTMLDivElement | null>(null);
  const dvhRef = useRef<HTMLDivElement | null>(null);
  const lvhRef = useRef<HTMLDivElement | null>(null);

  const [snap, setSnap] = useState<Record<string, number | string>>({});
  const [copied, setCopied] = useState(false);

  const measure = useCallback(() => {
    const vv = window.visualViewport;
    const probe = readProbe({
      vh: vhRef.current,
      svh: svhRef.current,
      dvh: dvhRef.current,
      lvh: lvhRef.current,
    });
    setSnap({
      standalone:
        (window.navigator as Navigator & { standalone?: boolean })
          .standalone === true
          ? "nav:true"
          : window.matchMedia?.("(display-mode: standalone)").matches
            ? "mq:true"
            : "false",
      "screen.height": Math.round(window.screen.height),
      innerHeight: Math.round(window.innerHeight),
      "doc.clientHeight": Math.round(document.documentElement.clientHeight),
      "vv.height": vv ? Math.round(vv.height) : "n/a",
      "vv.offsetTop": vv ? Math.round(vv.offsetTop) : "n/a",
      "vv.pageTop": vv ? Math.round(vv.pageTop) : "n/a",
      "vv.scale": vv ? vv.scale : "n/a",
      "100vh": probe.vh,
      "100svh": probe.svh,
      "100dvh": probe.dvh,
      "100lvh": probe.lvh,
      dpr: window.devicePixelRatio,
    });
  }, []);

  useEffect(() => {
    measure();
    const vv = window.visualViewport;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    const id = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.clearInterval(id);
    };
  }, [measure]);

  const copy = useCallback(() => {
    const text = Object.entries(snap)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }, [snap]);

  const probeStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: 1,
    visibility: "hidden",
    pointerEvents: "none",
    zIndex: -1,
  };

  return createPortal(
    <>
      {/* CSS-unit probes — measured, not guessed. */}
      <div ref={vhRef} style={{ ...probeStyle, height: "100vh" }} />
      <div ref={svhRef} style={{ ...probeStyle, height: "100svh" }} />
      <div ref={dvhRef} style={{ ...probeStyle, height: "100dvh" }} />
      <div ref={lvhRef} style={{ ...probeStyle, height: "100lvh" }} />

      {/* A 2px green hairline pinned to fixed bottom:0 so you can SEE
          where the engine thinks the bottom edge is vs the real screen. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: "#3fb950",
          zIndex: 100000,
          pointerEvents: "none",
        }}
      />

      <button
        type="button"
        onClick={copy}
        style={{
          position: "fixed",
          top: "env(safe-area-inset-top)",
          left: 0,
          zIndex: 100001,
          font: "10px/1.35 ui-monospace, monospace",
          color: "#fff",
          background: "rgba(0,0,0,0.82)",
          padding: "4px 6px",
          maxWidth: "60vw",
          whiteSpace: "pre",
          textAlign: "left",
          border: "none",
          borderBottomRightRadius: 6,
          cursor: "pointer",
        }}
      >
        {Object.entries(snap)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n")}
        {"\n"}
        {copied ? "[copied ✓]" : "[tap to copy]"}
      </button>
    </>,
    document.body,
  );
}
