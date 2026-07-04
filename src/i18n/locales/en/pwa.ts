import type { Widen } from "./_widen";

const pwa = {
  updateReady: "Update ready",
  updateVersion: "v{version}",
  updateAction: "Update",
  downloading: "Downloading update… {percent}%",
  dismiss: "Dismiss update notice",
  installTitle: "Install Budget",
  installBody:
    "Install Budget on this device for one-tap access like a native app.",
  iosInstallBody:
    "Tap {share} in Safari, then choose Add to Home Screen to install Budget like a native app.",
  install: "Install",
  installDismiss: "Dismiss install hint",
  pullToRefresh: "Pull to refresh",
  releaseToRefresh: "Release to refresh",
  refreshing: "Refreshing…",
} as const;

export type PwaCatalog = Widen<typeof pwa>;

export default pwa;
