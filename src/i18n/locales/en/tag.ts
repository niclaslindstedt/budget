import type { Widen } from "./_widen";

const tag = {
  pickTags: "Pick tags",
  pickTagsEllipsis: "Pick tags…",
  newTag: "New tag",
  noTagsYet: "No tags yet.",
  clearTags: "Clear tags",
  name: "Name",
  namePlaceholder: "Vacation 2026",
  color: "Color",
  create: "Create",
  duplicateName: "A tag with this name already exists.",
} as const;

export type TagCatalog = Widen<typeof tag>;

export default tag;
