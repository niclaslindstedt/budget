import { useCallback, useEffect, useState } from "react";
import { Database, Download, History, RotateCcw, Upload } from "lucide-react";

import type { UserData } from "../data/types";
import { type TFunction, useT } from "../i18n";
import { Button } from "./form";
import { parseUserData, serializeUserData } from "../storage/file";
import type { BackupMetadata, StorageAdapter } from "../storage/adapter";
import {
  describeBackup,
  suggestBackupFilename,
} from "../storage/backup-metadata";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./Modal";

type Props = {
  open: boolean;
  // The adapter the active backend is using right now. The modal
  // reads its `backups` ops directly so the bytes-on-disk match
  // whatever encryption the user has configured — the encrypting
  // wrapper transparently handles the encrypt/decrypt round trip.
  adapter: StorageAdapter;
  data: UserData;
  // Replaces the in-memory budget with the data extracted from a
  // backup. Wired to the same reducer path as the JSON-file import
  // flow, so the next auto-save persists the restored snapshot in
  // place of the previous live file.
  onRestore: (data: UserData) => void;
  onClose: () => void;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "working"; message: string }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function CloudBackupModal({
  open,
  adapter,
  data,
  onRestore,
  onClose,
}: Props) {
  const t = useT();
  const [entries, setEntries] = useState<BackupMetadata[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [restorePrompt, setRestorePrompt] = useState<BackupMetadata | null>(
    null,
  );

  const ops = adapter.backups;

  const refresh = useCallback(async () => {
    if (!ops) return;
    setStatus({ kind: "loading" });
    try {
      const list = await ops.list();
      setEntries(list);
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: t("cloudBackup.couldNotLoad", {
          error: (err as Error).message,
        }),
      });
    }
  }, [ops, t]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  async function handleBackup() {
    if (!ops) return;
    const filename = suggestBackupFilename();
    const metadata = describeBackup(data, { filename });
    setStatus({ kind: "working", message: t("cloudBackup.creatingBackup") });
    try {
      await ops.create(serializeUserData(data), metadata);
      setStatus({
        kind: "ok",
        message: t("cloudBackup.backupSavedAs", { filename }),
      });
      await refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: t("cloudBackup.backupFailed", {
          error: (err as Error).message,
        }),
      });
    }
  }

  async function handleRestore(entry: BackupMetadata) {
    if (!ops) return;
    setRestorePrompt(null);
    setStatus({ kind: "working", message: t("cloudBackup.backingUpCurrent") });
    try {
      // Safety net: snapshot whatever the user has right now before
      // we overwrite it. The auto-flag distinguishes these from
      // user-initiated backups in the list.
      const autoName = suggestBackupFilename(new Date(), {
        autoCreated: true,
      });
      await ops.create(
        serializeUserData(data),
        describeBackup(data, { filename: autoName, autoCreated: true }),
      );
      setStatus({ kind: "working", message: t("cloudBackup.restoring") });
      const text = await ops.read(entry.filename);
      const parsed = parseUserData(text);
      if (!parsed.ok) {
        setStatus({
          kind: "error",
          message: t("cloudBackup.couldNotParse", { error: parsed.error }),
        });
        return;
      }
      onRestore(parsed.data);
      setStatus({
        kind: "ok",
        message: parsed.migrated
          ? t("cloudBackup.restoredMigrated", {
              filename: entry.filename,
              auto: autoName,
            })
          : t("cloudBackup.restored", {
              filename: entry.filename,
              auto: autoName,
            }),
      });
      await refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: t("cloudBackup.restoreFailed", {
          error: (err as Error).message,
        }),
      });
    }
  }

  const busy = status.kind === "working" || status.kind === "loading";

  return (
    <>
      <Modal
        open={open}
        onClose={busy ? () => {} : onClose}
        labelledBy="cloud-backup-title"
        centered
      >
        <Modal.Header
          icon={<Database size={14} aria-hidden focusable={false} />}
          title={t("cloudBackup.title")}
          onClose={busy ? () => {} : onClose}
        />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <p className="text-xs text-muted">
                {t("cloudBackup.introHint", {
                  name: labelFor(adapter.id, t),
                })}
              </p>
              <Button
                variant="primary"
                withIcon
                onClick={() => void handleBackup()}
                disabled={busy}
                className="shrink-0 justify-center self-start"
              >
                <Upload size={14} aria-hidden focusable={false} />
                {t("cloudBackup.backUpNow")}
              </Button>
            </div>

            {status.kind !== "idle" && (
              <p
                role="status"
                className={
                  status.kind === "error"
                    ? "text-xs text-danger"
                    : "text-xs text-muted"
                }
              >
                {status.kind === "loading"
                  ? t("cloudBackup.loadingBackups")
                  : status.kind === "working"
                    ? status.message
                    : status.kind === "ok"
                      ? status.message
                      : status.message}
              </p>
            )}

            {entries.length === 0 && status.kind !== "loading" ? (
              <p className="rounded border border-line bg-surface-2 px-3 py-6 text-center text-xs text-muted">
                {t("cloudBackup.none")}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {entries.map((entry) => (
                  <BackupRow
                    key={entry.filename}
                    entry={entry}
                    disabled={busy}
                    onRestore={() => setRestorePrompt(entry)}
                    onDownload={() => void handleDownload(ops, entry)}
                  />
                ))}
              </ul>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal>
      <ConfirmDialog
        open={restorePrompt !== null}
        title={t("cloudBackup.restoreTitle")}
        description={
          restorePrompt ? (
            <p>
              {t("cloudBackup.restoreHint")}{" "}
              <span className="font-mono text-path">
                {restorePrompt.filename}
              </span>
            </p>
          ) : null
        }
        actions={[
          {
            label: t("cloudBackup.restore"),
            tone: "danger",
            onSelect: () => restorePrompt && void handleRestore(restorePrompt),
          },
        ]}
        onCancel={() => setRestorePrompt(null)}
      />
    </>
  );
}

function BackupRow({
  entry,
  disabled,
  onRestore,
  onDownload,
}: {
  entry: BackupMetadata;
  disabled: boolean;
  onRestore: () => void;
  onDownload: () => void;
}) {
  const t = useT();
  return (
    <li className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-path">{entry.filename}</span>
          {entry.autoCreated && (
            <span
              title={t("cloudBackup.autoCreated")}
              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted"
            >
              <History size={10} aria-hidden focusable={false} />
              {t("cloudBackup.autoBadge")}
            </span>
          )}
          {entry.encrypted && (
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
              {t("cloudBackup.encryptedBadge")}
            </span>
          )}
        </div>
        <span className="text-xs text-muted">
          {formatTimestamp(entry.createdAt)} ·{" "}
          {entry.accountCount === 1
            ? t("cloudBackup.accountOne", { n: entry.accountCount })
            : t("cloudBackup.accountOther", { n: entry.accountCount })}{" "}
          ·{" "}
          {entry.entryCount === 1
            ? t("cloudBackup.entryOne", { n: entry.entryCount })
            : t("cloudBackup.entryOther", { n: entry.entryCount })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          aria-label={t("cloudBackup.downloadAria", {
            filename: entry.filename,
          })}
          title={t("cloudBackup.download")}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-line bg-transparent text-muted hover:border-link hover:text-link disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={14} aria-hidden focusable={false} />
        </button>
        <button
          type="button"
          onClick={onRestore}
          disabled={disabled}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-2.5 py-1 text-xs text-fg hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw size={12} aria-hidden focusable={false} />
          {t("cloudBackup.restore")}
        </button>
      </div>
    </li>
  );
}

async function handleDownload(
  ops: StorageAdapter["backups"],
  entry: BackupMetadata,
) {
  if (!ops) return;
  const text = await ops.read(entry.filename);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = entry.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function labelFor(id: StorageAdapter["id"], t: TFunction): string {
  if (id === "dropbox") return t("backend.dropbox");
  if (id === "gdrive") return t("backend.googleDrive");
  if (id === "folder") return t("cloudBackup.providerFolder");
  return "";
}
