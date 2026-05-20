import { useCallback, useEffect, useRef, useState } from "react";

import { useDesktopAutoFocus } from "../hooks";
import { useLang, useT } from "../i18n";
import type {
  Category,
  EntryType,
  HistoryEntry,
  Settings,
} from "../data/types";
import { formatBalance, formatShortDate } from "../utils/format";
import { Modal } from "./Modal";
import { TypePicker } from "./TypePicker";

// Per-entry edit modal opened by the pen button on a synthesized
// history row. Edits the `userDescription` and `userTypeId` overrides
// on a single `HistoryEntry` — those wins out over `MatchRule` and
// `MerchantHint` in `synthesizeHistoryRow`. The original bank
// description is rendered read-only at the top of the body so the
// user can see what the statement actually said while typing the
// override. Date / amount / completed are bank-authoritative and not
// editable here; relabelling every entry that shares a description
// goes through the wildcard rule modal (the tags button) instead.

type Props = {
  open: boolean;
  entry: HistoryEntry | null;
  categories: readonly Category[];
  types: readonly EntryType[];
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  onClose: () => void;
  onSubmit: (patch: {
    userDescription: string;
    userTypeId: string | null;
  }) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

export function HistoryEntryEditModal({
  open,
  entry,
  categories,
  types,
  typeUsageById,
  settings,
  onClose,
  onSubmit,
  onCreateType,
}: Props) {
  const t = useT();
  const lang = useLang();

  const initialDescription = entry?.userDescription ?? entry?.description ?? "";
  const initialTypeId = entry?.userTypeId ?? null;

  const [description, setDescription] = useState(initialDescription);
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open && !!entry, entry?.id);

  useEffect(() => {
    if (!open) return;
    setDescription(initialDescription);
    setTypeId(initialTypeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const handleSubmit = useCallback(() => {
    if (!entry) return;
    // Empty (after trim) clears the override — the reducer normalises
    // to absent so the synthesized row falls back to the rule / hint /
    // raw bank text the next render.
    onSubmit({
      userDescription: description.trim(),
      userTypeId: typeId,
    });
  }, [entry, description, typeId, onSubmit]);

  if (!open || !entry) return null;

  return (
    <Modal
      open={open && !!entry}
      onClose={onClose}
      labelledBy="edit-history-title"
      size="max-w-2xl"
    >
      <Modal.Header title={t("editHistory.title")} onClose={onClose} />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("editHistory.hint")}</p>
        <fieldset className="mb-4 flex flex-col gap-1.5 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">
            {t("editHistory.originalDescription")}
          </legend>
          <div className="flex flex-wrap items-baseline gap-2 text-xs">
            <span className="font-mono text-muted">
              {formatShortDate(entry.date, settings.shortDateFormat, lang)}
            </span>
            <span
              className={`font-mono tabular-nums ${
                entry.amount < 0 ? "text-negative" : "text-positive"
              }`}
            >
              {formatBalance(entry.amount, settings)}
            </span>
          </div>
          <p className="font-mono text-sm break-words whitespace-pre-wrap text-fg">
            {entry.description || "—"}
          </p>
        </fieldset>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("editHistory.description")}
            </span>
            <input
              ref={descriptionRef}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("editHistory.descriptionPlaceholder")}
              className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("editHistory.type")}</span>
            <TypePicker
              variant="field"
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              usageById={typeUsageById}
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
        >
          {t("common.save")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
