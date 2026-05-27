import { useState } from "react";

import type { Settings } from "../../../data/types";
import type { SettingsTabId } from "../../SettingsModal";

type Result = {
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  // Pre-selected tab when SettingsModal next transitions open — used
  // by launchers (e.g. the storage-size warning) that should land the
  // user on a specific section. Cleared back to undefined right after
  // the modal opens so a subsequent menu-driven open lands on General.
  settingsInitialTab: SettingsTabId | undefined;
  setSettingsInitialTab: (next: SettingsTabId | undefined) => void;
  // Live preview of the Appearance settings while the SettingsModal
  // is open — the modal pushes its draft up here on every edit so the
  // user can see the theme / font / shape choice applied to the
  // running app before committing. Cleared back to null on close, so
  // cancelling reverts to the persisted settings without the modal
  // having to restore anything itself.
  previewSettings: Settings | null;
  setPreviewSettings: (next: Settings | null) => void;
};

export function useSettingsModal(): Result {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    SettingsTabId | undefined
  >(undefined);
  const [previewSettings, setPreviewSettings] = useState<Settings | null>(null);
  return {
    settingsOpen,
    setSettingsOpen,
    settingsInitialTab,
    setSettingsInitialTab,
    previewSettings,
    setPreviewSettings,
  };
}
