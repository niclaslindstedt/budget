// Two-flag language picker used by the General settings tab. Renders
// the UK flag (English) and the Swedish flag side by side; the active
// language gets full opacity and an accent border, the inactive one
// dims to make the contrast obvious at a glance.
//
// Inline SVG flags (not emoji 🇬🇧/🇸🇪) so rendering is identical
// across browsers and OSes — the One Dark / One Light monospace
// aesthetic needs deterministic chrome, and flag emojis fall back to
// "GB" / "SE" letter-pairs on systems without colour-emoji fonts
// (notably Windows).

import { type Lang, useT } from "../i18n";

const FLAG_W = 36;
const FLAG_H = 24;

function UKFlag() {
  // 60×40 viewBox so all the cross strokes land on round numbers.
  return (
    <svg
      viewBox="0 0 60 40"
      width={FLAG_W}
      height={FLAG_H}
      role="img"
      aria-hidden="true"
      className="block rounded-sm"
    >
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 L60,40 M60,0 L0,40" stroke="#ffffff" strokeWidth="6" />
      <path
        d="M0,0 L60,40 M60,0 L0,40"
        stroke="#C8102E"
        strokeWidth="3"
        clipPath="url(#uk-diag-clip)"
      />
      <defs>
        <clipPath id="uk-diag-clip">
          <polygon points="0,0 30,20 60,0 60,40 30,20 0,40" />
        </clipPath>
      </defs>
      <rect x="25" width="10" height="40" fill="#ffffff" />
      <rect y="15" width="60" height="10" fill="#ffffff" />
      <rect x="27" width="6" height="40" fill="#C8102E" />
      <rect y="17" width="60" height="6" fill="#C8102E" />
    </svg>
  );
}

function SwedishFlag() {
  // 10:16 ratio standard Swedish flag; cross arms 2/16 wide, with the
  // vertical arm offset 5 units from the hoist (Swedish flag standard).
  return (
    <svg
      viewBox="0 0 16 10"
      width={FLAG_W}
      height={FLAG_H}
      role="img"
      aria-hidden="true"
      className="block rounded-sm"
    >
      <rect width="16" height="10" fill="#006AA7" />
      <rect x="5" width="2" height="10" fill="#FECC00" />
      <rect y="4" width="16" height="2" fill="#FECC00" />
    </svg>
  );
}

export function LanguagePicker({
  value,
  onChange,
}: {
  value: Lang;
  onChange: (lang: Lang) => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t("language.pick")} className="flex gap-2">
      <FlagButton
        active={value === "en"}
        onClick={() => onChange("en")}
        label={t("language.english")}
      >
        <UKFlag />
      </FlagButton>
      <FlagButton
        active={value === "sv"}
        onClick={() => onChange("sv")}
        label={t("language.swedish")}
      >
        <SwedishFlag />
      </FlagButton>
    </div>
  );
}

function FlagButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const base =
    "flex items-center gap-2 rounded border px-2 py-1.5 font-mono text-sm transition-opacity focus-visible:outline-none";
  const activeCls = "border-accent bg-surface-2 text-fg-bright";
  const inactiveCls =
    "border-line bg-transparent text-muted opacity-60 hover:opacity-100 hover:border-accent";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`${base} ${active ? activeCls : inactiveCls}`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
