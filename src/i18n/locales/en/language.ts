import type { Widen } from "./_widen";

const language = {
  english: "English",
  swedish: "Swedish",
  pick: "Choose language",
  current: "Current language",
} as const;

export type LanguageCatalog = Widen<typeof language>;

export default language;
