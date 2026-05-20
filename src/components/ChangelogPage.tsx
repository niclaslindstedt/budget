import { ArrowLeft } from "lucide-react";

import { CHANGELOG, type ChangelogEntryType } from "../generated/changelog";
import { useT } from "../i18n";

// One Dark / One Light section accent per Keep-a-Changelog kind. Kept
// in step with the popup modal so visual identity carries across.
const TYPE_COLOR: Record<ChangelogEntryType, string> = {
  Added: "text-positive",
  Changed: "text-accent",
  Fixed: "text-success",
  Removed: "text-negative",
  Security: "text-danger",
  Deprecated: "text-muted",
};

export function ChangelogPage() {
  const t = useT();
  return (
    <div className="min-h-dvh bg-page-bg px-4 py-10 text-fg">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href="/"
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeft size={14} aria-hidden focusable={false} />
            {t("changelog.backToBudget")}
          </a>
          <h1 className="text-lg font-bold text-fg-bright">
            {t("changelog.pageTitleHeading")}
          </h1>
          <p className="text-xs text-muted">{t("changelog.pageIntro")}</p>
        </header>

        {CHANGELOG.length === 0 ? (
          <p className="text-muted">{t("changelog.noReleasesYet")}</p>
        ) : (
          CHANGELOG.map((release) => (
            <section key={release.version} className="flex flex-col gap-3">
              <h2 className="flex items-baseline gap-3 text-sm font-bold tracking-wide text-fg-bright">
                <span className="text-flag">v{release.version}</span>
                {release.date ? (
                  <span className="text-xs font-normal text-muted">
                    {release.date}
                  </span>
                ) : null}
              </h2>
              {release.sections.map((section) => (
                <div key={section.type} className="flex flex-col gap-1">
                  <h3
                    className={`text-xs font-bold tracking-wide ${
                      TYPE_COLOR[section.type]
                    }`}
                  >
                    {section.type}
                  </h3>
                  <ul className="ml-5 list-disc space-y-1">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))
        )}
      </article>
    </div>
  );
}
