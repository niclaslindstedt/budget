import type { Widen } from "./_widen";

const backend = {
  thisBrowser: "This browser",
  localFolder: "Local folder",
  dropbox: "Dropbox",
  googleDrive: "Google Drive",
  folderUnsupported: "Requires Chrome, Edge, or another Chromium browser.",
  dropboxNotConfigured:
    "Not configured for this build (set VITE_DROPBOX_APP_KEY).",
  gdriveNotConfigured:
    "Not configured for this build (set VITE_GOOGLE_CLIENT_ID).",
} as const;

export type BackendCatalog = Widen<typeof backend>;

export default backend;
