import { GitCompareArrows, Minus, Plus } from "lucide-react";

import type { ScenarioDiffEntry } from "../../data/scenarios/apply";
import type { Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  scenarioName: string;
  entries: ScenarioDiffEntry[];
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
  settings,
  onClose,
}: Props) {
  const t = useT();
  const lang = useLang();

  const amount = (n: number) => formatBalance(n, settings);
  const date = (iso: string) =>
    iso === "" ? "" : formatDate(iso, settings.dateFormat, lang);

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
                      {entry.description}
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
                      {entry.newDescription !== undefined ? (
                        <>
                          <span className="text-muted line-through">
                            {entry.description}
                          </span>{" "}
                          {entry.newDescription}
                        </>
                      ) : (
                        entry.description
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
                      {entry.amount !== undefined ? (
                        <>
                          <span className="text-muted line-through">
                            {amount(entry.baseAmount)}
                          </span>
                          <span aria-hidden className="text-muted">
                            →
                          </span>
                          <span className="text-accent">
                            {amount(entry.amount)}
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-bright">
                          {amount(entry.baseAmount)}
                        </span>
                      )}
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
