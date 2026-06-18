import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Tag as TagIcon, X } from "lucide-react";

import { CATEGORY_COLORS } from "../data/constants/taxonomy";
import type { Tag } from "../data/types";
import {
  useDesktopAutoFocus,
  useRovingTabindex,
  type FloatingPlacement,
} from "../hooks";
import { useT } from "../i18n";
import { ColorPalette } from "./ColorPalette";
import { FloatingPanel } from "./FloatingPanel";
import { Button, ClearableInput } from "./form";
import { Modal } from "./Modal";

// Multi-select picker for `Tag`. Unlike `CompanyPicker` / `TypePicker`
// (single selection that dismisses on pick), a row can carry several
// tags, so picking toggles membership and leaves the panel open. The
// trigger renders the chosen tags as small coloured chips; a "New tag"
// footer opens a focused creator with a name input + colour palette,
// mirroring the category creator. Tags never render on the sheet — this
// picker only appears inside the entry edit / bulk-edit modals.

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  tags: readonly Tag[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  onCreate: (draft: Omit<Tag, "id">) => Tag;
  placeholder?: string;
};

export function TagsPicker({
  tags,
  selectedIds,
  onChange,
  onCreate,
  placeholder,
}: Props) {
  const t = useT();
  const placeholderText = placeholder ?? t("tag.pickTagsEllipsis");

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...tags].sort((a, b) => a.name.localeCompare(b.name)),
    [tags],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedTags = useMemo(
    () => sorted.filter((tag) => selectedSet.has(tag.id)),
    [sorted, selectedSet],
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

  // Toggle membership without closing — multi-select means the user
  // usually picks more than one before dismissing the panel.
  const handleToggle = useCallback(
    (id: string) => {
      if (selectedSet.has(id)) onChange(selectedIds.filter((x) => x !== id));
      else onChange([...selectedIds, id]);
    },
    [selectedSet, selectedIds, onChange],
  );

  const handleClear = useCallback(() => {
    onChange([]);
    close();
  }, [onChange, close]);

  const beginCreating = useCallback(() => {
    setOpen(false);
    setCreating(true);
  }, []);

  const { isCursorAt, registerItem, onKeyDown } = useRovingTabindex({
    itemCount: sorted.length,
    initialIndex: 0,
    active: open && !creating,
    typeaheadLabels: sorted.map((tag) => tag.name),
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
        {selectedTags.length > 0 ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1">
            {selectedTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">{tag.name}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-muted">
            <TagIcon size={14} aria-hidden focusable={false} />
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
        <ul
          role="listbox"
          aria-multiselectable
          className="max-h-72 overflow-auto py-1"
        >
          {sorted.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">
              {t("tag.noTagsYet")}
            </li>
          )}
          {sorted.map((tag, idx) => {
            const checked = selectedSet.has(tag.id);
            return (
              <li key={tag.id}>
                <button
                  ref={registerItem(idx)}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  tabIndex={isCursorAt(idx) ? 0 : -1}
                  onClick={() => handleToggle(tag.id)}
                  onKeyDown={onKeyDown}
                  className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-sm hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{tag.name}</span>
                  {checked && (
                    <Check
                      size={14}
                      className="ml-auto text-accent"
                      aria-hidden
                      focusable={false}
                    />
                  )}
                </button>
              </li>
            );
          })}
          {selectedTags.length > 0 && (
            <li>
              <button
                type="button"
                onClick={handleClear}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left text-xs text-muted hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <X size={12} aria-hidden focusable={false} />
                {t("tag.clearTags")}
              </button>
            </li>
          )}
          <li className="mt-1 border-t border-line">
            <button
              type="button"
              onClick={beginCreating}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Plus size={14} aria-hidden focusable={false} />
              {t("tag.newTag")}
            </button>
          </li>
        </ul>
      </FloatingPanel>
      {creating && (
        <TagCreator
          existing={tags}
          onCancel={close}
          onSubmit={(draft) => {
            const created = onCreate(draft);
            onChange([...selectedIds, created.id]);
            close();
          }}
        />
      )}
    </div>
  );
}

// Focused creator modal — a text input plus a colour palette. Matches
// the shape of the category creator minus the glyph picker.
function TagCreator({
  existing,
  onCancel,
  onSubmit,
}: {
  existing: readonly Tag[];
  onCancel: () => void;
  onSubmit: (draft: Omit<Tag, "id">) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(inputRef, true);
  const trimmed = name.trim();
  const duplicate = existing.some(
    (tag) => tag.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canSubmit = trimmed.length > 0 && !duplicate;

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="tag-creator-title"
      size="max-w-sm"
      centered
    >
      <Modal.Header
        icon={<TagIcon size={14} aria-hidden focusable={false} />}
        title={t("tag.newTag")}
        onClose={onCancel}
      />
      <Modal.Body>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t("tag.name")}</span>
          <ClearableInput
            ref={inputRef}
            value={name}
            onValueChange={setName}
            placeholder={t("tag.namePlaceholder")}
            className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
          {duplicate && (
            <span className="text-xs text-danger">
              {t("tag.duplicateName")}
            </span>
          )}
        </label>
        <div className="mt-3 flex flex-col gap-1">
          <span className="text-xs text-muted">{t("tag.color")}</span>
          <ColorPalette
            colors={CATEGORY_COLORS}
            value={color}
            onChange={setColor}
            size={5}
            ariaLabelPrefix={t("tag.color")}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            if (!canSubmit) return;
            onSubmit({ name: trimmed, color });
          }}
          disabled={!canSubmit}
        >
          {t("tag.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
