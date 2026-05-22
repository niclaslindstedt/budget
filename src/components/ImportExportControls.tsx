import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, EyeOff, Lock, Upload } from "lucide-react";

import type { UserData } from "../data/types";
import { useDesktopAutoFocus } from "../hooks";
import { useT } from "../i18n";
import type { EncryptionMode } from "../storage/backend-preference";
import { Button } from "./form";
import { Modal } from "./Modal";
import {
  decryptEnvelope,
  encryptText,
  isEncryptedEnvelope,
} from "../storage/crypto";
import {
  FILE_MIME_TYPE,
  parseUserData,
  serializeUserData,
  suggestFilename,
} from "../storage/file";

type Props = {
  data: UserData;
  onImport: (data: UserData) => void;
  // Whether the active backend wraps bytes in the encryption envelope.
  // Exports follow the same mode so the file on disk matches what
  // sits in storage — re-importing an encrypted export surfaces the
  // password prompt, a plaintext export imports straight in.
  encryption: EncryptionMode;
  // Returns the active account password so encrypted exports can be
  // wrapped in the same envelope the storage adapter uses.
  getEncryptionPassword: () => string | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const iconButton =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-line bg-transparent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg";

export function ImportExportControls({
  data,
  onImport,
  encryption,
  getEncryptionPassword,
}: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pendingEnvelope, setPendingEnvelope] = useState<string | null>(null);

  async function handleExport() {
    const plaintext = serializeUserData(data);
    let body: string;
    let filename: string;
    if (encryption === "encrypted") {
      const password = getEncryptionPassword();
      if (!password) {
        setStatus({
          kind: "error",
          message: t("importExport.noPasswordInMemory"),
        });
        return;
      }
      try {
        body = await encryptText(plaintext, password);
      } catch (err) {
        setStatus({
          kind: "error",
          message: t("importExport.encryptionFailed", {
            error: (err as Error).message,
          }),
        });
        return;
      }
      filename = suggestFilename().replace(/\.json$/, ".enc.json");
    } else {
      body = plaintext;
      filename = suggestFilename();
    }
    const blob = new Blob([body], { type: FILE_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus({
      kind: "ok",
      message:
        encryption === "encrypted"
          ? t("importExport.exportedEncrypted")
          : t("importExport.exported"),
    });
  }

  function finishImport(text: string) {
    const result = parseUserData(text);
    if (!result.ok) {
      setStatus({
        kind: "error",
        message: t("importExport.importFailedWith", { error: result.error }),
      });
      return;
    }
    onImport(result.data);
    const sheetCount = result.data.sheets.length;
    const suffix = result.migrated ? t("importExport.migratedSuffix") : "";
    const baseMessage =
      sheetCount === 1
        ? t("importExport.importedSheets", { n: sheetCount })
        : t("importExport.importedSheetsPlural", { n: sheetCount });
    setStatus({
      kind: "ok",
      message: baseMessage.replace(/\.$/, "") + suffix + ".",
    });
  }

  async function handleFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      setStatus({
        kind: "error",
        message: t("importExport.couldNotReadFile", {
          error: (err as Error).message,
        }),
      });
      return;
    }
    if (isEncryptedEnvelope(text)) {
      // Defer the parse until the user supplies a password — the
      // prompt below picks up `pendingEnvelope`.
      setPendingEnvelope(text);
      setStatus({ kind: "idle" });
      return;
    }
    finishImport(text);
  }

  const handleDecrypt = useCallback(
    async (password: string) => {
      if (!pendingEnvelope) return;
      const plain = await decryptEnvelope(pendingEnvelope, password);
      setPendingEnvelope(null);
      finishImport(plain);
    },
    // finishImport closes over data/onImport which are stable enough
    // here; we intentionally don't list every transitive dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingEnvelope],
  );

  return (
    <div className="inline-flex items-center gap-2">
      {status.kind !== "idle" && (
        <span
          role="status"
          className={
            status.kind === "error"
              ? "text-xs text-danger"
              : "text-xs text-muted"
          }
        >
          {status.message}
        </span>
      )}
      <button
        type="button"
        className={`${iconButton} text-link hover:border-link hover:text-link`}
        onClick={() => inputRef.current?.click()}
        aria-label={t("importExport.importAria")}
        title={t("importExport.importLabel")}
      >
        <Download size={18} aria-hidden focusable={false} />
      </button>
      <button
        type="button"
        className={`${iconButton} text-accent hover:border-accent hover:text-accent`}
        onClick={() => {
          void handleExport();
        }}
        aria-label={
          encryption === "encrypted"
            ? t("importExport.exportEncryptedAria")
            : t("importExport.exportAria")
        }
        title={
          encryption === "encrypted"
            ? t("importExport.exportEncryptedLabel")
            : t("importExport.exportLabel")
        }
      >
        <Upload size={18} aria-hidden focusable={false} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      <ImportPasswordPrompt
        open={pendingEnvelope !== null}
        onCancel={() => setPendingEnvelope(null)}
        onSubmit={handleDecrypt}
      />
    </div>
  );
}

function ImportPasswordPrompt({
  open,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  onCancel: () => void;
  onSubmit: (password: string) => Promise<void>;
}) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(passwordRef, open);

  useEffect(() => {
    if (!open) return;
    setPassword("");
    setShow(false);
    setBusy(false);
    setError(null);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="import-pwd-title"
      size="max-w-sm"
      scrollableBody={false}
    >
      <Modal.Header
        icon={<Lock size={14} aria-hidden focusable={false} />}
        title={t("importExport.encryptedBudget")}
        onClose={onCancel}
      />
      <form
        id="budget-import-decrypt"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 px-4 pt-2 pb-4"
      >
        <p className="text-xs text-muted">
          {t("importExport.encryptedBudgetHint")}
        </p>

        <input
          type="text"
          name="username"
          autoComplete="username"
          value="budget"
          readOnly
          hidden
          aria-hidden="true"
        />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t("auth.password")}</span>
          <div className="relative flex items-center">
            <input
              id="budget-import-password"
              name="current-password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              ref={passwordRef}
              className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 pr-9 text-sm text-fg"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={
                show ? t("auth.hidePassword") : t("auth.showPassword")
              }
              className="absolute right-1 inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-3 hover:text-fg"
            >
              {show ? (
                <EyeOff size={16} aria-hidden focusable={false} />
              ) : (
                <Eye size={16} aria-hidden focusable={false} />
              )}
            </button>
          </div>
        </label>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="mt-1 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || password.length === 0}
          >
            {busy
              ? t("importExport.decrypting")
              : t("importExport.decryptAndImport")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
