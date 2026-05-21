import { ConfirmDialog } from "./ConfirmDialog";
import type { Snapshot } from "../storage/adapter";
import type { BackendId } from "../storage/backend-preference";
import type { DropboxAuthResult } from "../storage/dropbox-adapter";
import { useT } from "../i18n";

// In-flight cloud-link awaiting the user's confirmation. OAuth has
// completed (so we hold valid tokens) and the target cloud and the
// active source backend have both been probed — `remoteSnapshot` is
// the cloud's existing file (or `null` when the cloud is empty), and
// `sourceText` is the bytes currently on the source side (or `null`
// when the source has nothing yet). The dialog uses the
// presence / absence of each side to decide what to ask; resolving
// uploads `sourceText` to the cloud (threading
// `remoteSnapshot.revision` so the write lands as an update rather
// than a colliding `add`) when the user picks "use this device's
// budget", and otherwise just flips the backend.
export type PendingCloudLink =
  | {
      provider: "dropbox";
      auth: DropboxAuthResult;
      // The backend the user is linking *from*, used to phrase the
      // dialog ("this device" vs. "your current Dropbox" etc.).
      fromBackend: BackendId;
      remoteSnapshot: Snapshot | null;
      sourceText: string | null;
    }
  | {
      provider: "gdrive";
      accessToken: string;
      fromBackend: BackendId;
      remoteSnapshot: Snapshot | null;
      sourceText: string | null;
    };

// In-flight folder-link awaiting the user's confirmation. Same shape
// as `PendingCloudLink` but gesture-driven rather than OAuth-driven —
// the handle is already granted by the time we get here. Kept
// separate from `PendingCloudLink` so the dialog wording and the
// commit path stay specific to each flow (OAuth tokens vs. a directory
// handle, "your Dropbox" vs. "the folder you picked").
export type PendingFolderLink = {
  handle: FileSystemDirectoryHandle;
  fromBackend: BackendId;
  remoteSnapshot: Snapshot | null;
  sourceText: string | null;
};

// Confirmation dialog after the user picks a directory. Mirrors
// `CloudLinkDialog`'s variant matrix but specialized to the folder
// flow: no provider branch since there's only one, no "your Dropbox"
// vs. "your Google Drive" wording, and the action labels reference
// "the folder" rather than a provider name.
export function FolderLinkDialog({
  pending,
  onResolve,
  onCancel,
}: {
  pending: PendingFolderLink | null;
  onResolve: (action: "use-cloud" | "use-source") => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!pending) return null;
  const sourcePossessive =
    pending.fromBackend === "browser"
      ? t("cloudLink.sourceBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.sourceFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.sourceDropbox")
          : t("cloudLink.sourceGdrive");
  const untouched =
    pending.fromBackend === "browser"
      ? t("cloudLink.untouchedBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.untouchedFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.untouchedDropbox")
          : t("cloudLink.untouchedGdrive");
  // The only variant that surfaces here is "both sides have data" —
  // the connect handler short-circuits the other three cases
  // (commits straight away when one side is empty).
  return (
    <ConfirmDialog
      open
      title={t("cloudLink.folderAlreadyHas")}
      description={
        <>
          <p>{t("cloudLink.folderBothBody")}</p>
          <p className="mt-2 text-xs text-muted">
            {t("cloudLink.eitherWayKept", { untouched })}
          </p>
        </>
      }
      actions={[
        {
          label: t("cloudLink.useTheFolderVersion"),
          onSelect: () => onResolve("use-cloud"),
        },
        {
          label: t("cloudLink.replaceFolderWith", { source: sourcePossessive }),
          tone: "danger",
          onSelect: () => onResolve("use-source"),
        },
      ]}
      onCancel={onCancel}
    />
  );
}

