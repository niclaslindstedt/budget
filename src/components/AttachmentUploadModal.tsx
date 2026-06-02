import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Download,
  FileText,
  Loader2,
  Maximize2,
  Paperclip,
  RefreshCw,
  Trash2,
  UploadCloud,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { useT } from "../i18n";
import { effectiveMimeType } from "../utils/mime";
import { Modal } from "./Modal";
import { PdfZoomView } from "./PdfZoomView";

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
  const zoomPct = Math.round(scaleRef.current * 100);
  // 44px tap targets (Apple HIG minimum) so the controls are reliably
  // hittable on touch — the gesture path is a bonus on top of these.
  const btn =
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2 hover:text-accent disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-fg";

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
          onClick={reset}
          disabled={atMin}
          aria-label={t("attachment.fitToPage")}
          title={t("attachment.fitToPage")}
          className={btn}
        >
          <Maximize2 size={18} aria-hidden focusable={false} />
        </button>
      </div>
    </div>
  );
}

// iOS (iPhone / iPod, plus iPadOS 13+ masquerading as "MacIntel" with a
// touch screen) ignores the `<a download>` attribute: clicking a blob:
// link just navigates the single PWA window to the URL and flashes the
// page behind. There the Web Share sheet ("Save to Files" / share) is the
// reliable way to hand the file off, so the download falls back to
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
  // Localized noun for the attachment ("Payslip" / "Receipt"). Drives the
  // modal title.
  title: string;
  // The attachment currently stored on the owning entry, or undefined when
  // none is attached. Seeds the modal: a path opens straight into the
  // preview, its absence into the drag-and-drop upload zone.
  currentPath: string | undefined;
  // Accepted file types for the picker / drop zone. Defaults to images +
  // PDF — the only two the inline preview can render.
  accept?: string;
  // Write the picked file to the backend AND persist the reference onto the
  // owning entry; resolves the stored path. The host owns both the file
  // write and the data commit so this modal stays storage-agnostic and can
  // serve payslips, receipts, and any future attachment alike.
  onUpload: (file: File) => Promise<string>;
  // Fetch the attachment bytes for the inline preview / download.
  onDownload: (path: string) => Promise<Blob>;
  // Delete the file AND clear the reference on the owning entry.
  onRemove: (path: string) => Promise<void>;
};

const DEFAULT_ACCEPT = "image/*,application/pdf";

