import { useMemo } from "react";
import { X } from "lucide-react";

import type { Scenario, Settings } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate, formatNumber } from "../../utils/format";
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
// scenario's delta vs the baseline). Removing a card dispatches the
// wholesale `setScenariosMonitors` replace through `onSetMonitors`;
// adding goes through `ScenariosAddMonitorModal`, opened by the "+"
// button on the page's monitors title row.
export function ScenariosMonitorRow({
  monitors,
  scenarios,
  valuesByMonitor,
  settings,
  onSetMonitors,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass, padChars } = useAmountColumns();

  // Balances render as absolute values with the sign carried by colour
  // (negative = red), mirroring the sheets' BalanceCell — an inline
  // minus would push that row's digits a character left of its
  // siblings'. Deltas keep their explicit +/- prefix: the sign IS the
  // message there, and both prefixes are one character so the column
  // stays flush.
  const balanceText = (value: number) =>
    formatBalance(Math.abs(value), settings);
  const deltaText = (delta: number) =>
    `${delta > 0 ? "+" : ""}${formatNumber(delta, settings)}`;

  // Widest formatted delta / balance across EVERY card, in characters —
  // the delta and balance columns of all cards resolve to the same
  // tracks (same ch-var scheme as the tables' amount / balance columns)
  // so the numbers align between cards too, not just within one.
  const { deltaChars, valueChars } = useMemo(() => {
    let d = 0;
    let v = 0;
    for (const values of valuesByMonitor.values()) {
      const baseline = values.get("baseline");
      if (baseline !== undefined) v = Math.max(v, balanceText(baseline).length);
      for (const scenario of scenarios) {
        const value = values.get(scenario.id);
        if (value === undefined) continue;
        v = Math.max(v, balanceText(value).length);
        if (baseline === undefined) continue;
        const delta = value - baseline;
        if (delta === 0) continue;
        d = Math.max(d, deltaText(delta).length);
      }
    }
    return { deltaChars: d, valueChars: v };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesByMonitor, scenarios, settings]);

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
                {/* Three-track grid (name | delta | balance) so the
                    delta and balance columns align down the card —
                    inline flex rows let a wide balance push its row's
                    delta further left than its siblings'. The numeric
                    tracks are ch-sized from the widest value across
                    every card so the columns also line up card-to-
                    card. `contents` on each li hands its spans to the
                    grid. */}
                <ul
                  className="m-0 grid list-none gap-x-1.5 gap-y-1 p-0 font-mono text-sm"
                  // Half-a-character headroom on the numeric tracks —
                  // a track of exactly N ch can round below the
                  // rendered text width and wrap the currency token.
                  // The balance track adds twice the shared
                  // money-column gutter (`padChars`) on top: its
                  // content hugs the right edge, so the extra width
                  // becomes breathing room between the delta and
                  // balance columns.
                  style={{
                    gridTemplateColumns: `minmax(0, 1fr) calc(${deltaChars}ch + 0.5ch) calc(${valueChars + padChars * 2}ch + 0.5ch)`,
                  }}
                >
                  <li className="contents">
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
                    <span aria-hidden />
                    <span
                      className={`${cellClass} font-mono whitespace-nowrap tabular-nums ${
                        baseline !== undefined && baseline < 0
                          ? "text-negative"
                          : "text-fg-bright"
                      }`}
                    >
                      {baseline !== undefined ? balanceText(baseline) : "—"}
                    </span>
                  </li>
                  {scenarios.map((scenario, index) => {
                    const value = values?.get(scenario.id);
                    const delta =
                      value !== undefined && baseline !== undefined
                        ? value - baseline
                        : undefined;
                    return (
                      <li key={scenario.id} className="contents">
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
                        <span
                          className={`${cellClass} self-center font-mono text-xs whitespace-nowrap tabular-nums ${
                            delta !== undefined && delta < 0
                              ? "text-negative"
                              : "text-positive"
                          }`}
                        >
                          {delta !== undefined && delta !== 0
                            ? deltaText(delta)
                            : ""}
                        </span>
                        <span
                          className={`${cellClass} font-mono whitespace-nowrap tabular-nums ${
                            value !== undefined && value < 0
                              ? "text-negative"
                              : "text-fg-bright"
                          }`}
                        >
                          {value !== undefined ? balanceText(value) : "—"}
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
    </div>
  );
}
