import type { Settings } from "../data/types";
import { useLang } from "../i18n";
import { formatBalance, formatShortDate } from "../utils/format";

type Props = {
  legend: string;
  description: string;
  // Date + amount render on a meta line above the description. Omitted
  // when the caller only knows the text (e.g. an inline cell editor).
  figures?: { date: string; amount: number; settings: Settings };
  className?: string;
};

// Read-only card showing the bank transaction an editor is acting on.
// Shared by the history-entry editors and the company creator so the
// user can still see which transaction they are labelling once a
// nested modal covers the editor.
export function EntrySummary({
  legend,
  description,
  figures,
  className = "",
}: Props) {
  const lang = useLang();
  return (
    <fieldset
      className={`flex flex-col gap-1.5 rounded border border-line bg-surface-3 p-3 ${className}`}
    >
      <legend className="px-1 text-xs text-muted">{legend}</legend>
      {figures && (
        <div className="flex flex-wrap items-baseline gap-2 text-xs">
          <span className="font-mono text-muted">
            {formatShortDate(
              figures.date,
              figures.settings.shortDateFormat,
              lang,
            )}
          </span>
          <span
            className={`font-mono tabular-nums ${
              figures.amount < 0 ? "text-negative" : "text-positive"
            }`}
          >
            {formatBalance(figures.amount, figures.settings)}
          </span>
        </div>
      )}
      <p className="font-mono text-sm break-words whitespace-pre-wrap text-fg">
        {description || "—"}
      </p>
    </fieldset>
  );
}
