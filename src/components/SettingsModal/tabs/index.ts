import {
  Bookmark,
  Building2,
  Hash,
  HardDrive,
  type LucideIcon,
  Palette,
  ScrollText,
  Settings as SettingsIcon,
  Sliders,
  Tag,
  Tags,
  Wrench,
} from "lucide-react";

import { AppearanceTab } from "./appearance";
import { CategoriesTab } from "./categories";
import { CompaniesTab } from "./companies";
import { DeveloperTab } from "./developer";
import { FormatTab } from "./format";
import { GeneralTab } from "./general";
import { LogsTab } from "./logs";
import { MemoryTab } from "./memory";
import { PatternsTab } from "./patterns";
import { StorageTab } from "./storage";
import { TagsTab } from "./tags";

export {
  AppearanceTab,
  CategoriesTab,
  CompaniesTab,
  DeveloperTab,
  FormatTab,
  GeneralTab,
  LogsTab,
  MemoryTab,
  PatternsTab,
  StorageTab,
  TagsTab,
};

// Single source of truth for the Settings modal's tab strip. Adding a
// future tab is one entry here plus a tab component file in this
// directory — the modal walks `TAB_REGISTRY` to derive the visible
// id list, the icon map, and the sidebar order.
//
// `visible` is an optional gate against the device-local developer
// flags. Tabs without a gate are always visible. The flags object
// stays the function signature even though only two flags exist
// today so a new gate can be added without retro-fitting every
// registry entry.
export type TabVisibilityFlags = {
  devMode: boolean;
  captureLogs: boolean;
};

export type TabEntry = {
  id: SettingsTabId;
  icon: LucideIcon;
  visible?: (flags: TabVisibilityFlags) => boolean;
};

export const TAB_REGISTRY: readonly TabEntry[] = [
  { id: "general", icon: Sliders },
  { id: "appearance", icon: Palette },
  { id: "format", icon: Hash },
  { id: "storage", icon: HardDrive },
  { id: "categories", icon: Tag },
  { id: "companies", icon: Building2 },
  { id: "tags", icon: Bookmark },
  { id: "patterns", icon: Tags },
  { id: "memory", icon: SettingsIcon },
  {
    id: "developer",
    icon: Wrench,
    visible: ({ devMode }) => devMode,
  },
  {
    id: "logs",
    icon: ScrollText,
    visible: ({ devMode, captureLogs }) => devMode && captureLogs,
  },
];

export type SettingsTabId =
  | "general"
  | "appearance"
  | "format"
  | "storage"
  | "categories"
  | "companies"
  | "tags"
  | "patterns"
  | "memory"
  | "developer"
  | "logs";
