import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Loader2, Maximize2, ZoomIn, ZoomOut } from "lucide-react";

import { useT } from "../i18n";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
// Per button / wheel / double-tap step. Reciprocal zooms back out
// symmetrically.
const ZOOM_STEP = 1.4;
// Oversample factor applied on top of the device pixel ratio when
// rasterising each page, so text stays sharp when the user zooms in to
// read fine print (the whole reason this viewer exists). Capped by
// MAX_BACKING_WIDTH to keep canvas memory bounded on multi-page PDFs.
const OVERSAMPLE = 2;
const MAX_BACKING_WIDTH = 2400;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

type Status = "loading" | "ready" | "error";

// Inline PDF viewer with pinch / wheel / button zoom and pan. Replaces a
// bare `<iframe>`: an embedded PDF is non-interactive in a standalone iOS
// PWA (no pinch, no controls), which is exactly where receipts and
// payslips are read. pdf.js rasterises each page to a canvas we own, and
// zoom scales those canvases inside a natively-scrolling container — so
// one finger scrolls / pans and two fingers zoom, on every platform. The
// library is imported dynamically so it only downloads when a PDF is
// actually opened, keeping it out of the main bundle.
export function PdfZoomView({
  blob,
  filename,
}: {
  blob: Blob;
  filename: string;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // Fit-to-width base width (px) captured when the pages were rasterised;
  // the wrapper's rendered width is this times the current zoom.
  const baseWidthRef = useRef(0);
  const zoomRef = useRef(1);
  const [, flush] = useReducer((c: number) => c + 1, 0);

  // Render the PDF to canvases once, on mount / when the blob changes.
  useEffect(() => {
    let cancelled = false;
    let doc: import("pdfjs-dist").PDFDocumentProxy | null = null;
    setStatus("loading");

    async function run() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = (
          await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
        ).default;

        const data = await blob.arrayBuffer();
        if (cancelled) return;
        doc = await pdfjs.getDocument({ data }).promise;
        if (cancelled) return;

        const container = scrollRef.current;
        const wrapper = pagesRef.current;
        if (!container || !wrapper) return;
        const fitWidth = container.clientWidth || 600;
        baseWidthRef.current = fitWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        wrapper.replaceChildren();
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const unit = page.getViewport({ scale: 1 });
          const targetWidth = Math.min(
            fitWidth * dpr * OVERSAMPLE,
            MAX_BACKING_WIDTH,
          );
          const scale = targetWidth / unit.width;
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (cancelled) return;
          wrapper.appendChild(canvas);
        }
        wrapper.style.width = `${fitWidth}px`;
        zoomRef.current = 1;
        if (!cancelled) {
          setStatus("ready");
          flush();
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    run();

    return () => {
      cancelled = true;
      // Release the worker / parsed document so reopening doesn't leak.
      if (doc) doc.destroy?.();
    };
  }, [blob]);

  // Apply an absolute zoom level about a focal point (client coords),
  // keeping the content under the focal point stationary by adjusting the
  // native scroll offset. Mutates the DOM directly (and a ref) for smooth
  // per-frame pinch, then flushes a render for the percentage readout.
  const applyZoom = useCallback(
    (nextZoom: number, focalX: number, focalY: number) => {
      const el = scrollRef.current;
      const wrapper = pagesRef.current;
      const base = baseWidthRef.current;
      if (!el || !wrapper || base === 0) return;
      const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const prev = zoomRef.current;
      const rect = el.getBoundingClientRect();
      const fx = focalX - rect.left;
      const fy = focalY - rect.top;
      // Content coordinates (in fit-base px) currently under the focal
      // point. Both axes scale linearly with zoom because the canvases
      // keep their aspect ratio as the wrapper widens.
      const cx = (el.scrollLeft + fx) / prev;
      const cy = (el.scrollTop + fy) / prev;
      zoomRef.current = z;
      wrapper.style.width = `${base * z}px`;
      el.scrollLeft = cx * z - fx;
      el.scrollTop = cy * z - fy;
      flush();
    },
    [],
  );

  const zoomFromCentre = useCallback(
    (factor: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      applyZoom(
        zoomRef.current * factor,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    },
    [applyZoom],
  );

  const fit = useCallback(() => {
    const el = scrollRef.current;
    const wrapper = pagesRef.current;
    if (!el || !wrapper) return;
    zoomRef.current = 1;
    wrapper.style.width = `${baseWidthRef.current}px`;
    el.scrollTo({ top: 0, left: 0 });
    flush();
  }, []);

  // Native, non-passive gesture listeners. Two fingers zoom (we
  // `preventDefault` so iOS doesn't claim the pinch for page zoom); one
  // finger falls through to the container's native scroll for panning.
  // ctrl/⌘ + wheel zooms; a plain wheel scrolls.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    let startDist = 0;
    let startZoom = 1;
    let lastTapAt = 0;

    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey && !e.metaKey) return; // let plain wheel scroll
      e.preventDefault();
      applyZoom(
        zoomRef.current * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP),
        e.clientX,
        e.clientY,
      );
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        startDist = dist(e.touches[0], e.touches[1]);
        startZoom = zoomRef.current;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length >= 2 && startDist > 0) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        applyZoom(startZoom * (d / startDist), midX, midY);
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length < 2) startDist = 0;
      // Double-tap toggles between fit and 2.5×.
      if (e.touches.length === 0 && e.changedTouches.length === 1) {
        const now = Date.now();
        const tp = e.changedTouches[0];
        if (now - lastTapAt < 300) {
          if (zoomRef.current > MIN_ZOOM) fit();
          else applyZoom(2.5, tp.clientX, tp.clientY);
          lastTapAt = 0;
        } else {
          lastTapAt = now;
        }
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyZoom, fit]);

  const zoomPct = Math.round(zoomRef.current * 100);
  const atMin = zoomRef.current <= MIN_ZOOM;
  const atMax = zoomRef.current >= MAX_ZOOM;
  const btn =
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 hover:text-accent disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg";

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        // `pan-x pan-y` keeps one-finger scrolling native while the
        // non-passive `touchmove` listener intercepts two-finger pinch.
        className="h-full w-full overflow-auto bg-surface-2"
        style={{ touchAction: "pan-x pan-y" }}
      >
        <div
          ref={pagesRef}
          className="mx-auto flex flex-col items-center gap-2 py-2"
        />
      </div>

      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2
            size={28}
            aria-hidden
            focusable={false}
            className="animate-spin text-muted"
          />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted">{t("attachment.pdfError")}</p>
        </div>
      )}

      {status === "ready" && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-line bg-surface-3/95 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            onClick={() => zoomFromCentre(1 / ZOOM_STEP)}
            disabled={atMin}
            aria-label={t("attachment.zoomOut")}
            title={t("attachment.zoomOut")}
            className={btn}
          >
            <ZoomOut size={18} aria-hidden focusable={false} />
          </button>
          <span
            className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-fg"
            aria-hidden
          >
            {zoomPct}%
          </span>
          <button
            type="button"
            onClick={() => zoomFromCentre(ZOOM_STEP)}
            disabled={atMax}
            aria-label={t("attachment.zoomIn")}
            title={t("attachment.zoomIn")}
            className={btn}
          >
            <ZoomIn size={18} aria-hidden focusable={false} />
          </button>
          <span className="mx-0.5 h-6 w-px bg-line" aria-hidden />
          <button
            type="button"
            onClick={fit}
            disabled={atMin}
            aria-label={t("attachment.fitToPage")}
            title={t("attachment.fitToPage")}
            className={btn}
          >
            <Maximize2 size={18} aria-hidden focusable={false} />
          </button>
        </div>
      )}

      {/* Title kept for the alt/aria surface even though pages render to
          canvas — screen readers announce the viewer's purpose. */}
      <span className="sr-only">{filename}</span>
    </div>
  );
}
