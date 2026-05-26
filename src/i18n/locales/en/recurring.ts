import type { Widen } from "./_widen";

const recurring = {
  panelTitle: "Recurring candidates",
  panelHint:
    "Detected in imported history. Click Promote to turn one into a recurring series.",
  promote: "Promote",
  promoteFull: "Promote to recurring",
  promoteHint:
    "Schedules {n} future entries over the next 12 months from the detected pattern.",
  promoteHintDisabled:
    "No future dates left in the detected pattern — nothing to schedule.",
  dismiss: "Not recurring",
  dismissAll: "Dismiss all",
  dismissAllConfirm: "Dismiss all candidates?",
  dismissAllConfirmHint:
    "{n} recurring candidate will be marked as not recurring and hidden from this panel. You can restore them later from Settings.",
  dismissAllConfirmHintPlural:
    "{n} recurring candidates will be marked as not recurring and hidden from this panel. You can restore them later from Settings.",
  dismissAllAction: "Dismiss all ({n})",
  showMore: "Show {n} more",
  occurrencesSince: "{n} occurrences since",
  confident: "{n}% confident",
  suggested: "Suggested:",
  cadenceWeekly: "Weekly",
  cadenceBiweekly: "Biweekly",
  cadenceMonthly: "Monthly",
  cadenceQuarterly: "Quarterly",
  cadenceYearly: "Yearly",
  none: "No suggestions right now.",
  everyMonthOn: "Every month on {day}",
  irregular: "Irregular",
  avgInterval: "~ every {days} days",
  viewEntriesAria: "View entries for {description}",
  entriesTitle: "Entries — {description}",
} as const;

export type RecurringCatalog = Widen<typeof recurring>;

export default recurring;
