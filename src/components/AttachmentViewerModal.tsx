import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  Download,
  FileText,
  Maximize2,
  Paperclip,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useT } from "../i18n";
import { effectiveMimeType } from "../utils/mime";
import { Modal } from "./Modal";

// iOS (iPhone / iPod, plus iPadOS 13+ masquerading as "MacIntel" with a
// touch screen) ignores the `<a download>` attribute: clicking a blob:
// link just navigates the single PWA window to the URL and flashes the
// page behind. There the Web Share sheet ("Save to Files" / share) is
// the reliable way to hand the file off, so the download falls back to
// `navigator.share` on those devices.
function isIosDevice(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator;
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  // The downloaded attachment. Null while a download is in flight or
  // after a failure — the modal shows a spinner / nothing until the blob
  // arrives. The caller owns the download so this component stays free of
  // any storage-adapter dependency.
  blob: Blob | null;
  // Suggested filename for the in-app download fallback link.
  filename: string;
  // Modal title (e.g. the localized "Payslip" / "Receipt" label).
  title: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 6;
// Per click / wheel-notch / double-tap step. 1.4 lands on 1 → 6 in a few
// taps without overshooting, and its reciprocal zooms back out symmetrically.
const ZOOM_STEP = 1.4;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// Pan can't drag the content further than the scaled overflow, so the
// image never floats fully off its own frame. Bounds are half the
// overflow on each axis, measured against the container (the image is
// `object-contain` inside it, so the container is the outer envelope).
function clampOffset(
  off: { x: number; y: number },
  scale: number,
  rect: { width: number; height: number },
): { x: number; y: number } {
  const maxX = ((scale - 1) * rect.width) / 2;
  const maxY = ((scale - 1) * rect.height) / 2;
  return {
    x: clamp(off.x, -maxX, maxX),
    y: clamp(off.y, -maxY, maxY),
  };
}

// A pinch-, wheel-, double-tap-, and button-zoomable image. Without this
// a payslip / receipt rendered at `object-contain` is unreadable — the
// fine print shrinks to fit the modal and there's no way in. Transform
// state lives in refs (mutated by gesture handlers that fire faster than
// React can re-render) with a single forced re-render to flush it to the
// DOM, so the focal-point math reads consistent values without stale
// closures or double-applied updates in StrictMode.
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const [, flush] = useReducer((c: number) => c + 1, 0);
  // Whether the user is currently zoomed in — drives the pan cursor and
  // gates single-pointer dragging. Mirrors `scaleRef` but as render state.
  const [zoomed, setZoomed] = useState(false);

  // Mouse-drag pan state (desktop). Touch is handled separately by the
  // native listeners below — see the comment on the touch effect for why
  // React's synthetic touch / pointer events can't drive pinch on iOS.
  const mouse = useRef({ dragging: false, lastX: 0, lastY: 0 });
  // Live touch-gesture state. `mode` gates pan vs pinch; `startDist` /
  // `startScale` anchor each pinch frame to the gesture start (no
  // compounding drift); `moved` distinguishes a tap from a drag so the
  // double-tap toggle only fires on a real tap.
  const touch = useRef({
    mode: "idle" as "idle" | "pan" | "pinch",
    startDist: 0,
    startScale: 1,
    lastX: 0,
    lastY: 0,
    moved: false,
    lastTapAt: 0,
  });

  const reset = useCallback(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setZoomed(false);
    flush();
  }, []);

  // Reset whenever a different attachment is shown.
  useEffect(() => {
    reset();
  }, [src, reset]);

  // Apply a multiplicative zoom about a focal point (client coords), so
  // the content under the cursor / pinch-midpoint stays put. Pass the
  // container centre as the focal point for the toolbar buttons.
  const zoomBy = useCallback(
    (factor: number, focalX: number, focalY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const prevScale = scaleRef.current;
      const next = clamp(prevScale * factor, MIN_SCALE, MAX_SCALE);
      const realFactor = next / prevScale;
      // Focal point relative to the container centre (transform origin).
      const fx = focalX - rect.left - rect.width / 2;
      const fy = focalY - rect.top - rect.height / 2;
      const prev = offsetRef.current;
      const off =
        next === MIN_SCALE
          ? { x: 0, y: 0 }
          : clampOffset(
              {
                x: fx - (fx - prev.x) * realFactor,
                y: fy - (fy - prev.y) * realFactor,
              },
              next,
              rect,
            );
      scaleRef.current = next;
      offsetRef.current = off;
      setZoomed(next > MIN_SCALE);
      flush();
    },
    [],
  );

  const panBy = useCallback((dx: number, dy: number) => {
    const el = containerRef.current;
    if (!el || scaleRef.current <= MIN_SCALE) return;
    const rect = el.getBoundingClientRect();
    offsetRef.current = clampOffset(
      { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy },
      scaleRef.current,
      rect,
    );
    flush();
  }, []);

  function zoomFromCentre(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomBy(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // Native, non-passive touch + wheel listeners. This is the crux of the
  // iOS fix: React routes its synthetic touch / pointer / wheel handlers
  // through a single passive root listener, so `preventDefault()` is a
  // no-op there. On a standalone iOS PWA the system then claims every
  // two-finger gesture for page zoom and fires `pointercancel`, so the
  // pinch never reaches our code. Binding `touchmove` / `wheel` directly
  // with `{ passive: false }` lets us `preventDefault()` and keep the
  // gesture, which is how in-app image viewers pinch-zoom on iOS at all.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault();
        touch.current.mode = "pinch";
        touch.current.startDist = dist(e.touches[0], e.touches[1]);
        touch.current.startScale = scaleRef.current;
      } else if (e.touches.length === 1) {
        touch.current.mode = "pan";
        touch.current.moved = false;
        touch.current.lastX = e.touches[0].clientX;
        touch.current.lastY = e.touches[0].clientY;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (touch.current.mode === "pinch" && e.touches.length >= 2) {
        e.preventDefault();
        const d = dist(e.touches[0], e.touches[1]);
        if (touch.current.startDist > 0) {
          const target = clamp(
            (touch.current.startScale * d) / touch.current.startDist,
            MIN_SCALE,
            MAX_SCALE,
          );
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          zoomBy(target / scaleRef.current, midX, midY);
        }
      } else if (touch.current.mode === "pan" && e.touches.length === 1) {
        // Only hijack the gesture (and stop the modal body scrolling)
        // once zoomed in — at 1× a one-finger drag is a no-op and should
        // pass through.
        if (scaleRef.current <= MIN_SCALE) return;
        e.preventDefault();
        const tp = e.touches[0];
        touch.current.moved = true;
        panBy(
          tp.clientX - touch.current.lastX,
          tp.clientY - touch.current.lastY,
        );
        touch.current.lastX = tp.clientX;
        touch.current.lastY = tp.clientY;
      }
    }

    function onTouchEnd(e: TouchEvent) {
      // A finger lifted off a single-finger tap that never moved: treat a
      // second such tap within 300ms as a double-tap zoom toggle (iOS
      // doesn't synthesize a reliable `dblclick` for touch).
      if (
        touch.current.mode === "pan" &&
        !touch.current.moved &&
        e.touches.length === 0
      ) {
        const now = Date.now();
        if (now - touch.current.lastTapAt < 300) {
          if (scaleRef.current > MIN_SCALE) reset();
          else zoomBy(2.5, touch.current.lastX, touch.current.lastY);
          touch.current.lastTapAt = 0;
        } else {
          touch.current.lastTapAt = now;
        }
      }
      if (e.touches.length === 0) {
        touch.current.mode = "idle";
        flush(); // restore the post-gesture transition
      } else if (e.touches.length === 1) {
        // Lifted one finger of a pinch — continue as a pan from the
        // finger that's still down.
        touch.current.mode = "pan";
        touch.current.moved = true;
        touch.current.lastX = e.touches[0].clientX;
        touch.current.lastY = e.touches[0].clientY;
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
  }, [zoomBy, panBy, reset]);

  // Mouse-only pan (desktop). Touch never reaches these — it's consumed
  // by the native listeners above — so they stay free of the iOS passive
  // -event problem.
  function onMouseDown(e: React.MouseEvent) {
    if (scaleRef.current <= MIN_SCALE) return;
    mouse.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!mouse.current.dragging) return;
    panBy(e.clientX - mouse.current.lastX, e.clientY - mouse.current.lastY);
    mouse.current.lastX = e.clientX;
    mouse.current.lastY = e.clientY;
  }

  function endMouse() {
    mouse.current.dragging = false;
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (scaleRef.current > MIN_SCALE) reset();
    else zoomBy(2.5, e.clientX, e.clientY);
  }

  const transform = `translate(${offsetRef.current.x}px, ${offsetRef.current.y}px) scale(${scaleRef.current})`;
  const atMin = scaleRef.current <= MIN_SCALE;
  const atMax = scaleRef.current >= MAX_SCALE;
  const gesturing = touch.current.mode !== "idle" || mouse.current.dragging;
  const btn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-fg transition-colors hover:text-accent disabled:cursor-default disabled:opacity-40";

  return (
    // The container is a zoom/pan gesture surface, not a control — the
    // real interactive elements are the toolbar buttons below. The mouse
    // handlers drive desktop drag-pan, with no keyboard analogue (the
    // buttons cover keyboard zoom), so the a11y interactive-element rule
    // doesn't apply.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={containerRef}
      // `touch-action: none` keeps the browser from starting its own
      // scroll / zoom on the first touch; the native `touchmove`
      // listener's `preventDefault` is what actually holds the gesture on
      // iOS. Both are needed.
      className="relative flex h-full max-h-full w-full max-w-full select-none items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endMouse}
      onMouseLeave={endMouse}
      onDoubleClick={onDoubleClick}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{
          transform,
          touchAction: "none",
          cursor: zoomed ? "grab" : "zoom-in",
          // Pan / pinch update every frame, so a transition would lag the
          // finger. Only the discrete button / double-tap steps animate.
          transition: gesturing ? "none" : "transform 120ms ease-out",
        }}
      />
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface/90 px-1.5 py-1 shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => zoomFromCentre(1 / ZOOM_STEP)}
          disabled={atMin}
          aria-label={t("attachment.zoomOut")}
          title={t("attachment.zoomOut")}
          className={btn}
        >
          <ZoomOut size={16} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={atMin}
          aria-label={t("attachment.resetZoom")}
          title={t("attachment.resetZoom")}
          className={btn}
        >
          <Maximize2 size={16} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={() => zoomFromCentre(ZOOM_STEP)}
          disabled={atMax}
          aria-label={t("attachment.zoomIn")}
          title={t("attachment.zoomIn")}
          className={btn}
        >
          <ZoomIn size={16} aria-hidden focusable={false} />
        </button>
      </div>
    </div>
  );
}

