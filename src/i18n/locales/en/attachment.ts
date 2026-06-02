import type { Widen } from "./_widen";

const attachment = {
  cannotPreview: "This file can't be previewed here. Download it to open it.",
  // Zoom / pan controls on the inline image preview.
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fitToPage: "Fit to page",
  pdfError: "Couldn't display this PDF. Download it to open it.",
  // Drag-and-drop upload zone + controls in the shared attachment modal.
  dropTitle: "Drag & drop a file here",
  dropHint: "or click to browse",
  dropTypes: "Images or PDF",
  uploading: "Uploading…",
  replace: "Replace",
  remove: "Remove",
  loadError: "Could not load the file.",
  uploadError: "Could not save the file. Please try again.",
  removeError: "Could not remove the file. Please try again.",
} as const;

export type AttachmentCatalog = Widen<typeof attachment>;

export default attachment;
