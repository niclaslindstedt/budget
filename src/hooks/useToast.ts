import { createContext, useContext } from "react";

// Toast context + consumer hook. Lives in its own file so React Fast
// Refresh has a stable boundary — `Toast.tsx` mixes the provider
// component with the viewport renderer, and exporting a hook from
// the same file would trip `react-refresh/only-export-components`.
//
// `ToastProvider` from `../components/Toast` writes through this
// context; `useToast()` reads from it. The shapes are also exported
// from there for ergonomic call sites — `import { useToast } from
// "../hooks/useToast"` is the canonical entry point.

export type ToastKind = "info" | "success" | "warning" | "error";

export type ToastInput = {
  kind?: ToastKind;
  message: string;
  durationMs?: number;
};

export type ToastContextValue = {
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}
