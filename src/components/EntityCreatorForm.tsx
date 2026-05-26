import { useEffect, useRef, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";

import { CATEGORY_COLORS } from "../data/constants";
import type { CategoryIcon } from "../data/types";
import { useT } from "../i18n";
import { ColorPalette } from "./ColorPalette";
import { Button, ClearableInput } from "./form";
import { GlyphGrid } from "./GlyphGrid";
import { Modal } from "./Modal";

export type EntityCreatorLabels = {
  name: string;
  namePlaceholder: string;
  color: string;
  glyph: string;
  create: string;
};

type Props = {
  glyphs: readonly CategoryIcon[];
  // Modal title — e.g. "New type" / "New category". The form opens as a
  // fullscreen modal on mobile and a centered card on desktop, so the
  // header sets the context the way any other top-level dialog would.
  title: string;
  // Optional title glyph forwarded to `Modal.Header`. Defaults to a `+`
  // since both call sites are "create new <thing>" affordances.
  icon?: ReactNode;
  labels: EntityCreatorLabels;
  initialColor?: string;
  initialGlyph?: CategoryIcon;
  // Rendered between the name field and the color palette. Caller
  // owns the state for these (e.g. the CategorySelector inside the
  // type creator) — the submitted draft only carries name / color /
  // glyph, so the caller folds the extra fields in from their own
  // closure inside `onSubmit`.
  extras?: ReactNode;
  // Whether the extra-field state is valid. Submit is gated on both
  // a non-empty name and `extrasValid`. Defaults to true.
  extrasValid?: boolean;
  onCancel: () => void;
  onSubmit: (draft: {
    name: string;
    color: string;
    glyph: CategoryIcon;
  }) => void;
};

// Shared modal used by `CategoryPicker`'s and `TypePicker`'s create
// affordances. Owns the name / color / glyph fields, the auto-focus +
// Enter-to-submit affordance, and the Cancel / Create footer. Callers
// stay in charge of any extra fields (e.g. the category selector
// inside the type creator) by passing them through `extras` and
// folding the chosen value into the submit handler.
//
// Renders a top-level `<Modal>` so the form escapes the picker's
// floating dropdown — a modal-inside-a-dropdown is unworkable on
// mobile and visually wrong on desktop. The modal uses the default
// fullscreen-on-mobile / centered-card-on-desktop layout because the
// name field opens the soft keyboard.
export function EntityCreatorForm({
  glyphs,
  title,
  icon,
  labels,
  initialColor = CATEGORY_COLORS[0],
  initialGlyph = "tag",
  extras,
  extrasValid = true,
  onCancel,
  onSubmit,
}: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(initialColor);
  const [glyph, setGlyph] = useState<CategoryIcon>(initialGlyph);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const canSubmit = name.trim().length > 0 && extrasValid;

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), color, glyph });
  }

  return (
    <Modal open onClose={onCancel} labelledBy="entity-creator-title">
      <Modal.Header
        icon={icon ?? <Plus size={14} aria-hidden focusable={false} />}
        title={title}
        onClose={onCancel}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            <span>{labels.name}</span>
            <ClearableInput
              ref={nameRef}
              className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
              value={name}
              onValueChange={setName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={labels.namePlaceholder}
            />
          </label>
          {extras}
          <div className="flex flex-col gap-1 text-xs text-muted">
            <span>{labels.color}</span>
            <ColorPalette
              colors={CATEGORY_COLORS}
              value={color}
              onChange={setColor}
              size={5}
            />
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted">
            <span>{labels.glyph}</span>
            <GlyphGrid
              icons={glyphs}
              value={glyph}
              onChange={setGlyph}
              tintColor={color}
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {labels.create}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
