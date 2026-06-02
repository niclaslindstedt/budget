import type { Widen } from "./_widen";

const attachment = {
  cannotPreview: "This file can't be previewed here. Download it to open it.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
} as const;

export type AttachmentCatalog = Widen<typeof attachment>;

export default attachment;
