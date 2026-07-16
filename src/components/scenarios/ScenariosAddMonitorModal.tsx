import { useState } from "react";
import { CalendarClock } from "lucide-react";

import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { Button, DateField, FormSection } from "../form";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  // Already-tracked monitor dates — a duplicate date can't be added.
  monitors: readonly string[];
  onClose: () => void;
  onAdd: (isoDate: string) => void;
};

// Add a balance-monitor date. `centered`: the only input is a native
// date picker, which never opens the soft keyboard.
export function ScenariosAddMonitorModal({
  open,
  monitors,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const [draftDate, setDraftDate] = useState("");

  useResetOnOpen(open, null, () => {
    setDraftDate("");
  });

  const canAdd =
    /^\d{4}-\d{2}-\d{2}$/.test(draftDate) && !monitors.includes(draftDate);

  function handleAdd() {
    if (!canAdd) return;
    onAdd(draftDate);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      centered
      labelledBy="scenarios-add-monitor-title"
    >
      <Modal.Header
        icon={<CalendarClock size={14} aria-hidden focusable={false} />}
        title={t("scenarios.addMonitor")}
        onClose={onClose}
      />
      <Modal.Body>
        <FormSection as="label" label={t("scenarios.monitorDateLabel")}>
          <DateField value={draftDate} onChange={setDraftDate} />
          <p className="text-xs text-muted">{t("scenarios.monitorsIntro")}</p>
        </FormSection>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleAdd} disabled={!canAdd}>
          {t("scenarios.addMonitor")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
