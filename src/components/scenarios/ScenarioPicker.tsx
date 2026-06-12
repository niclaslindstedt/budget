import { Pencil, Plus, Trash2 } from "lucide-react";

import type { Scenario } from "../../data/types";
import { useT } from "../../i18n";
import { SelectPicker, type SelectOption } from "../form";
import { BASELINE_COLOR_VAR, scenarioColorVar } from "./scenario-colors";

type Props = {
  scenarios: readonly Scenario[];
  // Null ⇒ the Baseline is active.
  activeScenarioId: string | null;
  onSelect: (scenarioId: string | null) => void;
  onAdd: () => void;
  onRename: (scenario: Scenario) => void;
  onDelete: (scenario: Scenario) => void;
};

// Sentinel option values that can never collide with a scenario id
// (ids come out of `newId()`).
const BASELINE_VALUE = "";
const NEW_SCENARIO_VALUE = "__new__";

// The scenario switcher: a dropdown listing the Baseline (always
// first, not editable — it IS the base budget) and every scenario,
// each with its chart-series color dot, plus a trailing "New scenario"
// action entry. Edit / delete glyphs sit to the right of the dropdown
// and apply to the active scenario; they disappear on the Baseline.
// The selection is ephemeral UI state owned by the page.
export function ScenarioPicker({
  scenarios,
  activeScenarioId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: Props) {
  const t = useT();
  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) ?? null;

  const dot = (colorVar: string) => (
    <span
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: `var(${colorVar})` }}
    />
  );

  const options: SelectOption<string>[] = [
    {
      value: BASELINE_VALUE,
      label: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {dot(BASELINE_COLOR_VAR)}
          <span className="truncate">{t("scenarios.baselineTab")}</span>
        </span>
      ),
    },
    ...scenarios.map((scenario, index) => ({
      value: scenario.id,
      label: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          {dot(scenarioColorVar(index))}
          <span className="truncate">{scenario.name}</span>
        </span>
      ),
    })),
    {
      value: NEW_SCENARIO_VALUE,
      label: (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
          <Plus size={14} aria-hidden focusable={false} className="shrink-0" />
          <span className="truncate">{t("scenarios.addScenario")}</span>
        </span>
      ),
    },
  ];

  const iconButtonClass =
    "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1 md:max-w-xs">
        <SelectPicker
          value={activeScenarioId ?? BASELINE_VALUE}
          options={options}
          onChange={(next) => {
            if (next === NEW_SCENARIO_VALUE) onAdd();
            else onSelect(next === BASELINE_VALUE ? null : next);
          }}
          ariaLabel={t("scenarios.scenarioTabsLabel")}
        />
      </div>
      {activeScenario && (
        <>
          <button
            type="button"
            aria-label={t("scenarios.renameScenario")}
            title={t("scenarios.renameScenario")}
            onClick={() => onRename(activeScenario)}
            className={`${iconButtonClass} hover:border-accent hover:text-accent`}
          >
            <Pencil size={14} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            aria-label={t("scenarios.deleteScenario")}
            title={t("scenarios.deleteScenario")}
            onClick={() => onDelete(activeScenario)}
            className={`${iconButtonClass} hover:border-danger hover:text-danger`}
          >
            <Trash2 size={14} aria-hidden focusable={false} />
          </button>
        </>
      )}
    </div>
  );
}
