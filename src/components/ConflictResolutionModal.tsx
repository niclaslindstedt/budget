import { CloudAlert, CloudDownload, CloudUpload } from "lucide-react";

import type { UserData } from "../data/types";
import { useT } from "../i18n";
import { Button } from "./form";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  providerName: string;
  // Bytes this device has been editing (offline or in-tab). Used to
  // show entry / account counts so the user can tell the copies
  // apart at a glance.
  local: UserData;
  // Bytes currently on the cloud — typically pushed by another
  // device while this one was offline.
  remote: UserData;
  // "Replace remote with local." Resolves the conflict by pushing
  // local through the existing save path with the remote revision
  // as the new baseRev.
  onKeepLocal: () => void;
  // "Replace local with remote." Drops local edits and adopts the
  // remote bytes as the new in-memory state.
  onKeepRemote: () => void;
};

function summarise(data: UserData): { sheets: number; entries: number } {
  let entries = 0;
  for (const sheet of data.sheets ?? []) {
    for (const item of sheet.items ?? []) {
      if (item.type === "accountBudget") {
        entries += item.rows?.length ?? 0;
      }
    }
  }
  return { sheets: data.sheets?.length ?? 0, entries };
}

// Opens when `useUserDataStorage` surfaces a divergence between this
// device's local mirror and the cloud (`status.kind === "conflict"`).
// The two devices' copies are summarised side by side so the user
// can pick which one wins — there is no auto-merge, the data model
// has too much referential plumbing (account ids, category ids,
// recurring series, match rules) for a generic three-way merge to
// be safe.
//
// "Keep mine" pushes the in-memory bytes with the remote revision
// as baseRev so the cloud accepts the overwrite. "Keep the other"
// swaps in-memory state for the remote bytes and silences the next
// auto-save so we don't immediately push it back.
export function ConflictResolutionModal({
  open,
  providerName,
  local,
  remote,
  onKeepLocal,
  onKeepRemote,
}: Props) {
  const t = useT();
  const localStats = summarise(local);
  const remoteStats = summarise(remote);

  return (
    <Modal
      open={open}
      onClose={() => {
        // The modal is intentionally non-dismissable from the
        // backdrop — the user has to pick a side because the cloud
        // and local copies can't coexist. Pressing Escape or
        // tapping outside is a no-op.
      }}
      labelledBy="conflict-resolution-title"
      size="max-w-md"
      scrollableBody={false}
      centered
    >
      <header
        className="flex shrink-0 items-center border-b border-line bg-surface-3 px-4 py-3"
        style={{
          paddingTop: `calc(0.75rem + env(safe-area-inset-top))`,
        }}
      >
        <h2
          id="conflict-resolution-title"
          className="text-sm font-bold tracking-wide text-fg-bright"
        >
          {t("sync.conflictTitle", { name: providerName })}
        </h2>
      </header>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-start gap-2 rounded border border-pipe/50 px-2 py-1.5">
          <CloudAlert
            size={16}
            aria-hidden
            focusable={false}
            className="mt-0.5 shrink-0 text-pipe"
          />
          <p className="text-sm text-fg">
            {t("sync.conflictHint", { name: providerName })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-line bg-surface-2 px-2 py-2">
            <div className="text-xs font-bold text-fg-bright">
              {t("sync.conflictLocalLabel")}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("sync.conflictSheetsEntries", {
                sheets: localStats.sheets,
                entries: localStats.entries,
              })}
            </div>
          </div>
          <div className="rounded border border-line bg-surface-2 px-2 py-2">
            <div className="text-xs font-bold text-fg-bright">
              {t("sync.conflictRemoteLabel", { name: providerName })}
            </div>
            <div className="mt-1 text-xs text-muted">
              {t("sync.conflictSheetsEntries", {
                sheets: remoteStats.sheets,
                entries: remoteStats.entries,
              })}
            </div>
          </div>
        </div>
      </div>
      <Modal.Footer>
        <Button variant="secondary" withIcon onClick={onKeepRemote}>
          <CloudDownload size={14} aria-hidden focusable={false} />
          {t("sync.keepRemote")}
        </Button>
        <Button variant="primary" withIcon onClick={onKeepLocal}>
          <CloudUpload size={14} aria-hidden focusable={false} />
          {t("sync.keepLocal")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
