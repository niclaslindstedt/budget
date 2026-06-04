import { useDevMode, useDevSeed } from "../../../hooks";
import { useT } from "../../../i18n";
import { Section, ToggleRow } from "./shared";

export function DeveloperTab() {
  const t = useT();
  const { captureLogs, setCaptureLogs } = useDevMode();
  const { active: fakeData, setActive: setFakeData } = useDevSeed();
  return (
    <Section title={t("settings.developer.title")}>
      <p className="text-xs text-muted">{t("settings.developer.intro")}</p>
      <ToggleRow
        label={t("settings.developer.captureLogs")}
        hint={t("settings.developer.captureLogsHint")}
        checked={captureLogs}
        onChange={setCaptureLogs}
      />
      <ToggleRow
        label={t("settings.developer.fakeData")}
        hint={t("settings.developer.fakeDataHint")}
        checked={fakeData}
        onChange={setFakeData}
      />
    </Section>
  );
}
