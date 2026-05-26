import type { Widen } from "./_widen";

const glyph = {
  pick: "Pick an icon",
  none: "No icon",
  chooseGlyph: "Choose glyph",
  glyphDialog: "Glyph",
  defaultRecurring: "Default (recurring)",
  defaultPrefix: "Default ({name})",
  defaultRecurringGlyphLabel: "Default recurring glyph",
  defaultGlyphLabel: "Default {name} glyph",
} as const;

export type GlyphCatalog = Widen<typeof glyph>;

export default glyph;
