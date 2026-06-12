import { Pencil, Plus, Trash2 } from "lucide-react";

import type { Scenario } from "../../data/types";
import { useT } from "../../i18n";
import { ActionsMenu } from "../form";
import { BASELINE_COLOR_VAR, scenarioColorVar } from "./scenario-colors";

type Props = {
  scenarios: readonly Scenario[];
  // Null ⇒ the Baseline tab is active.
  activeScenarioId: string | null;
  onSelect: (scenarioId: string | null) => void;
  onAdd: () => void;
  onRename: (scenario: Scenario) => void;
  onDelete: (scenario: Scenario) => void;
};

// The scenario switcher: a Baseline chip (always first, not editable —
// it IS the base budget), one chip per scenario with its chart-series
// color dot and a "…" menu (rename / delete), and a trailing "+" to
// create the next scenario. The selection is ephemeral UI state owned
// by the page.
export function ScenarioTabs({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: Props) {
  const t = useT();

  const chipClass = (active: boolean) =>
    `flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm whitespace-nowrap focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
      active
        ? "border-accent bg-surface-2 text-fg-bright"
        : "border-line bg-surface text-muted hover:border-accent hover:text-fg"
    }`;

  return (
    <div
      role="tablist"
      aria-label={t("scenarios.scenarioTabsLabel")}
      className="flex flex-wrap items-center gap-1.5"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeScenarioId === null}
        onClick={() => onSelect(null)}
        className={chipClass(activeScenarioId === null)}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: `var(${BASELINE_COLOR_VAR})` }}
        />
        {t("scenarios.baselineTab")}
      </button>
      {scenarios.map((scenario, index) => {
        const active = activeScenarioId === scenario.id;
        return (
          <div key={scenario.id} className="flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(scenario.id)}
              className={chipClass(active)}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: `var(${scenarioColorVar(index)})` }}
              />
              <span className="max-w-40 truncate">{scenario.name}</span>
            </button>
            {active && (
              <ActionsMenu
                ariaLabel={t("cell.moreActions")}
                items={[
                  {
                    key: "rename",
                    icon: <Pencil size={16} aria-hidden focusable={false} />,
                    label: t("scenarios.renameScenario"),
                    onClick: () => onRename(scenario),
                  },
                  {
                    key: "delete",
                    icon: <Trash2 size={16} aria-hidden focusable={false} />,
                    label: t("scenarios.deleteScenario"),
                    danger: true,
                    onClick: () => onDelete(scenario),
                  },
                ]}
              />
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex cursor-pointer items-center gap-1 rounded border border-dashed border-line bg-transparent px-2.5 py-1.5 text-sm text-muted hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <Plus size={14} aria-hidden focusable={false} />
        {t("scenarios.addScenario")}
      </button>
    </div>
  );
}
