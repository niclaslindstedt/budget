import { useRef, useState } from "react";
import { Compass } from "lucide-react";

import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { Button, ClearableInput, FormSection } from "../form";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  // Null ⇒ creating a new scenario; a string is the current name being
  // renamed. The parent decides what Save dispatches.
  initialName: string | null;
  onClose: () => void;
  onSave: (name: string) => void;
};

// Create / rename a scenario. Not `centered`: the name field opens the
// soft keyboard.
export function ScenarioEditModal({
  open,
  initialName,
  onClose,
  onSave,
}: Props) {
  const t = useT();
  const isEdit = initialName !== null;
  const [name, setName] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(nameRef, open);

  useResetOnOpen(open, initialName, () => {
    setName(initialName ?? "");
  });

  const trimmed = name.trim();
  const canSave = trimmed !== "";

  function handleSave() {
    if (!canSave) return;
    onSave(trimmed);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="scenario-edit-modal-title">
      <Modal.Header
        icon={<Compass size={14} aria-hidden focusable={false} />}
        title={
          isEdit ? t("scenarios.renameScenario") : t("scenarios.addScenario")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <FormSection as="label" label={t("scenarios.scenarioName")}>
          <ClearableInput
            value={name}
            onValueChange={setName}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                handleSave();
              }
            }}
            wrapperClassName="w-full min-w-0"
            className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            ref={nameRef}
          />
        </FormSection>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!canSave}>
          {isEdit ? t("common.save") : t("common.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
