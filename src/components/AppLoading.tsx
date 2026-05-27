import { Loader } from "lucide-react";

import { useT } from "../i18n";

// Shown in the main area while the active backend's initial load is in
// flight. Without this, the reducer's `freshUserData()` seed renders as
// an empty "Budget" sheet with the current month — which looks like
// the user's data was lost when it's actually still being fetched.

export function AppLoading() {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-muted"
    >
      <Loader
        size={32}
        aria-hidden
        focusable={false}
        className="animate-spin"
      />
      <span className="text-sm">{t("app.loading")}</span>
    </div>
  );
}
