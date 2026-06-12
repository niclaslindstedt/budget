import type { ScenarioAmountModulation, Settings } from "../../data/types";
import { formatNumber } from "../../utils/format";

// Compact notation for a live amount adjustment — "+5 000", "×2",
// "−50 %" — shared by the month-table amount cell, the adjust modal's
// preview, and the diff modal so the same delta always reads the same.
export function formatModulation(
  modulation: ScenarioAmountModulation,
  settings: Settings,
): string {
  if (modulation.op === "multiply")
    return `×${formatNumber(modulation.value, settings)}`;
  const sign = modulation.value < 0 ? "−" : "+";
  const body = formatNumber(Math.abs(modulation.value), settings);
  return modulation.op === "percent" ? `${sign}${body} %` : `${sign}${body}`;
}
