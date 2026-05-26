import type { Widen } from "./_widen";

const moveCopy = {
  title: "Move or copy {n} entries",
  titleOne: "Move or copy entry",
  pickMonths: "Pick months",
  move: "Move",
  copy: "Copy",
  selectedMonths: "{n} months selected",
  targetMonth: "Target month",
  moveTitle: "Move {n} entry",
  moveTitlePlural: "Move {n} entries",
  copyTitle: "Copy {n} entry",
  copyTitlePlural: "Copy {n} entries",
  moveHint:
    "Pick a target month. Day-of-month is preserved (clamped to month length).",
  copyHint:
    "Pick one or more target months. Each selected entry is duplicated into every target, preserving day-of-month.",
  prevYear: "Previous year",
  nextYear: "Next year",
  targets: "Targets",
  copyTo: "Copy to {n} month",
  copyToPlural: "Copy to {n} months",
} as const;

export type MoveCopyCatalog = Widen<typeof moveCopy>;

export default moveCopy;
