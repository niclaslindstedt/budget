import type { Widen } from "./_widen";

const changelog = {
  title: "What's new",
  pageTitleHeading: "Changelog",
  noReleasesYet: "No releases yet.",
  gotIt: "Got it",
  showAll: "Show all changes",
} as const;

export type ChangelogCatalog = Widen<typeof changelog>;

export default changelog;
