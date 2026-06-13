import type { Widen } from "./_widen";

const pwa = {
  updateReady: "Updated to {version} — reload to apply",
  updateReadyGeneric: "A new version is ready — reload to apply",
  downloading: "Downloading update… {percent}%",
  reload: "Reload",
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
