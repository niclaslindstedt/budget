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

  // Active touch / mouse pointers, keyed by id. One pointer pans; two
  // pinch-zoom. Stored in a ref because the move handler runs between
  // renders.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  // Distance + scale captured when the second pinch pointer landed, so
  // each move scales relative to the gesture start rather than the
  // previous frame (no compounding drift).
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);

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

  function zoomFromCentre(factor: number) {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    zoomBy(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  // Wheel zoom needs a non-passive listener to call preventDefault (React
  // attaches onWheel passively at the root, where preventDefault is a
  // no-op), so wire it natively against the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP, e.clientX, e.clientY);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: scaleRef.current,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0) {
        const target = clamp(
          (pinchStart.current.scale * dist) / pinchStart.current.dist,
          MIN_SCALE,
          MAX_SCALE,
        );
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        zoomBy(target / scaleRef.current, mid.x, mid.y);
      }
      return;
    }

    // Single-pointer pan — only meaningful once zoomed in.
    if (scaleRef.current <= MIN_SCALE) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    offsetRef.current = clampOffset(
      {
        x: offsetRef.current.x + (cur.x - prev.x),
        y: offsetRef.current.y + (cur.y - prev.y),
      },
      scaleRef.current,
      rect,
    );
    flush();
  }

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  }

  function onDoubleClick(e: React.MouseEvent) {
    if (scaleRef.current > MIN_SCALE) reset();
    else zoomBy(2.5, e.clientX, e.clientY);
  }

  const transform = `translate(${offsetRef.current.x}px, ${offsetRef.current.y}px) scale(${scaleRef.current})`;
  const atMin = scaleRef.current <= MIN_SCALE;
  const atMax = scaleRef.current >= MAX_SCALE;
  const btn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-fg transition-colors hover:text-accent disabled:cursor-default disabled:opacity-40";

  return (
    <div
      ref={containerRef}
      // `touch-action: none` hands every touch gesture to our handlers so
      // the browser doesn't claim two-finger drags for page zoom / scroll.
      className="relative flex h-full max-h-full w-full max-w-full select-none items-center justify-center overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{
          transform,
          cursor: zoomed ? "grab" : "zoom-in",
          // Pan / pinch update every frame, so a transition would lag the
          // finger. Only the discrete button / double-tap steps animate.
          transition:
            pointers.current.size > 0 ? "none" : "transform 120ms ease-out",
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
          await navigator.share({ files: [file], title });
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
