import { useState } from "react";
import { Plus, X } from "lucide-react";

import type { Scenario, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate, formatNumber } from "../../utils/format";
import { Button, DATE_INPUT_CLASS } from "../form";
import { BASELINE_COLOR_VAR, scenarioColorVar } from "./scenario-colors";

type Props = {
  monitors: readonly string[];
  scenarios: readonly Scenario[];
  // monitor date -> variant key ("baseline" | scenario id) -> balance.
  valuesByMonitor: ReadonlyMap<string, ReadonlyMap<string, number>>;
  settings: Settings;
  onSetMonitors: (monitors: string[]) => void;
};

// The balance monitors: one card per user-chosen date showing the
// projected balance for the baseline and every scenario (with each
// scenario's delta vs the baseline). Add / remove both dispatch the
// wholesale `setScenariosMonitors` replace through `onSetMonitors`.
export function ScenariosMonitorRow({
  monitors,
  scenarios,
  valuesByMonitor,
  settings,
  onSetMonitors,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [draftDate, setDraftDate] = useState("");

  const canAdd =
    /^\d{4}-\d{2}-\d{2}$/.test(draftDate) && !monitors.includes(draftDate);

  function handleAdd() {
    if (!canAdd) return;
    onSetMonitors([...monitors, draftDate]);
    setDraftDate("");
  }

  return (
    <div className="flex flex-col gap-3">
      {monitors.length === 0 ? (
        <p className="m-0 rounded border border-line bg-surface-2 px-4 py-4 text-center text-sm text-muted">
          {t("scenarios.noMonitors")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {monitors.map((monitor) => {
            const values = valuesByMonitor.get(monitor);
            const baseline = values?.get("baseline");
            return (
              <div
                key={monitor}
                className="flex flex-col gap-2 rounded border border-line bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold tracking-wider text-fg-bright">
                    {formatDate(monitor, settings.dateFormat, lang)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("scenarios.removeMonitor", {
                      date: formatDate(monitor, settings.dateFormat, lang),
                    })}
                    onClick={() =>
                      onSetMonitors(monitors.filter((m) => m !== monitor))
                    }
                    className="flex cursor-pointer items-center rounded border-0 bg-transparent p-1 text-muted hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                  >
                    <X size={14} aria-hidden focusable={false} />
                  </button>
                </div>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted">
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: `var(${BASELINE_COLOR_VAR})` }}
                      />
                      <span className="truncate">
                        {t("scenarios.baselineTab")}
                      </span>
                    </span>
                    <span className="font-mono tabular-nums text-fg-bright">
                      {baseline !== undefined
                        ? formatBalance(baseline, settings)
                        : "—"}
                    </span>
                  </li>
                  {scenarios.map((scenario, index) => {
                    const value = values?.get(scenario.id);
                    const delta =
                      value !== undefined && baseline !== undefined
                        ? value - baseline
                        : undefined;
                    return (
                      <li
                        key={scenario.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-muted">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{
                              background: `var(${scenarioColorVar(index)})`,
                            }}
                          />
                          <span className="truncate">{scenario.name}</span>
                        </span>
                        <span className="flex items-center gap-1.5 font-mono tabular-nums">
                          {delta !== undefined && delta !== 0 && (
                            <span
                              className={`text-xs ${
                                delta > 0 ? "text-positive" : "text-negative"
                              }`}
                            >
                              {delta > 0 ? "+" : ""}
                              {formatNumber(delta, settings)}
                            </span>
                          )}
                          <span
                            className={
                              value !== undefined && value < 0
                                ? "text-negative"
                                : "text-fg-bright"
                            }
                          >
                            {value !== undefined
                              ? formatBalance(value, settings)
                              : "—"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted">
            {t("scenarios.monitorDateLabel")}
          </span>
          <input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className={DATE_INPUT_CLASS}
          />
        </label>
        <Button
          variant="secondary"
          withIcon
          onClick={handleAdd}
          disabled={!canAdd}
        >
          <Plus size={14} aria-hidden focusable={false} />
          {t("scenarios.addMonitor")}
        </Button>
      </div>
    </div>
  );
}
