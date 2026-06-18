import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpen, Sparkles } from "lucide-react";

import {
  CHANGELOG,
  type ChangelogEntryType,
  type ChangelogRelease,
} from "../generated/changelog";
import { FEATURE_DOCS } from "../generated/feature-docs";
import { useT } from "../i18n";
import { APP_VERSION } from "../utils/build-env";
import { cmpSemver } from "../utils/semver";
import { Markdown } from "./Markdown";
import { Modal } from "./Modal";

// One Dark / One Light section accent per Keep-a-Changelog kind.
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
  // When a version string, the modal opens in "what's new" mode and
  // only lists releases strictly newer than this. When null, opens
  // in "full history" mode (no filter) — the manual open path from
  // the header menu uses this.
  since: string | null;
  // Called the first time a feature doc is opened in a given modal
  // session. The host wires this to the "read a feature doc" achievement.
  onOpenFeatureDoc?: (slug: string) => void;
};

function allShippedReleases(): ChangelogRelease[] {
  return CHANGELOG.filter((r) => {
    if (r.version === "Unreleased") return false;
    if (cmpSemver(r.version, APP_VERSION) > 0) return false;
    return true;
  });
}

function newerThan(since: string): ChangelogRelease[] {
  return allShippedReleases().filter((r) => cmpSemver(r.version, since) > 0);
}

export function ChangelogModal({
  open,
  onClose,
  since,
  onOpenFeatureDoc,
}: Props) {
  const t = useT();
  const [showAll, setShowAll] = useState(since == null);
  // When set, the modal shows that feature doc in place of the changelog
  // list; the header grows a back button that clears it. A slug with no
  // matching bundled doc falls through to the changelog view.
  const [docSlug, setDocSlug] = useState<string | null>(null);
  // The feature-doc view reuses the same scrolling `Modal.Body` element
  // as the changelog list (React reconciles the two `<Modal>` branches),
  // so its `scrollTop` carries over. Without managing it, following a
  // "Learn more" link after scrolling the list — or jumping doc→doc —
  // drops the reader into the middle of the doc. We pin the same ref on
  // both branches and, whenever the active slug changes, scroll a freshly
  // opened doc to the top while restoring the list to exactly where the
  // reader left it when Back returns to it.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const listScrollTop = useRef(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = docSlug ? 0 : listScrollTop.current;
  }, [docSlug]);

  // Reset the expand + drill-down state whenever the modal reopens so a
  // later auto-open after an upgrade starts in compact "what's new" mode
  // again instead of inheriting the previous manual session.
  useEffect(() => {
    if (open) {
      setShowAll(since == null);
      setDocSlug(null);
      listScrollTop.current = 0;
    }
  }, [open, since]);

  const openFeature = (slug: string) => {
    if (!FEATURE_DOCS[slug]) return;
    onOpenFeatureDoc?.(slug);
    // Remember the list's scroll position so Back can restore it. Guard on
    // the list being visible so a nested "Learn more" jump (doc→doc) keeps
    // the original list offset instead of overwriting it with the doc's.
    if (!docSlug && bodyRef.current) {
      listScrollTop.current = bodyRef.current.scrollTop;
    }
    setDocSlug(slug);
  };

  // App.tsx avoids triggering the auto-open in the empty case, but
  // the header-menu path always opens — render the empty state then
  // instead of nothing.
  if (!open) return null;

  const activeDoc = docSlug ? FEATURE_DOCS[docSlug] : undefined;
  if (activeDoc) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        labelledBy="changelog-modal-title"
        size="max-w-2xl"
      >
        <Modal.Header
          icon={<BookOpen size={14} aria-hidden focusable={false} />}
          title={activeDoc.title}
          onBack={() => setDocSlug(null)}
          onClose={onClose}
        />
        <Modal.Body className="text-sm" scrollRef={bodyRef}>
          <Markdown source={activeDoc.body} onOpenFeature={openFeature} />
        </Modal.Body>
        <Modal.Footer>
          <button
            type="button"
            onClick={() => setDocSlug(null)}
            className="cursor-pointer rounded bg-accent px-3 py-1.5 text-sm font-medium text-page-bg hover:opacity-90"
          >
            {t("common.back")}
          </button>
        </Modal.Footer>
      </Modal>
    );
  }

  const compactMode = since != null && !showAll;
  const releases = compactMode ? newerThan(since) : allShippedReleases();
  const title = compactMode
    ? t("changelog.title")
    : t("changelog.pageTitleHeading");

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="changelog-modal-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Sparkles size={14} aria-hidden focusable={false} />}
        title={title}
        onClose={onClose}
      />
      <Modal.Body className="flex flex-col gap-4 text-sm" scrollRef={bodyRef}>
        {releases.length === 0 ? (
          <p className="text-muted">{t("changelog.noReleasesYet")}</p>
        ) : (
          releases.map((release) => (
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
                      <li key={i}>
                        <Markdown
                          source={item}
                          onOpenFeature={openFeature}
                          className="gap-1"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
        {compactMode && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="mt-2 self-start cursor-pointer text-xs text-link hover:underline"
          >
            {t("changelog.showAll")}
          </button>
        )}
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
