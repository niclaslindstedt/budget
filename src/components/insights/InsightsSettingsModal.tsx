import { useState } from "react";
import { Settings2 } from "lucide-react";

import type {
  NetWorthEntityCategory,
  NetWorthEntityFigure,
} from "../../data/insights/networth";
import type {
  InsightsEntityOverride,
  InsightsNetWorthSettings,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatBalance, parseAmount } from "../../utils/format";
import { Button, Checkbox } from "../form";
import { Modal } from "../Modal";

// Per-entity controls for the net-worth roll-up: an include toggle and
// an ownership-share percent per account / saving / item / property /
// standalone loan. The modal edits a local draft and dispatches one
// `setInsightsNetWorthSettings` on Save — one undo step. Entity rows
// come from `computeNetWorthSnapshot(...).entities` so the modal and
// the page can never disagree about membership.
//
// Not `centered`: the share fields open the soft keyboard.

type Props = {
  open: boolean;
  entities: NetWorthEntityFigure[];
  // Whether any loan is a linked-mortgage loan (no row here — its
  // property's setting governs); surfaces the explanatory note.
  hasLinkedLoans: boolean;
  settings: Settings;
  initial: InsightsNetWorthSettings | undefined;
  onClose: () => void;
  onSave: (settings: InsightsNetWorthSettings) => void;
};

// One editable row of the draft. The share is kept as the raw input
// string so typing "12," or clearing the field doesn't fight the user;
// it parses on Save (unparsable / out-of-range collapses to 100).
type DraftRow = { included: boolean; share: string };

const SECTION_ORDER: readonly NetWorthEntityCategory[] = [
  "accounts",
  "savings",
  "items",
  "properties",
  "loans",
];

const SECTION_LABEL_KEY = {
  accounts: "insightsSheet.categoryAccounts",
  savings: "insightsSheet.categorySavings",
  items: "insightsSheet.categoryItems",
  properties: "insightsSheet.categoryProperties",
  loans: "insightsSheet.categoryLoans",
} as const;

function seedDraft(entities: NetWorthEntityFigure[]): Record<string, DraftRow> {
  const draft: Record<string, DraftRow> = {};
  for (const entity of entities) {
    draft[entity.id] = {
      included: !entity.excluded,
      share: entity.sharePct === 100 ? "" : String(entity.sharePct),
    };
  }
  return draft;
}

export function InsightsSettingsModal({
  open,
  entities,
  hasLinkedLoans,
  settings,
  initial,
  onClose,
  onSave,
}: Props) {
  const t = useT();

  const [draft, setDraft] = useState<Record<string, DraftRow>>({});
  useResetOnOpen(open, initial, () => setDraft(seedDraft(entities)));

  if (!open) return null;

  function patchRow(id: string, patch: Partial<DraftRow>) {
    setDraft((prev) => {
      const current = prev[id] ?? { included: true, share: "" };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function handleSave() {
    const overrides: Record<string, InsightsEntityOverride> = {};
    for (const [id, row] of Object.entries(draft)) {
      const override: InsightsEntityOverride = {};
      if (!row.included) override.excluded = true;
      const share = parseAmount(row.share);
      if (share !== null && share > 0 && share < 100) override.sharePct = share;
      if (Object.keys(override).length > 0) overrides[id] = override;
    }
    onSave({ overrides });
  }

  // The row's live contribution under the current draft, so toggling /
  // retyping shows its effect before Save. Mirrors the effective-value
  // math in `computeNetWorthSnapshot`.
  function draftEffective(entity: NetWorthEntityFigure): number | null {
    const row = draft[entity.id];
    if (row !== undefined && !row.included) return 0;
    if (entity.gross === null && entity.liabilityGross === undefined)
      return null;
    const parsed = row === undefined ? null : parseAmount(row.share);
    const share =
      parsed !== null && parsed > 0 && parsed < 100 ? parsed / 100 : 1;
    const gross = entity.gross ?? 0;
    const signed = entity.category === "loans" ? -gross : gross;
    return (signed - (entity.liabilityGross ?? 0)) * share;
  }

  const sections = SECTION_ORDER.map((category) => ({
    category,
    rows: entities.filter((e) => e.category === category),
  })).filter(
    (s) => s.rows.length > 0 || (s.category === "loans" && hasLinkedLoans),
  );

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="insights-settings-title"
      size="max-w-lg"
    >
      <Modal.Header
        icon={<Settings2 size={14} aria-hidden focusable={false} />}
        title={t("insightsSheet.settingsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-5">
          <p className="m-0 text-xs text-muted">
            {t("insightsSheet.settingsIntro")}
          </p>

          {sections.map(({ category, rows }) => (
            <div key={category} className="flex flex-col gap-2">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t(SECTION_LABEL_KEY[category])}
              </span>
              {rows.map((entity) => {
                const row = draft[entity.id] ?? {
                  included: !entity.excluded,
                  share: entity.sharePct === 100 ? "" : String(entity.sharePct),
                };
                const effective = draftEffective(entity);
                return (
                  <div
                    key={entity.id}
                    className="flex items-center gap-3 rounded border border-line bg-surface-2 px-2.5 py-2"
                  >
                    <Checkbox
                      checked={row.included}
                      onChange={(checked) =>
                        patchRow(entity.id, { included: checked })
                      }
                      ariaLabel={t("insightsSheet.includeAria", {
                        name: entity.name,
                      })}
                      align="center"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-fg-bright">
                        {entity.name}
                      </span>
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          effective !== null && effective < 0
                            ? "text-negative"
                            : "text-muted"
                        }`}
                      >
                        {effective === null
                          ? "—"
                          : formatBalance(effective, settings)}
                        {entity.liabilityGross !== undefined && (
                          <span className="text-muted">
                            {" · "}
                            {t("insightsSheet.propertyMortgages", {
                              amount: formatBalance(
                                -entity.liabilityGross,
                                settings,
                              ),
                            })}
                          </span>
                        )}
                      </span>
                    </span>
                    <label className="flex shrink-0 items-center gap-1">
                      <input
                        value={row.share}
                        onChange={(e) =>
                          patchRow(entity.id, { share: e.target.value })
                        }
                        inputMode="decimal"
                        placeholder="100"
                        disabled={!row.included}
                        aria-label={t("insightsSheet.shareAria", {
                          name: entity.name,
                        })}
                        className="field-input w-14 rounded border border-line bg-surface px-2 py-1 text-right text-sm text-fg disabled:opacity-50"
                      />
                      <span className="text-xs text-muted">%</span>
                    </label>
                  </div>
                );
              })}
              {category === "loans" && hasLinkedLoans && (
                <p className="m-0 text-xs text-muted">
                  {t("insightsSheet.linkedLoansNote")}
                </p>
              )}
            </div>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSave}>
          {t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
