import { useState } from "react";
import { Database, ShieldAlert, ShieldCheck } from "lucide-react";

import { SESSION_TIMEOUT_PRESETS } from "../../../data/constants/format";
import type { Settings, UserData } from "../../../data/types";
import { type TFunction, useT } from "../../../i18n";
import type {
  BackendId,
  EncryptionMode,
} from "../../../storage/backend-preference";
import { createLogger } from "../../../utils/logger";
import { BackendPicker } from "../../BackendPicker";
import { Button, SelectPicker } from "../../form";
import { ImportExportControls } from "../../ImportExportControls";
import { DeleteAccountForm } from "../DeleteAccountForm";
import { Field, Section, ToggleRow, type Update } from "./shared";

const storageTabLog = createLogger("settings-storage");

type CloudId = "dropbox" | "gdrive";

type CloudCopy = {
  name: string;
  connectedHint: string;
  unconnectedHint: string;
};

function cloudCopy(id: CloudId, t: TFunction): CloudCopy {
  if (id === "dropbox") {
    return {
      name: t("settings.storage.backendDropbox"),
      connectedHint: t("settings.storage.backendDropboxConnected"),
      unconnectedHint: t("settings.storage.backendDropboxUnconnected"),
    };
  }
  return {
    name: t("settings.storage.backendGoogleDrive"),
    connectedHint: t("settings.storage.backendGdriveConnected"),
    unconnectedHint: t("settings.storage.backendGdriveUnconnected"),
  };
}

