import type { Widen } from "./_widen";

const charts = {
  // Window-button rows shared by chart surfaces: the trailing
  // ChartRangeRow (loans / Insights / investment history) and the
  // forward ChartHorizonRow (scenarios projection). The month labels
  // serve the horizon row; the year labels serve both.
  rangeAria: "Time range",
  range1m: "1M",
  range3m: "3M",
  range6m: "6M",
  range1y: "1Y",
  range2y: "2Y",
  range3y: "3Y",
  range5y: "5Y",
  rangeAll: "All",
} as const;

export type ChartsCatalog = Widen<typeof charts>;

export default charts;
