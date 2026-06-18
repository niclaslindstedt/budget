import {
  ArrowRight,
  Cloud,
  Download,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";

import {
  AUTHOR,
  REPO_URL,
  SITE_FEATURES,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "../seo/siteConfig";

// Static showcase / landing page served at `/home/` (and `/preview/home`
// on the staging slot). It exists primarily to satisfy the Google OAuth
// "app homepage" requirements — accurately identify the app, fully
// describe what it does, explain *why* it requests access to a user's
// cloud storage, link to the privacy policy, and stay reachable without
// signing in. Like `PrivacyPage`, it is intentionally English-only and
// hardcoded (see the "What's intentionally not translated" section in
// AGENTS.md): it is marketing / compliance copy reviewed as a whole,
// not part of the in-app string surface.

// Absolute URLs to the sibling static pages, derived from the slot's
// base path so the links resolve on production (`/`) and the preview
// slot (`/preview/`) alike.
const APP_URL = import.meta.env.BASE_URL;
const PRIVACY_URL = `${import.meta.env.BASE_URL}privacy/`;

export function HomePage() {
  return (
    <div className="min-h-dvh bg-page-bg px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-fg">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-12">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-2 text-meta">
            <Wallet size={20} aria-hidden focusable={false} />
            <span className="text-base font-bold tracking-wide text-fg-bright">
              {SITE_NAME}
            </span>
          </div>
          <h1 className="text-2xl font-bold leading-tight text-fg-bright sm:text-3xl">
            {SITE_TAGLINE}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-fg sm:text-base">
            {SITE_NAME} is a spreadsheet-style personal finance app that tracks
            your accounts, salary, loans, savings, investments, and properties —
            and rolls them up into your net worth. Everything lives in your own
            browser. There is no account to create, no server behind it, and no
            behavioural tracking.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={APP_URL}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent bg-surface-2 px-4 py-2 text-sm font-bold text-fg-bright hover:bg-surface-3"
            >
              Open {SITE_NAME}
              <ArrowRight size={15} aria-hidden focusable={false} />
            </a>
            <a
              href={PRIVACY_URL}
              className="inline-flex items-center gap-1.5 px-2 py-2 text-sm text-link hover:underline"
            >
              Privacy policy
            </a>
          </div>
        </header>

        <Section
          icon={<Wallet size={18} aria-hidden focusable={false} />}
          title="What Budget does"
        >
          <p>
            {SITE_NAME} gives you one place to plan and track your money,
            organised as spreadsheet-style monthly sheets with live running
            balances. Each kind of thing you track gets its own sheet type:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            {SITE_FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <p>
            It is a Progressive Web App: install it to your home screen and it
            works offline, because the whole app runs locally in your browser.
          </p>
        </Section>

        <Section
          icon={<ShieldCheck size={18} aria-hidden focusable={false} />}
          title="Where your data lives"
        >
          <p>
            {SITE_NAME} is{" "}
            <strong className="text-fg-bright">local-first</strong>. Your budget
            — every account, row, salary record, and setting — is stored in your
            browser&apos;s local storage on your own device. By default it is
            encrypted at rest with a key derived from your account password
            (AES-GCM). We never receive a copy of your budget, because there is
            no backend server to send it to.
          </p>
          <p>
            You can export your entire ledger as a JSON file at any time and
            import it on another device, so you are never locked in.
          </p>
        </Section>

        <Section
          icon={<Cloud size={18} aria-hidden focusable={false} />}
          title="Why Budget asks to access your cloud storage"
        >
          <p>
            Cloud sync is <strong className="text-fg-bright">optional</strong>.
            You can use {SITE_NAME} forever without connecting any account. If
            you want the same budget on more than one device, you can connect
            your own <strong className="text-fg-bright">Dropbox</strong> or{" "}
            <strong className="text-fg-bright">Google Drive</strong> — and that
            is the <em>only</em> reason the app ever requests access to them:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong className="text-fg-bright">Dropbox.</strong> {SITE_NAME}{" "}
              requests the <em>App folder</em> scope, which restricts it to a
              single folder (
              <span className="text-path">Apps/budget.niclaslindstedt.se/</span>
              ) inside your Dropbox. It cannot read or touch anything else.
            </li>
            <li>
              <strong className="text-fg-bright">Google Drive.</strong>{" "}
              {SITE_NAME} requests the{" "}
              <code className="text-meta">drive.file</code> scope, which limits
              it to only the files this app itself creates in your Drive. It
              cannot see the rest of your Drive.
            </li>
          </ul>
          <p>
            In both cases the app writes a single{" "}
            <code className="text-meta">budget.json</code> file containing the
            same bytes it would otherwise keep in your browser — encrypted by
            default. You sign in to the provider directly on their own consent
            screen; your credentials never pass through {SITE_NAME}, and the
            developer runs no server that can observe your data. You can revoke
            access at any time from your Dropbox or Google account settings.
          </p>
          <p>
            For the full detail of what is stored, uploaded, and how to revoke
            access, read the{" "}
            <a href={PRIVACY_URL} className="text-link hover:underline">
              privacy policy
            </a>
            .
          </p>
        </Section>

        <Section
          icon={<Lock size={18} aria-hidden focusable={false} />}
          title="Privacy by design"
        >
          <ul className="ml-5 list-disc space-y-1">
            <li>No account on a server — you stay in control of your data.</li>
            <li>No behavioural-tracking or advertising SDKs.</li>
            <li>No cookies — persistence uses your browser&apos;s storage.</li>
            <li>Open source, MIT-licensed, and auditable on GitHub.</li>
          </ul>
        </Section>

        <footer className="flex flex-col gap-4 border-t border-line pt-6 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={APP_URL}
              className="inline-flex items-center gap-1.5 text-link hover:underline"
            >
              <ArrowRight size={13} aria-hidden focusable={false} />
              Open {SITE_NAME}
            </a>
            <a href={PRIVACY_URL} className="text-link hover:underline">
              Privacy policy
            </a>
            <a href={REPO_URL} className="text-link hover:underline">
              Source on GitHub
            </a>
            <a
              href={`${REPO_URL}/releases`}
              className="inline-flex items-center gap-1.5 text-link hover:underline"
            >
              <Download size={13} aria-hidden focusable={false} />
              Releases
            </a>
          </div>
          <p>
            {SITE_NAME} is built and maintained by{" "}
            <a href={AUTHOR.url} className="text-link hover:underline">
              {AUTHOR.name}
            </a>{" "}
            and served from{" "}
            <span className="text-path">
              {SITE_URL.replace(/^https?:\/\//, "")}
            </span>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed text-fg">
      <h2 className="flex items-center gap-2 text-base font-bold text-fg-bright">
        <span className="text-meta">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