// Surfaces the finished cloud link to the user. Always shows after a
// successful OAuth round-trip, so the switch is never silent — even
// the no-decision cases ("both sides empty, just confirm") get an
// explicit "Done" so the user knows the backend has flipped. When
// there is a choice to make — the source has data, the target has
// data, or both — the buttons spell out which side wins and which
// gets replaced. Wording shifts between "this device" and the source
// cloud name so a user migrating from one cloud backend to another
// sees an accurate prompt.
export function CloudLinkDialog({
  pending,
  onResolve,
  onCancel,
}: {
  pending: PendingCloudLink | null;
  onResolve: (action: "use-cloud" | "use-source") => void;
  onCancel: () => void;
}) {
  const t = useT();
  if (!pending) return null;
  const targetName =
    pending.provider === "dropbox" ? "Dropbox" : "Google Drive";
  const sourcePossessive =
    pending.fromBackend === "browser"
      ? t("cloudLink.sourceBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.sourceLocalFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.sourceDropbox")
          : t("cloudLink.sourceGdrive");
  const untouched =
    pending.fromBackend === "browser"
      ? t("cloudLink.untouchedBrowser")
      : pending.fromBackend === "folder"
        ? t("cloudLink.untouchedLocalFolder")
        : pending.fromBackend === "dropbox"
          ? t("cloudLink.untouchedDropbox")
          : t("cloudLink.untouchedGdrive");
  const hasSource = pending.sourceText !== null;
  const hasRemote = pending.remoteSnapshot !== null;

  // The dialog body shifts based on which sides hold a budget. Four
  // shapes total — kept inline so the variant matrix is visible at a
  // glance rather than scattered across helpers.
  if (hasSource && hasRemote) {
    return (
      <ConfirmDialog
        open
        title={t("cloudLink.cloudAlreadyHas", { name: targetName })}
        description={
          <>
            <p>{t("cloudLink.cloudBothBody", { name: targetName })}</p>
            <p className="mt-2 text-xs text-muted">
              {t("cloudLink.eitherWayKept", { untouched })}
            </p>
          </>
        }
        actions={[
          {
            label: t("cloudLink.useTheCloudVersion", { name: targetName }),
            onSelect: () => onResolve("use-cloud"),
          },
          {
            label: t("cloudLink.replaceCloudWith", {
              name: targetName,
              source: sourcePossessive,
            }),
            tone: "danger",
            onSelect: () => onResolve("use-source"),
          },
        ]}
        onCancel={onCancel}
      />
    );
  }
  if (hasSource && !hasRemote) {
    return (
      <ConfirmDialog
        open
        title={t("cloudLink.linkingCloud", { name: targetName })}
        description={
          <>
            <p>
              {t("cloudLink.emptyCloudBody", {
                name: targetName,
                source: sourcePossessive,
              })}
            </p>
            <p className="mt-2 text-xs text-muted">
              {t("cloudLink.untouchedKeptShort", { untouched })}
            </p>
          </>
        }
        actions={[
          {
            label: t("cloudLink.bringSourceOver", {
              source: sourcePossessive,
              name: targetName,
            }),
            onSelect: () => onResolve("use-source"),
          },
          {
            label: t("cloudLink.startFreshOn", { name: targetName }),
            onSelect: () => onResolve("use-cloud"),
          },
        ]}
        onCancel={onCancel}
      />
    );
  }
  if (!hasSource && hasRemote) {
    return (
      <ConfirmDialog
        open
        title={t("cloudLink.useExistingCloud", { name: targetName })}
        description={
          <p>{t("cloudLink.useExistingCloudBody", { name: targetName })}</p>
        }
        actions={[
          {
            label: t("cloudLink.switchTo", { name: targetName }),
            onSelect: () => onResolve("use-cloud"),
          },
        ]}
        onCancel={onCancel}
      />
    );
  }
  return (
    <ConfirmDialog
      open
      title={t("cloudLink.cloudLinked", { name: targetName })}
      description={
        <p>{t("cloudLink.cloudLinkedBody", { name: targetName })}</p>
      }
      actions={[
        {
          label: t("cloudLink.switchTo", { name: targetName }),
          onSelect: () => onResolve("use-cloud"),
        },
      ]}
      onCancel={onCancel}
    />
  );
}
