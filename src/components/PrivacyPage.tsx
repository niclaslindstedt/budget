import { ArrowLeft } from "lucide-react";

// Last meaningful change to the policy text below. Bump this whenever
// the wording is edited — the value renders verbatim at the top of
// the page and is the only line readers have to look at to see how
// fresh the policy is.
const LAST_UPDATED = "2026-05-18";

export function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-page-bg px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-fg">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href={import.meta.env.BASE_URL}
            className="inline-flex items-center gap-1.5 self-start text-xs text-link hover:underline"
          >
            <ArrowLeft size={14} aria-hidden focusable={false} />
            Back to budget
          </a>
          <h1 className="text-lg font-bold text-fg-bright">Privacy policy</h1>
          <p className="text-xs text-muted">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="Summary">
          <p>
            <span className="text-meta">budget</span> is a local-first budget
            app served as a static site at{" "}
            <span className="text-path">budget.niclaslindstedt.se</span>. It has
            no backend, no user accounts on a server, no sync service, and no
            analytics SDK in the bundle. Your budget lives in your
            browser&apos;s storage on your device. If you point it at a folder
            on your disk, or connect a cloud storage backend (Dropbox or Google
            Drive), a copy of the same bytes also lives there. We never receive
            your data.
          </p>
        </Section>

        <Section title="What the app stores">
          <p>
            All persistent state is kept inside your browser&apos;s
            <code className="mx-1 text-meta">localStorage</code> for the origin{" "}
            <span className="text-path">budget.niclaslindstedt.se</span>:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Account usernames and password hashes (PBKDF2; the password itself
              is never stored).
            </li>
            <li>
              Your budget data (rows, sheets, categories, settings). By default
              this is encrypted at rest with a key derived from your account
              password using AES-GCM. You may opt out of encryption per device
              in settings; with encryption off, the budget is stored as
              plaintext JSON inside{" "}
              <code className="text-meta">localStorage</code> (and inside your
              cloud folder, if a cloud backend is connected).
            </li>
            <li>Per-device preferences such as your chosen storage backend.</li>
          </ul>
          <p>
            None of this leaves your device unless you choose to export it (the{" "}
            Export button writes a JSON file you save yourself) or connect a
            third-party backend such as Dropbox or Google Drive (described
            below).
          </p>
        </Section>

        <Section title="Local folder (optional)">
          <p>
            If you choose the Local-folder backend, the app asks your browser
            for permission to write into a directory you pick on your own
            device. Inside that directory it maintains a single file named{" "}
            <code className="text-meta">budget.json</code> — the same bytes it
            would otherwise write to{" "}
            <code className="mx-1 text-meta">localStorage</code>, encrypted by
            default, plaintext if you opted out of encryption.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="text-fg-bright">Where the bytes go.</strong>{" "}
              Nowhere off-device. Your browser is the only thing reading or
              writing the file; the project authors do not run any server that
              observes your traffic.
            </li>
            <li>
              <strong className="text-fg-bright">Browser support.</strong> This
              backend uses the File System Access API and currently works in
              Chrome, Edge, and other Chromium-based browsers. Firefox and
              Safari users see the option disabled.
            </li>
            <li>
              <strong className="text-fg-bright">Cross-device sync.</strong> Not
              built in. If you point this backend at a folder that is itself
              synced by another tool (Dropbox-mounted directory, iCloud Drive,
              Syncthing, …), edits on one device will sync to others through
              that tool — that&apos;s your call, and outside the app&apos;s
              control.
            </li>
            <li>
              <strong className="text-fg-bright">Revoking access.</strong>{" "}
              Disconnect from Settings → Storage to clear the saved folder
              handle, or revoke File System permission from your browser&apos;s
              site settings.
            </li>
          </ul>
        </Section>

        <Section title="Dropbox integration (optional)">
          <p>
            If you choose Dropbox as your storage backend, the app opens
            Dropbox&apos;s OAuth consent screen in your browser. You sign in to
            Dropbox directly — your credentials never pass through this app.
            After you grant consent, the app receives an access token that is
            stored in your browser&apos;s{" "}
            <code className="text-meta">localStorage</code> only.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="text-fg-bright">Scope.</strong> The app
              requests the <em>App folder</em> scope, which restricts it to a
              single folder named{" "}
              <span className="text-path">Apps/budget.niclaslindstedt.se/</span>{" "}
              inside your Dropbox. The app cannot read or write anything outside
              that folder.
            </li>
            <li>
              <strong className="text-fg-bright">What is uploaded.</strong> A
              single file named <code className="text-meta">budget.json</code>{" "}
              containing the same bytes the app would otherwise write to
              <code className="mx-1 text-meta">localStorage</code> — encrypted
              by default, plaintext if you opted out of encryption.
            </li>
            <li>
              <strong className="text-fg-bright">Who can see the bytes.</strong>{" "}
              Only you and Dropbox. The project authors do not run any server
              that observes your traffic.
            </li>
            <li>
              <strong className="text-fg-bright">Revoking access.</strong> You
              can disconnect the app at any time from{" "}
              <a
                href="https://www.dropbox.com/account/connected_apps"
                className="text-link hover:underline"
              >
                dropbox.com/account/connected_apps
              </a>
              . Deleting the file from your Dropbox app folder also deletes the
              only remote copy.
            </li>
          </ul>
          <p>
            Dropbox&apos;s own handling of the bytes is governed by{" "}
            <a
              href="https://www.dropbox.com/privacy"
              className="text-link hover:underline"
            >
              Dropbox&apos;s privacy policy
            </a>
            .
          </p>
        </Section>

        <Section title="Google Drive integration (optional)">
          <p>
            If you choose Google Drive as your storage backend, the app opens
            Google&apos;s OAuth consent screen in your browser. You sign in to
            Google directly — your credentials never pass through this app.
            After you grant consent, the app receives an access token that is
            stored in your browser&apos;s{" "}
            <code className="text-meta">localStorage</code> only.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="text-fg-bright">Scope.</strong> The app
              requests the <code className="text-meta">drive.file</code> scope,
              which restricts it to files this app itself creates inside your
              Drive. The app cannot read or write anything else in your Drive.
            </li>
            <li>
              <strong className="text-fg-bright">What is uploaded.</strong> A
              single file named <code className="text-meta">budget.json</code>{" "}
              inside a <code className="text-meta">budget/</code> folder at the
              root of your My Drive, containing the same bytes the app would
              otherwise write to{" "}
              <code className="mx-1 text-meta">localStorage</code> — encrypted
              by default, plaintext if you opted out of encryption.
            </li>
            <li>
              <strong className="text-fg-bright">Token lifetime.</strong> The
              access token is short-lived (about one hour). When it expires,
              syncing pauses with an error and you reconnect from Settings. The
              app does not request an offline / refresh token.
            </li>
            <li>
              <strong className="text-fg-bright">Who can see the bytes.</strong>{" "}
              Only you and Google. The project authors do not run any server
              that observes your traffic.
            </li>
            <li>
              <strong className="text-fg-bright">Revoking access.</strong> You
              can revoke this app&apos;s access at any time from{" "}
              <a
                href="https://myaccount.google.com/permissions"
                className="text-link hover:underline"
              >
                myaccount.google.com/permissions
              </a>
              . Deleting the file from your Drive also deletes the only remote
              copy.
            </li>
          </ul>
          <p>
            Google&apos;s own handling of the bytes is governed by{" "}
            <a
              href="https://policies.google.com/privacy"
              className="text-link hover:underline"
            >
              Google&apos;s privacy policy
            </a>
            .
          </p>
        </Section>

        <Section title="Cookies">
          <p>
            The app sets no cookies. All persistence uses{" "}
            <code className="text-meta">localStorage</code> and{" "}
            <code className="text-meta">sessionStorage</code>.
          </p>
        </Section>

        <Section title="Web analytics">
          <p>
            The deployed site is registered with{" "}
            <strong className="text-fg-bright">Google Search Console</strong> so
            the site owner can see aggregated, anonymised statistics about which
            Google search queries lead visitors to the site. Search Console does
            not add any tracking script to the page; the data is collected by
            Google as part of its search platform and made available to the site
            owner in aggregate. Google&apos;s handling of that data is governed
            by{" "}
            <a
              href="https://policies.google.com/privacy"
              className="text-link hover:underline"
            >
              Google&apos;s privacy policy
            </a>
            .
          </p>
          <p>
            A privacy-friendly traffic counter (for example{" "}
            <a
              href="https://www.goatcounter.com/"
              className="text-link hover:underline"
            >
              GoatCounter
            </a>
            ) may be added in the future to count page views. If it is, it will
            be cookie-less, will not collect personally identifying information,
            will not track users across sites, and will store only
            hashed/anonymised IP addresses for short-term deduplication. No
            third-party advertising or behavioural analytics services are used.
          </p>
        </Section>

        <Section title="Server logs">
          <p>
            The static bundle is served by{" "}
            <strong className="text-fg-bright">GitHub Pages</strong>. GitHub may
            collect standard request metadata (IP address, user agent, request
            path) for operating the service. This is covered by{" "}
            <a
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              className="text-link hover:underline"
            >
              GitHub&apos;s privacy statement
            </a>
            . The project authors do not run an additional logging service.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The app is a general-purpose budgeting tool and is not directed at
            children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            Material changes are tracked in the public commit history of the
            source repository. The <em>Last updated</em> date at the top of this
            page reflects the most recent edit.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For security reports, see{" "}
            <a
              href="https://github.com/niclaslindstedt/budget/security/advisories/new"
              className="text-link hover:underline"
            >
              GitHub Security Advisories
            </a>
            . For everything else, open an issue at{" "}
            <a
              href="https://github.com/niclaslindstedt/budget/issues"
              className="text-link hover:underline"
            >
              github.com/niclaslindstedt/budget
            </a>
            .
          </p>
        </Section>
      </article>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-fg-bright">
        {title}
      </h2>
      {children}
    </section>
  );
}
