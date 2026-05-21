import { useEffect, useRef, useState, type ReactNode } from "react";

import { CATEGORY_COLORS } from "../data/constants";
import type { CategoryIcon } from "../data/types";
import { useT } from "../i18n";
import { ColorPalette } from "./ColorPalette";
import { ClearableTextInput } from "./form";
import { GlyphGrid } from "./GlyphGrid";

export type EntityCreatorLabels = {
  name: string;
  namePlaceholder: string;
  color: string;
  glyph: string;
  create: string;
};

type Props = {
  glyphs: readonly CategoryIcon[];
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

// Shared form used by `CategoryPicker`'s inline category creator and
// `TypePicker`'s inline type creator. Owns the name / color / glyph
// fields, the auto-focus + Enter-to-submit affordance, and the
// Cancel / Create footer. Callers stay in charge of any extra fields
// (e.g. the category selector inside the type creator) by passing
// them through `extras` and folding the chosen value into the submit
// handler.
export function EntityCreatorForm({
  glyphs,
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
    <div className="flex flex-col gap-2 p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        <span>{labels.name}</span>
        <ClearableTextInput
          ref={nameRef}
          className="field-input w-full min-w-0 rounded border border-line bg-surface px-2 py-1 text-sm text-fg"
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
      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-2 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.create}
        </button>
      </div>
    </div>
  );
}
