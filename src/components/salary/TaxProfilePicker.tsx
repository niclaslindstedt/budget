import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Receipt } from "lucide-react";

import type { TaxProfile } from "../../data/types";
import { type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";
import { TaxProfileModal } from "./TaxProfileModal";

// Custom tax-profile dropdown (no native <select>) for the sheet editor.
// A flat "No profile" + the library's profiles, with a "New profile"
// footer that opens TaxProfileModal. Modelled on SheetModal's
// AccountPicker (viewport-space FloatingPanel so it escapes the modal's
// z-50 stacking context).

const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

type Props = {
  value: string | null;
  profiles: readonly TaxProfile[];
  onPick: (taxProfileId: string | null) => void;
  // Adds a freshly-created profile to the library and selects it.
  onCreate: (profile: TaxProfile) => void;
};

export function TaxProfilePicker({ value, profiles, onPick, onCreate }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const selected = profiles.find((p) => p.id === value) ?? null;
  const noProfileLabel = t("tax.noProfile");

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <span className="text-muted">
          <Receipt size={16} aria-hidden focusable={false} />
        </span>
        <span className="flex-1 truncate">
          {selected ? selected.name : noProfileLabel}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={triggerRef}
        placement={PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          <ProfileOption
            label={noProfileLabel}
            selected={value === null}
            onClick={() => {
              onPick(null);
              setOpen(false);
            }}
          />
          {profiles.map((p) => (
            <ProfileOption
              key={p.id}
              label={p.name}
              selected={p.id === value}
              onClick={() => {
                onPick(p.id);
                setOpen(false);
              }}
            />
          ))}
          <li className="mt-1 border-t border-line">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreating(true);
              }}
              className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-accent hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <Plus size={14} aria-hidden focusable={false} />
              {t("tax.newProfile")}
            </button>
          </li>
        </ul>
      </FloatingPanel>

      <TaxProfileModal
        open={creating}
        profile={null}
        existingNames={profiles.map((p) => p.name)}
        onClose={() => setCreating(false)}
        onSave={(profile) => {
          onCreate(profile);
          onPick(profile.id);
          setCreating(false);
        }}
      />
    </div>
  );
}

function ProfileOption({
  label,
  selected,
  onClick,
}: {
  label: ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="text-muted">
          <Receipt size={16} aria-hidden focusable={false} />
        </span>
        <span className="flex-1 truncate">{label}</span>
        {selected && (
          <Check
            size={14}
            className="text-accent"
            aria-hidden
            focusable={false}
          />
        )}
      </button>
    </li>
  );
}
