import type { Widen } from "./_widen";

const modal = {
  close: "Close",
  closeDialog: "Close dialog",
  backdrop: "Click outside to close",
} as const;

export type ModalCatalog = Widen<typeof modal>;

export default modal;
