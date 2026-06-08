import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FolderClosed, Plus, X } from "lucide-react";

import type { FileCategory } from "../../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";
import {
  Button,
  ClearableInput,
  LISTBOX_CREATE_OPTION_CLASS,
  LISTBOX_OPTION_CLASS,
} from "../form";
import { Modal } from "../Modal";

// Single-tier picker for `FileCategory` — the subfolder an uploaded property
// file is filed under (no category ⇒ the `files/` root). Categories are
// name-only, so the dropdown is a flat sorted list with a "New category"
// footer that opens a focused name creator. Mirrors `SubtypePicker` minus the
// parent-type scaffolding (a file category has no parent).

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  categories: readonly FileCategory[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (name: string) => FileCategory;
  placeholder?: string;
};

export function FileCategoryPicker({
  categories,
  selectedId,
  onSelect,
  onCreate,
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("properties.fileCategoryNone");

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const selected = useMemo(
    () => categories.find((c) => c.id === selectedId) ?? null,
    [categories, selectedId],
  );

  const close = useCallback(() => {
    setOpen(false);
    setCreating(false);
  }, []);

  const handleOpen = useCallback(() => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
  }, [open, close]);

  const handlePick = useCallback(
    (id: string | null) => {
      onSelect(id);
      close();
    },
    [onSelect, close],
  );

  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  const initialIdx = Math.max(
    0,
    sorted.findIndex((c) => c.id === selectedId),
  );
  const { isCursorAt, registerItem, onKeyDown } = useRovingTabindex({
    itemCount: sorted.length,
    initialIndex: initialIdx,
    active: open && !creating,
  });

  return (
    <div ref={rootRef} className="relative inline-block w-full">
      <button
        type="button"
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm hover:border-accent focus-visible:outline-none"
        onClick={handleOpen}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="inline-flex min-w-0 items-center gap-2 text-fg">
            <FolderClosed size={14} aria-hidden focusable={false} />
            <span className="min-w-0 truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <FolderClosed size={14} aria-hidden focusable={false} />
            <span>{placeholderText}</span>
          </span>
        )}
        <ChevronDown
          size={12}
          className="ml-auto shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>

      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
      >
        <ul role="listbox" className="max-h-72 overflow-auto py-1">
          <li>
            <button
              type="button"
              onClick={() => handlePick(null)}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <X size={14} aria-hidden focusable={false} className="shrink-0" />
              <span className="min-w-0 truncate">
                {t("properties.fileCategoryNone")}
              </span>
              {selectedId === null && (
                <Check
                  size={14}
                  className="ml-auto text-accent"
                  aria-hidden
                  focusable={false}
                />
              )}
            </button>
          </li>
          {sorted.map((c, idx) => (
            <li key={c.id}>
              <button
                ref={registerItem(idx)}
                type="button"
                role="option"
                aria-selected={c.id === selectedId}
                tabIndex={isCursorAt(idx) ? 0 : -1}
                onClick={() => handlePick(c.id)}
                onKeyDown={onKeyDown}
                className={LISTBOX_OPTION_CLASS}
              >
                <FolderClosed
                  size={14}
                  aria-hidden
                  focusable={false}
                  className="shrink-0 text-muted"
                />
                <span className="min-w-0 truncate">{c.name}</span>
                {c.id === selectedId && (
                  <Check
                    size={14}
                    className="ml-auto text-accent"
                    aria-hidden
                    focusable={false}
                  />
                )}
              </button>
            </li>
          ))}
          <li className="mt-1 border-t border-line">
            <button
              type="button"
              onClick={beginCreating}
              className={LISTBOX_CREATE_OPTION_CLASS}
            >
              <Plus size={14} aria-hidden focusable={false} />
              {t("properties.newFileCategory")}
            </button>
          </li>
        </ul>
      </FloatingPanel>
      {creating && (
        <FileCategoryCreator
          existing={categories}
          onCancel={close}
          onSubmit={(name) => {
            const created = onCreate(name);
            onSelect(created.id);
            close();
          }}
        />
      )}
    </div>
  );
}

// Focused creator modal — a single name input, OK / Cancel. Category names are
// unique (case-insensitive) so two files never resolve to the same subfolder
// under different ids.
function FileCategoryCreator({
  existing,
  onCancel,
  onSubmit,
}: {
  existing: readonly FileCategory[];
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="file-category-creator-title"
      size="max-w-sm"
      centered
    >
      <Modal.Header
        icon={<FolderClosed size={14} aria-hidden focusable={false} />}
        title={t("properties.newFileCategory")}
        onClose={onCancel}
      />
      <Modal.Body>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">
            {t("properties.fileCategoryName")}
          </span>
          <ClearableInput
            ref={inputRef}
            value={name}
            onValueChange={setName}
            placeholder={t("properties.fileCategoryNamePlaceholder")}
            className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
          {duplicate && (
            <span className="text-xs text-danger">
              {t("properties.fileCategoryDuplicate")}
            </span>
          )}
        </label>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!canSubmit) return;
            onSubmit(trimmed);
          }}
          disabled={!canSubmit}
        >
          {t("common.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
