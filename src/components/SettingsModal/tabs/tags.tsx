import type { Tag, UserData } from "../../../data/types";
import { useT } from "../../../i18n";
import { TagsAdmin } from "../TagsAdmin";
import { Section } from "./shared";

export function TagsTab({
  data,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
}: {
  data: UserData;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onUpdateTag: (tagId: string, patch: Partial<Omit<Tag, "id">>) => void;
  onDeleteTag: (tagId: string) => void;
}) {
  const t = useT();
  return (
    <Section title={t("settings.tagsTab.title")}>
      <TagsAdmin
        tags={data.tags}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
      />
    </Section>
  );
}