// Universal "manage a single file attachment" modal — used for salary
// payslips and transaction receipts. It folds the upload, in-app preview,
// replace, remove, and download flows into one surface:
//
//   - No attachment yet → a drag-and-drop zone (or click to browse) that
//     uploads the dropped / picked file.
//   - Attachment present → the file rendered inline (an `<img>` for images,
//     an `<iframe>` for PDFs) with Replace / Remove / Download controls.
//
// Every mutation commits immediately through the host callbacks (the file
// write and the data reference move together), so the modal is opened
// straight from a row's "…" menu rather than riding a parent form's Save.
// Rendering the blob inline — instead of handing a `blob:` URL to
// `window.open` — is what makes the preview work on iOS in-app browsers and
// standalone PWAs, where a new-tab `blob:` URL hangs on a blank page.
export function AttachmentUploadModal({
  open,
  onClose,
  title,
  currentPath,
  accept = DEFAULT_ACCEPT,
  onUpload,
  onDownload,
  onRemove,
}: Props) {
  const t = useT();
  // Local mirror of the stored path so the modal can flip between the
  // upload zone and the preview as the user uploads / removes, without a
  // round-trip through the parent's render.
  const [path, setPath] = useState<string | undefined>(currentPath);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "download" | "remove" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  // Drag highlight, tracked with a depth counter so dragging over a child
  // element (which fires dragleave on the parent) doesn't flicker it off.
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reseed whenever the modal (re)opens, possibly for a different entry.
  useEffect(() => {
    if (!open) return;
    setPath(currentPath);
    setBlob(null);
    setError(null);
    setBusy(null);
    setDragActive(false);
    dragDepth.current = 0;
  }, [open, currentPath]);

  // Download the current attachment for preview whenever the resolved path
  // changes while open — the initial open with a stored path, or right
  // after an upload sets a fresh one.
  useEffect(() => {
    if (!open || !path) {
      setBlob(null);
      return;
    }
    let cancelled = false;
    setBusy("download");
    setError(null);
    onDownload(path)
      .then((b) => {
        if (!cancelled) setBlob(b);
      })
      .catch(() => {
        if (!cancelled) setError(t("attachment.loadError"));
      })
      .finally(() => {
        if (!cancelled) setBusy((cur) => (cur === "download" ? null : cur));
      });
    return () => {
      cancelled = true;
    };
  }, [open, path, onDownload, t]);

  // Object URL for the inline `<img>` / `<iframe>`, retyped from the
  // filename so octet-stream blobs (Dropbox's content download) still drive
  // the right renderer instead of prompting a download.
  useEffect(() => {
    if (!blob || !path) {
      setUrl(null);
      return;
    }
    const type = effectiveMimeType(blob, path);
    const typed =
      type && type !== blob.type ? blob.slice(0, blob.size, type) : blob;
    const objectUrl = URL.createObjectURL(typed);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob, path]);

  const upload = useCallback(
    async (file: File) => {
      setBusy("upload");
      setError(null);
      try {
        const next = await onUpload(file);
        // Setting the path triggers the download effect, which fetches the
        // freshly-uploaded bytes and swaps the zone for the preview.
        setPath(next);
      } catch {
        setError(t("attachment.uploadError"));
        setBusy((cur) => (cur === "upload" ? null : cur));
      }
    },
    [onUpload, t],
  );

  function handlePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (file) void upload(file);
  }

  function handleDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  function handleDragEnter(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(e: DragEvent<HTMLElement>) {
    // Without preventDefault on dragover the browser refuses the drop.
    e.preventDefault();
  }

  function handleDragLeave(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragActive(false);
    }
  }

  async function handleRemove() {
    if (!path) return;
    setBusy("remove");
    setError(null);
    try {
      await onRemove(path);
      setPath(undefined);
      setBlob(null);
    } catch {
      setError(t("attachment.removeError"));
    } finally {
      setBusy((cur) => (cur === "remove" ? null : cur));
    }
  }

  async function handleDownload() {
    if (!blob || !path) return;
    const filename = path.split("/").pop() ?? path;
    const type = effectiveMimeType(blob, path);
    // On iOS the `<a download>` path silently fails, so offer the file
    // through the share sheet when the platform can share it. AbortError
    // means the user dismissed the sheet — leave it there rather than
    // falling through to a download that won't work anyway.
    if (isIosDevice() && typeof navigator.canShare === "function") {
      const file = new File([blob], filename, { type: type || blob.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          // Share the file alone — no `title` / `text`. iOS's "Save to
          // Files" target writes any accompanying share text out as a
          // second, separate file, so passing a title saves a stray text
          // file next to the attachment.
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

  const hasAttachment = path !== undefined;
  const filename = path ? (path.split("/").pop() ?? path) : "";
  const mimeType = blob && path ? effectiveMimeType(blob, path) : "";
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const uploading = busy === "upload";

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="attachment-upload-title"
      // Pin a stable tall canvas on desktop (mobile stays fullscreen) so
      // the zoom / pan surface and the drop zone have a real height to
      // fill — an auto-height card would collapse the `h-full` viewport.
      fixedHeight
    >
      <Modal.Header
        icon={<Paperclip size={14} aria-hidden focusable={false} />}
        title={title}
        onClose={onClose}
      />
      <Modal.Body noPadding className="flex min-h-0 flex-col">
        {hasAttachment ? (
          <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-2">
            {busy === "download" && (
              <Loader2
                size={28}
                aria-hidden
                focusable={false}
                className="animate-spin text-muted"
              />
            )}
            {url && isImage && <ZoomableImage src={url} alt={filename} />}
            {blob && isPdf && <PdfZoomView blob={blob} filename={filename} />}
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
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${
                dragActive
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line bg-surface-2 text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {uploading ? (
                <>
                  <Loader2
                    size={32}
                    aria-hidden
                    focusable={false}
                    className="animate-spin"
                  />
                  <span className="text-sm">{t("attachment.uploading")}</span>
                </>
              ) : (
                <>
                  <UploadCloud
                    size={36}
                    aria-hidden
                    focusable={false}
                    className={`transition-transform ${
                      dragActive ? "scale-110" : ""
                    }`}
                  />
                  <span className="text-sm font-bold text-fg">
                    {t("attachment.dropTitle")}
                  </span>
                  <span className="text-xs">{t("attachment.dropHint")}</span>
                  <span className="text-[11px] text-muted">
                    {t("attachment.dropTypes")}
                  </span>
                </>
              )}
            </button>
          </div>
        )}

        {error && (
          <p className="border-t border-line px-4 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {hasAttachment && filename && (
          <p className="truncate border-t border-line px-4 py-2 text-center font-mono text-xs text-muted">
            {filename}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handlePicked}
          className="hidden"
        />
      </Modal.Body>
      {hasAttachment && (
        <Modal.Footer>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!blob}
            aria-label={t("common.download")}
            title={t("common.download")}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded border border-line px-3 text-sm text-fg hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} aria-hidden focusable={false} />
            <span className="hidden sm:inline">{t("common.download")}</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label={t("attachment.replace")}
            title={t("attachment.replace")}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded border border-line px-3 text-sm text-fg hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} aria-hidden focusable={false} />
            <span className="hidden sm:inline">{t("attachment.replace")}</span>
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy === "remove"}
            aria-label={t("attachment.remove")}
            title={t("attachment.remove")}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded border border-line px-3 text-sm text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
            <span className="hidden sm:inline">{t("attachment.remove")}</span>
          </button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