export function StorageTab({
  draft,
  backend,
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  folderAvailable,
  folderReconnectNeeded,
  encryption,
  isGuest,
  username,
  data,
  onImport,
  backupsSupported,
  onOpenBackups,
  getEncryptionPassword,
  onUpdate,
  onConnectDropbox,
  onDisconnectDropbox,
  onConnectGdrive,
  onDisconnectGdrive,
  onConnectFolder,
  onReconnectFolder,
  onDisconnectFolder,
  onSelectBrowser,
  onSetEncryption,
  cloudOfflineMode,
  onSetCloudOfflineMode,
  onDeleteAccount,
}: {
  draft: Settings;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  folderAvailable: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  isGuest: boolean;
  username: string;
  data: UserData;
  onImport: (data: UserData) => void;
  backupsSupported: boolean;
  onOpenBackups: () => void;
  getEncryptionPassword: () => string | null;
  onUpdate: Update;
  onConnectDropbox: () => void;
  onDisconnectDropbox: () => void;
  onConnectGdrive: () => Promise<void>;
  onDisconnectGdrive: () => void;
  onConnectFolder: () => void;
  onReconnectFolder: () => void;
  onDisconnectFolder: () => void;
  onSelectBrowser: () => void;
  onSetEncryption: (mode: EncryptionMode) => void;
  cloudOfflineMode: boolean;
  onSetCloudOfflineMode: (on: boolean) => void;
  onDeleteAccount: (password: string) => Promise<void>;
}) {
  const t = useT();
  // OAuth errors from the Google Drive popup land here. The GIS
  // script is served from accounts.google.com, so a content blocker
  // or restrictive network can reject it — silently swallowing that
  // upstream meant picking "Google Drive" looked like a no-op.
  const [gdriveConnectError, setGdriveConnectError] = useState<string | null>(
    null,
  );
  const connectGdriveWithErrorCapture = async (): Promise<void> => {
    setGdriveConnectError(null);
    try {
      await onConnectGdrive();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      storageTabLog.warn(`gdrive connect failed: ${message}`);
      setGdriveConnectError(message);
    }
  };
  return (
    <>
      <Section title={t("settings.tabs.storage")}>
        <Field label={t("settings.tabs.storage")}>
          <BackendPicker
            value={backend}
            onSelect={(next) => {
              if (next !== "gdrive") setGdriveConnectError(null);
              if (next === "browser") onSelectBrowser();
              else if (next === "folder") onConnectFolder();
              else if (next === "dropbox") onConnectDropbox();
              else void connectGdriveWithErrorCapture();
            }}
          />
          <p className="text-xs text-muted">
            {backend === "browser"
              ? t("settings.storage.browserHint")
              : backend === "folder"
                ? folderConnected
                  ? t("settings.storage.folderConnected", {
                      name: t("settings.storage.folderTitle"),
                    })
                  : folderReconnectNeeded
                    ? t("settings.storage.folderNotConnected")
                    : folderAvailable
                      ? t("settings.storage.folderNotConnected")
                      : t("settings.storage.folderUnsupported")
                : (() => {
                    const copy = cloudCopy(backend, t);
                    const connected =
                      backend === "dropbox"
                        ? dropboxConnected
                        : gdriveConnected;
                    return connected
                      ? copy.connectedHint
                      : copy.unconnectedHint;
                  })()}
          </p>
          {gdriveConnectError && (
            <p
              role="alert"
              className="rounded border border-danger/50 px-2 py-1.5 text-xs break-words text-danger"
            >
              {gdriveConnectError}
            </p>
          )}
        </Field>
        {backend === "folder" && (
          <div className="flex items-center gap-2">
            {folderConnected ? (
              <Button variant="secondary" onClick={onDisconnectFolder}>
                {t("settings.storage.disconnectFolder")}
              </Button>
            ) : folderReconnectNeeded ? (
              <Button variant="primary" onClick={onReconnectFolder}>
                {t("settings.storage.cloudReconnect")}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={onConnectFolder}
                disabled={!folderAvailable}
              >
                {t("settings.storage.pickFolder")}
              </Button>
            )}
            {folderConnected && (
              <span className="text-xs text-success">
                {t("common.connected")}
              </span>
            )}
          </div>
        )}
        {(backend === "dropbox" || backend === "gdrive") &&
          (() => {
            const cloudBackend: CloudId = backend;
            const copy = cloudCopy(cloudBackend, t);
            const connected =
              cloudBackend === "dropbox" ? dropboxConnected : gdriveConnected;
            const onConnect =
              cloudBackend === "dropbox"
                ? onConnectDropbox
                : () => void connectGdriveWithErrorCapture();
            const onDisconnect =
              cloudBackend === "dropbox"
                ? onDisconnectDropbox
                : onDisconnectGdrive;
            return (
              <div className="flex items-center gap-2">
                {connected ? (
                  <Button variant="secondary" onClick={onDisconnect}>
                    {t("settings.storage.cloudDisconnect")} {copy.name}
                  </Button>
                ) : (
                  <Button variant="primary" onClick={onConnect}>
                    {t("settings.storage.cloudConnect")} {copy.name}
                  </Button>
                )}
                {connected && (
                  <span className="text-xs text-success">
                    {t("common.connected")}
                  </span>
                )}
              </div>
            );
          })()}
        {(backend === "dropbox" || backend === "gdrive") && (
          <>
            <ToggleRow
              label={t("settings.storage.offlineModeTitle")}
              hint={t("settings.storage.offlineModeHint")}
              checked={cloudOfflineMode}
              onChange={onSetCloudOfflineMode}
            />
            <ToggleRow
              label={t("settings.storage.reauthAutoOpenTitle")}
              hint={t("settings.storage.reauthAutoOpenHint")}
              checked={draft.cloudReauthAutoOpen}
              onChange={(v) => onUpdate("cloudReauthAutoOpen", v)}
            />
          </>
        )}
        <Field label={t("settings.storage.importExport")}>
          <ImportExportControls
            data={data}
            onImport={onImport}
            encryption={encryption}
            getEncryptionPassword={getEncryptionPassword}
          />
        </Field>
        {backupsSupported && (
          <Field label={t("settings.storage.backupsTitle")}>
            <button
              type="button"
              onClick={onOpenBackups}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg hover:border-accent hover:text-accent"
            >
              <Database size={14} aria-hidden focusable={false} />
              {t("settings.storage.browseBackups")}
            </button>
            <p className="text-xs text-muted">
              {t("settings.storage.backupsHint")}
            </p>
          </Field>
        )}
      </Section>

      <Section title={t("settings.storage.encryptionTitle")}>
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 ${
              encryption === "encrypted" ? "text-success" : "text-danger"
            }`}
          >
            {encryption === "encrypted" ? (
              <ShieldCheck size={20} aria-hidden focusable={false} />
            ) : (
              <ShieldAlert size={20} aria-hidden focusable={false} />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-fg-bright">
              {encryption === "encrypted"
                ? t("auth.encryptionOn")
                : t("auth.encryptionOff")}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {t("settings.storage.encryptionHint")}
            </p>
          </div>
        </div>
        <Field label={t("settings.storage.encryptionTitle")}>
          <div className="inline-flex overflow-hidden rounded border border-line">
            {(["encrypted", "plaintext"] as EncryptionMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onSetEncryption(m)}
                aria-pressed={encryption === m}
                disabled={isGuest}
                className={`border-0 px-3 py-1.5 font-mono text-sm ${
                  isGuest ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                } ${
                  encryption === m
                    ? "bg-accent/15 text-accent"
                    : "bg-surface-2 text-fg hover:bg-surface-3"
                }`}
              >
                {m === "encrypted" ? t("common.on") : t("common.off")}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("settings.session.timeout")}>
          <SelectPicker
            value={draft.sessionTimeoutMinutes}
            options={SESSION_TIMEOUT_PRESETS.map((p) => ({
              value: p.minutes,
              label: p.label,
            }))}
            onChange={(v) => onUpdate("sessionTimeoutMinutes", v)}
            ariaLabel={t("settings.session.timeout")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm tabular-nums text-fg-bright hover:border-accent focus-visible:outline-none"
          />
          <p className="text-xs text-muted">
            {t("settings.session.timeoutHint")}
          </p>
        </Field>
      </Section>

      <Section title={t("settings.storage.dangerZoneTitle")}>
        <DeleteAccountForm
          username={username}
          isGuest={isGuest}
          onConfirm={onDeleteAccount}
        />
      </Section>
    </>
  );
}
