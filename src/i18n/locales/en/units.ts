import type { Widen } from "./_widen";

const units = {
  minutes: "minutes",
  minute: "minute",
  hours: "hours",
  hour: "hour",
  days: "days",
  day: "day",
  weeks: "weeks",
  week: "week",
  months: "months",
  month: "month",
  years: "years",
  year: "year",
  seconds: "seconds",
  second: "second",
} as const;

export type UnitsCatalog = Widen<typeof units>;

export default units;
