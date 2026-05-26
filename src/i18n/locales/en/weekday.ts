import type { Widen } from "./_widen";

const weekday = {
  short: {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  },
} as const;

export type WeekdayCatalog = Widen<typeof weekday>;

export default weekday;
