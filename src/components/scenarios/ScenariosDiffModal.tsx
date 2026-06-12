import { GitCompareArrows, Minus, Plus } from "lucide-react";

import type { ScenarioDiffEntry } from "../../data/scenarios/apply";
import type { Company, EntryType, Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import { formatBalance, formatDate } from "../../utils/format";
import { Modal } from "../Modal";
import { formatModulation } from "./modulation";

type Props = {
  open: boolean;
  scenarioName: string;
  entries: ScenarioDiffEntry[];
  // Taxonomy lookups for the company / type-name fallback on rows
  // without a user-authored description — same chain the month tables
  // render.
  typesById: ReadonlyMap<string, EntryType>;
  companiesById: ReadonlyMap<string, Company>;
  settings: Settings;
  onClose: () => void;
};

// The active scenario's changes vs the baseline, rendered like a diff:
// overridden rows as old → new, excluded rows struck through with a
// minus marker, added rows with a plus marker. Read-only with no text
// inputs ⇒ `centered`.
export function ScenariosDiffModal({
  open,
  scenarioName,
  entries,
  typesById,
  companiesById,
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();

  const amount = (n: number) => formatBalance(n, settings);
  const date = (iso: string) =>
    iso === "" ? "" : formatDate(iso, settings.dateFormat, lang);
  // The row's display name: its description, else the company it is
  // associated with, else its type — the same fallback priority as the
  // budget and scenario tables.
  const displayName = (entry: {
    description: string;
    typeId?: string;
    companyId?: string;
  }) => {
    if (entry.description !== "") return entry.description;
    const company =
      entry.companyId !== undefined
        ? companiesById.get(entry.companyId)
        : undefined;
    if (company) return company.name;
    const type =
      entry.typeId !== undefined ? typesById.get(entry.typeId) : undefined;
    return type ? displayTypeName(type, t) : "";
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="scenarios-diff-modal-title"
      centered
    >
      <Modal.Header
        icon={<GitCompareArrows size={14} aria-hidden focusable={false} />}
        title={t("scenarios.diffTitle", { name: scenarioName })}
        onClose={onClose}
      />
      <Modal.Body>
        {entries.length === 0 ? (
          <p className="m-0 px-1 py-4 text-center text-sm text-muted">
            {t("scenarios.diffEmpty")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {entries.map((entry, i) => (
              <li
                key={
                  entry.kind === "added"
                    ? `added-${entry.row.id}`
                    : `${entry.kind}-${entry.rowId}`
                }
                className={`flex items-center gap-2 px-1 py-2 text-sm ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                {entry.kind === "added" ? (
                  <>
                    <Plus
                      size={14}
                      className="shrink-0 text-positive"
                      aria-hidden
                      focusable={false}
                    />
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">
                      {date(entry.row.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg-bright">
                      {entry.row.description}
                    </span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] tracking-wider uppercase text-positive">
                      {t("scenarios.diffAddedBadge")}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-fg-bright">
                      {amount(entry.row.amount)}
                    </span>
                  </>
                ) : entry.kind === "excluded" ? (
                  <>
                    <Minus
                      size={14}
                      className="shrink-0 text-negative"
                      aria-hidden
                      focusable={false}
                    />
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">
                      {date(entry.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-muted line-through">
                      {displayName(entry)}
                    </span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] tracking-wider uppercase text-negative">
                      {t("scenarios.diffExcludedBadge")}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-muted line-through">
                      {amount(entry.baseAmount)}
                    </span>
                  </>
                ) : (
                  <>
                    <span aria-hidden className="w-[14px] shrink-0" />
                    <span className="w-20 shrink-0 font-mono text-xs text-muted">
                      {date(entry.date)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-fg-bright">
                      {displayName(entry)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
                      <span className="text-muted line-through">
                        {amount(entry.baseAmount)}
                      </span>
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                      {entry.modulation !== undefined && (
                        <span className="text-xs text-meta">
                          {formatModulation(entry.modulation, settings)}
                        </span>
                      )}
                      <span className="text-accent">
                        {amount(entry.amount)}
                      </span>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal.Body>
    </Modal>
  );
}
