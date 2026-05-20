import {
  CHANGELOG,
  type ChangelogEntryType,
  type ChangelogRelease,
} from "../generated/changelog";
import { useT } from "../i18n";
import { APP_VERSION } from "../utils/build-env";
import { cmpSemver } from "../utils/semver";
import { Modal } from "./Modal";

// Mirror ChangelogPage's accent palette so a user who opens the
// settings-footer link recognises the same colouring inside this
// popup.
const TYPE_COLOR: Record<ChangelogEntryType, string> = {
  Added: "text-positive",
  Changed: "text-accent",
  Fixed: "text-success",
  Removed: "text-negative",
  Security: "text-danger",
  Deprecated: "text-muted",
};

type Props = {
  open: boolean;
  onClose: () => void;
  // Versions newer than this (exclusive) are shown. Null means we have
  // nothing to compare against — App.tsx only opens the modal when
  // `since` is a real version string strictly older than APP_VERSION,
  // so the null case here is just defensive.
  since: string | null;
};

function visibleReleases(since: string | null): ChangelogRelease[] {
  return CHANGELOG.filter((r) => {
    if (r.version === "Unreleased") return false;
    if (cmpSemver(r.version, APP_VERSION) > 0) return false;
    if (since == null) return false;
    return cmpSemver(r.version, since) > 0;
  });
}

export function ChangelogModal({ open, onClose, since }: Props) {
  const t = useT();
  const releases = visibleReleases(since);
  // App.tsx avoids opening the modal in the empty case, but the safety
  // net keeps an empty popup from rendering if the user somehow lands
  // here with nothing to show.
  if (releases.length === 0) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="changelog-modal-title"
      centered
    >
      <Modal.Header title={t("changelog.title")} onClose={onClose} />
      <Modal.Body className="flex flex-col gap-4 text-sm">
        {releases.map((release) => (
          <section key={release.version} className="flex flex-col gap-2">
            <h3 className="flex items-baseline gap-3 text-sm font-bold tracking-wide text-fg-bright">
              <span className="text-flag">v{release.version}</span>
              {release.date ? (
                <span className="text-xs font-normal text-muted">
                  {release.date}
                </span>
              ) : null}
            </h3>
            {release.sections.map((section) => (
              <div key={section.type} className="flex flex-col gap-1">
                <h4
                  className={`text-xs font-bold tracking-wide ${
                    TYPE_COLOR[section.type]
                  }`}
                >
                  {section.type}
                </h4>
                <ul className="ml-5 list-disc space-y-1">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
        <p className="mt-2 text-xs text-muted">
          {t("changelog.fullHistoryAt")}{" "}
          <a
            href="/changelog"
            target="_blank"
            rel="noreferrer"
            className="text-link hover:underline"
          >
            /changelog
          </a>
          .
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded bg-accent px-3 py-1.5 text-sm font-medium text-page-bg hover:opacity-90"
        >
          {t("changelog.gotIt")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
