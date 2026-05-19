import { useCallback, useEffect, useState } from "react";
import { Database, Download, History, RotateCcw, Upload } from "lucide-react";

import type { UserData } from "../data/types";
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
        message: `Could not load backups: ${(err as Error).message}`,
      });
    }
  }, [ops]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  async function handleBackup() {
    if (!ops) return;
    const filename = suggestBackupFilename();
    const metadata = describeBackup(data, { filename });
    setStatus({ kind: "working", message: "Creating backup…" });
    try {
      await ops.create(serializeUserData(data), metadata);
      setStatus({ kind: "ok", message: `Backup saved as ${filename}.` });
      await refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: `Backup failed: ${(err as Error).message}`,
      });
    }
  }

  async function handleRestore(entry: BackupMetadata) {
    if (!ops) return;
    setRestorePrompt(null);
    setStatus({ kind: "working", message: "Backing up current file…" });
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
      setStatus({ kind: "working", message: "Restoring…" });
      const text = await ops.read(entry.filename);
      const parsed = parseUserData(text);
      if (!parsed.ok) {
        setStatus({
          kind: "error",
          message: `Could not parse backup: ${parsed.error}`,
        });
        return;
      }
      onRestore(parsed.data);
      setStatus({
        kind: "ok",
        message: `Restored ${entry.filename}. Previous file saved as ${autoName}.`,
      });
      await refresh();
    } catch (err) {
      setStatus({
        kind: "error",
        message: `Restore failed: ${(err as Error).message}`,
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
      >
        <Modal.Header
          title={
            <span className="inline-flex items-center gap-2">
              <Database size={16} aria-hidden focusable={false} />
              Backups
            </span>
          }
          onClose={busy ? () => {} : onClose}
        />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-muted">
                Timestamped snapshots written into the {labelFor(adapter.id)}{" "}
                backups folder. Restoring a backup saves your current file as a
                safety net first.
              </p>
              <button
                type="button"
                onClick={() => void handleBackup()}
                disabled={busy}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload size={14} aria-hidden focusable={false} />
                Back up now
              </button>
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
                  ? "Loading backups…"
                  : status.kind === "working"
                    ? status.message
                    : status.kind === "ok"
                      ? status.message
                      : status.message}
              </p>
            )}

            {entries.length === 0 && status.kind !== "loading" ? (
              <p className="rounded border border-line bg-surface-2 px-3 py-6 text-center text-xs text-muted">
                No backups yet. Press &quot;Back up now&quot; to create one.
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
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </Modal.Footer>
      </Modal>
      <ConfirmDialog
        open={restorePrompt !== null}
        title="Restore from backup?"
        description={
          restorePrompt ? (
            <p>
              The current budget will be replaced with{" "}
              <span className="font-mono text-path">
                {restorePrompt.filename}
              </span>
              . Your current file will be saved as an auto-backup first.
            </p>
          ) : null
        }
        actions={[
          {
            label: "Restore",
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
  return (
    <li className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-path">{entry.filename}</span>
          {entry.autoCreated && (
            <span
              title="Created automatically before a restore"
              className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[10px] text-muted"
            >
              <History size={10} aria-hidden focusable={false} />
              auto
            </span>
          )}
          {entry.encrypted && (
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">
              encrypted
            </span>
          )}
        </div>
        <span className="text-xs text-muted">
          {formatTimestamp(entry.createdAt)} ·{" "}
          {countLabel(entry.accountCount, "account")} ·{" "}
          {countLabel(entry.entryCount, "entry", "entries")}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled}
          aria-label={`Download ${entry.filename}`}
          title="Download"
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
          Restore
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

function countLabel(n: number, singular: string, plural?: string): string {
  const word = n === 1 ? singular : (plural ?? `${singular}s`);
  return `${n} ${word}`;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function labelFor(id: StorageAdapter["id"]): string {
  if (id === "dropbox") return "Dropbox";
  if (id === "gdrive") return "Google Drive";
  if (id === "folder") return "folder";
  return "";
}
