import type { BackendCatalog } from "../en/backend";

const backend: BackendCatalog = {
  thisBrowser: "Denna webbläsare",
  localFolder: "Lokal mapp",
  dropbox: "Dropbox",
  googleDrive: "Google Drive",
  folderUnsupported:
    "Kräver Chrome, Edge eller annan Chromium-baserad webbläsare.",
  dropboxNotConfigured:
    "Inte konfigurerad för denna build (ange VITE_DROPBOX_APP_KEY).",
  gdriveNotConfigured:
    "Inte konfigurerad för denna build (ange VITE_GOOGLE_CLIENT_ID).",
};

export default backend;
