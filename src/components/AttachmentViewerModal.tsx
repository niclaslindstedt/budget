import { useEffect, useState } from "react";
import { Download, FileText, Paperclip } from "lucide-react";

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
    <Modal open={open} onClose={onClose} labelledBy="attachment-viewer-title">
      <Modal.Header
        icon={<Paperclip size={14} aria-hidden focusable={false} />}
        title={title}
        onClose={onClose}
      />
      <Modal.Body
        noPadding
        className="flex items-center justify-center bg-surface-2"
      >
        {url && isImage && (
          <img
            src={url}
            alt={filename}
            className="mx-auto max-h-full max-w-full object-contain"
          />
        )}
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
