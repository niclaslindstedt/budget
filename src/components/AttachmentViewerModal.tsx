import { useEffect, useState } from "react";
import { Download, FileText, Paperclip } from "lucide-react";

import { useT } from "../i18n";
import { Modal } from "./Modal";

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
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const isImage = blob?.type.startsWith("image/") ?? false;
  const isPdf = blob?.type === "application/pdf";

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
          <a
            href={url}
            download={filename}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
          >
            <Download size={14} aria-hidden focusable={false} />
            {t("common.download")}
          </a>
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
