import type { Widen } from "./_widen";

const datePicker = {
  title: "Pick a date",
  today: "Today",
  clear: "Clear",
  clearDate: "Clear date",
  prevMonth: "Previous month",
  nextMonth: "Next month",
  prevYear: "Previous year",
  nextYear: "Next year",
  month: "Month",
  year: "Year",
} as const;

export type DatePickerCatalog = Widen<typeof datePicker>;

export default datePicker;
