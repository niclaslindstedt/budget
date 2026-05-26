import type { Widen } from "./_widen";

const toast = {
  region: "Notifications",
  dismiss: "Dismiss",
  undid: "Undid: {action}",
  redid: "Redid: {action}",
  imported: "Imported {n} sheets",
  importedOne: "Imported 1 sheet",
  exported: "Exported budget data",
  cloudConnected: "Connected to {provider}",
  cloudDisconnected: "Disconnected from {provider}",
  folderConnected: "Connected to local folder",
  folderDisconnected: "Disconnected from local folder",
  sheetDeleted: "Deleted sheet “{name}”",
  accountDeleted: "Deleted account “{name}”",
  saveError: "Save failed — {reason}",
  rowsDeletedOne: "Deleted 1 row",
  rowsDeletedOther: "Deleted {n} rows",
} as const;

export type ToastCatalog = Widen<typeof toast>;

export default toast;
