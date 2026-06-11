import type { Widen } from "./_widen";

const charts = {
  // Trailing-window range row (ChartRangeRow) shared by chart surfaces:
  // the loans visualizer and the Insights net-worth chart.
  rangeAria: "Time range",
  range1y: "1Y",
  range2y: "2Y",
  range3y: "3Y",
  range5y: "5Y",
  rangeAll: "All",
} as const;

export type ChartsCatalog = Widen<typeof charts>;

export default charts;
