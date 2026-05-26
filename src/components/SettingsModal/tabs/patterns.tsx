import { useMemo } from "react";
import { ChevronDown, ChevronUp, Pencil, RefreshCw } from "lucide-react";

import { countRuleHitsOnSheets } from "../../../data/pattern-apply";
import { allCategories, allTypes } from "../../../data/presets";
import type { MatchRule, Settings, UserData } from "../../../data/types";
import { type TFunction, useT } from "../../../i18n";
import { formatAmount } from "../../../utils/format";
import { CategoryIconGlyph } from "../../icons";
import { Section } from "./shared";

export function PatternsTab({
  data,
  settings,
  onEditRule,
  onMoveRule,
  onReapplyAll,
}: {
  data: UserData;
  settings: Settings;
  // Open the existing MatchRuleModal in edit mode. The modal's own
  // danger button handles deletion — keeping the destructive action
  // behind the modal preserves the "open, review matches, then delete"
  // affordance the user already gets when invoking a rule from a row.
  onEditRule: (ruleId: string) => void;
  // Swap a rule with its neighbour in `data.matchRules`. Earlier =
  // higher priority, so the up button lifts a rule above its current
  // shadower; down demotes. The reducer no-ops at the ends.
  onMoveRule: (ruleId: string, direction: "up" | "down") => void;
  // Sweep every budget row against the current ruleset. The reducer
  // already runs this walk on rule create / update, so this surface
  // only exists so the user can force a sweep without pretending to
  // edit a rule (e.g. after importing a new workspace or unlocking
  // rows that were previously typeIdLocked by hand).
  onReapplyAll: () => void;
}) {
  const t = useT();
  // Merge user + preset types so the chip shows the right label even
  // for rules pointing at a built-in preset that lives in code, not in
  // `data.types`. Hidden presets stay in the lookup — a rule that
  // references one shouldn't render as orphaned just because the user
  // hid the type from pickers.
  const types = useMemo(() => allTypes(data), [data]);
  const categories = useMemo(() => allCategories(data), [data]);
  const typesById = useMemo(() => {
    const m = new Map<string, (typeof types)[number]>();
    for (const ty of types) m.set(ty.id, ty);
    return m;
  }, [types]);
  const categoriesById = useMemo(() => {
    const m = new Map<string, (typeof categories)[number]>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);
  const rules = data.matchRules;
  // Per-rule hit counts across the whole budget view — explicit
  // budget rows AND synthesized history rows (what the rule modal
  // preview also counts). Folded into one walk so the cost is
  // O(rows + entries + rules) per render rather than O(× rules).
  // typeIdLocked rows are excluded — they don't move on reapply so
  // attributing them to a rule would mislead the chip the user sees.
  const ruleCounts = useMemo(
    () => countRuleHitsOnSheets(data.sheets, rules, data.history),
    [data.sheets, rules, data.history],
  );
  return (
    <Section title={t("settings.patterns.title")}>
      <p className="text-xs text-muted">{t("settings.patterns.intro")}</p>
      {rules.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onReapplyAll}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg hover:border-accent hover:text-accent"
            title={t("settings.patterns.reapplyAllHint")}
          >
            <RefreshCw size={12} aria-hidden focusable={false} />
            <span>{t("settings.patterns.reapplyAll")}</span>
          </button>
        </div>
      )}
      {rules.length === 0 ? (
        <p className="rounded border border-line bg-surface-2 px-3 py-3 text-center text-xs text-muted">
          {t("settings.patterns.empty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded border border-line bg-surface-2">
          {rules.map((rule, idx) => {
            const ty = rule.typeId ? typesById.get(rule.typeId) : null;
            const cat = ty ? categoriesById.get(ty.categoryId) : null;
            const hitCount = ruleCounts.get(rule.id) ?? 0;
            const amountChipText = amountMatchChipLabel(rule, settings, t);
            const canMoveUp = idx > 0;
            const canMoveDown = idx < rules.length - 1;
            return (
              <li
                key={rule.id}
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <code className="truncate font-mono text-sm text-flag">
                    {rule.pattern}
                  </code>
                  <div className="flex flex-wrap items-center gap-1.5 text-muted">
                    <span
                      className="rounded border border-line px-1.5 py-0.5"
                      title={t("settings.patterns.hitsHint")}
                    >
                      {hitCount === 1
                        ? t("settings.patterns.hitsOne")
                        : t("settings.patterns.hitsOther", { n: hitCount })}
                    </span>
                    {rule.description && (
                      <span className="truncate text-fg">
                        {rule.description}
                      </span>
                    )}
                    {ty && (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5"
                        style={{ color: ty.color }}
                      >
                        <CategoryIconGlyph
                          name={ty.glyph}
                          size={12}
                          aria-hidden
                        />
                        <span>{ty.name}</span>
                        {cat && (
                          <span className="text-muted">/ {cat.name}</span>
                        )}
                      </span>
                    )}
                    {amountChipText !== null && (
                      <span className="rounded border border-line px-1.5 py-0.5">
                        {amountChipText}
                      </span>
                    )}
                    {amountChipText === null &&
                      rule.amountSign &&
                      rule.amountSign !== "any" && (
                        <span className="rounded border border-line px-1.5 py-0.5">
                          {rule.amountSign === "positive"
                            ? t("matchRule.amountPositive")
                            : t("matchRule.amountNegative")}
                        </span>
                      )}
                    {rule.transferFilter && rule.transferFilter !== "any" && (
                      <span className="rounded border border-line px-1.5 py-0.5">
                        {rule.transferFilter === "exclude"
                          ? t("matchRule.transferExcludeFull")
                          : t("matchRule.transferOnlyFull")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMoveRule(rule.id, "up")}
                    disabled={!canMoveUp}
                    aria-label={t("settings.patterns.moveUpAria", {
                      pattern: rule.pattern,
                    })}
                    title={t("settings.patterns.moveUp")}
                    className="cursor-pointer rounded border border-line p-1.5 text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                  >
                    <ChevronUp size={14} aria-hidden focusable={false} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveRule(rule.id, "down")}
                    disabled={!canMoveDown}
                    aria-label={t("settings.patterns.moveDownAria", {
                      pattern: rule.pattern,
                    })}
                    title={t("settings.patterns.moveDown")}
                    className="cursor-pointer rounded border border-line p-1.5 text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
                  >
                    <ChevronDown size={14} aria-hidden focusable={false} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRule(rule.id)}
                    aria-label={t("settings.patterns.editAria", {
                      pattern: rule.pattern,
                    })}
                    title={t("settings.patterns.editTitle")}
                    className="cursor-pointer rounded border border-line p-1.5 text-muted hover:border-accent hover:text-accent"
                  >
                    <Pencil size={14} aria-hidden focusable={false} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// Compact label describing what amounts a rule matches. Returns
// `null` when the rule has no amount bounds — the caller then falls
// back to the existing sign chip ("Negative" / "Positive"). When
// bounds ARE present the sign chip is redundant (bounds carry the
// sign), so the caller suppresses it.
function amountMatchChipLabel(
  rule: MatchRule,
  settings: Settings,
  t: TFunction,
): string | null {
  const minDef = rule.amountMin !== undefined;
  const maxDef = rule.amountMax !== undefined;
  if (!minDef && !maxDef) return null;
  if (minDef && maxDef && rule.amountMin === rule.amountMax) {
    return t("matchRule.amountExactValue", {
      amount: formatAmount(rule.amountMin!, settings),
    });
  }
  if (minDef && maxDef) {
    return t("matchRule.amountRangeBoth", {
      min: formatAmount(rule.amountMin!, settings),
      max: formatAmount(rule.amountMax!, settings),
    });
  }
  if (minDef) {
    return t("matchRule.amountRangeMinOnly", {
      min: formatAmount(rule.amountMin!, settings),
    });
  }
  return t("matchRule.amountRangeMaxOnly", {
    max: formatAmount(rule.amountMax!, settings),
  });
}