// Universal in-app viewer for a downloaded file attachment (payslip,
// receipt, …). Renders the blob inline — an `<img>` for images, an
// `<iframe>` for PDFs — instead of handing a `blob:` URL to
// `window.open`. That matters on iOS: a `blob:` URL opened in a new tab
// hangs on a blank page inside in-app browsers (SFSafariViewController)
// and standalone PWAs, and calling `window.open` after the `await` that
// fetches the blob loses the user-gesture so the popup is blocked
// outright. Rendering in a portalled modal works in every context. A
// Download button is always offered as the escape hatch for file types
// the browser can't preview inline (and for iOS, where PDFs in an
// `<iframe>` can still come up blank).
export function AttachmentViewerModal({
  open,
  onClose,
  blob,
  filename,
  title,
}: Props) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    // Some backends (Dropbox's content download) return the blob typed
    // as octet-stream regardless of the real file type. Re-wrap it with
    // the type resolved from the filename so the object URL drives the
    // right inline renderer instead of prompting a download.
    const type = effectiveMimeType(blob, filename);
    const typed =
      type && type !== blob.type ? blob.slice(0, blob.size, type) : blob;
    const objectUrl = URL.createObjectURL(typed);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, filename]);

  const mimeType = blob ? effectiveMimeType(blob, filename) : "";
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  async function handleDownload() {
    if (!blob) return;
    const type = effectiveMimeType(blob, filename);
    // On iOS the `<a download>` path silently fails, so offer the file
    // through the share sheet when the platform can share it. AbortError
    // means the user dismissed the sheet — leave it at that rather than
    // falling through to a download that won't work anyway.
    if (isIosDevice() && typeof navigator.canShare === "function") {
      const file = new File([blob], filename, { type: type || blob.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          // Share the file alone — no `title`/`text`. iOS's "Save to
          // Files" target writes any accompanying share text out as a
          // second, separate file, so passing a title here saves a
          // stray text file next to the payslip.
          await navigator.share({ files: [file] });
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
        }
      }
    }
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="attachment-viewer-title"
      // Pin a stable tall canvas on desktop (mobile stays fullscreen) so
      // the zoom / pan surface has a real height to fill — an auto-height
      // card would collapse the `h-full` viewport to zero.
      fixedHeight
    >
      <Modal.Header
        icon={<Paperclip size={14} aria-hidden focusable={false} />}
        title={title}
        onClose={onClose}
      />
      <Modal.Body
        noPadding
        className="flex items-center justify-center bg-surface-2"
      >
        {url && isImage && <ZoomableImage src={url} alt={filename} />}
        {url && isPdf && (
          <iframe src={url} title={filename} className="h-full w-full" />
        )}
        {url && !isImage && !isPdf && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <FileText
              size={32}
              aria-hidden
              focusable={false}
              className="text-muted"
            />
            <p className="text-sm text-muted">
              {t("attachment.cannotPreview")}
            </p>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {url && (
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
          >
            <Download size={14} aria-hidden focusable={false} />
            {t("common.download")}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
        >
          {t("common.close")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
