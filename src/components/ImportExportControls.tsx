import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

import type { Budget } from "../data/types";
import {
  FILE_MIME_TYPE,
  parseBudget,
  serializeBudget,
  suggestFilename,
} from "../storage/file";

type Props = {
  budget: Budget;
  onImport: (budget: Budget) => void;
};

type Status =
  | { kind: "idle" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const iconButton =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border border-line bg-transparent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg";

export function ImportExportControls({ budget, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function handleExport() {
    const blob = new Blob([serializeBudget(budget)], { type: FILE_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestFilename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus({ kind: "ok", message: "Exported." });
  }

  async function handleFile(file: File) {
    let text: string;
    try {
      text = await file.text();
    } catch (err) {
      setStatus({
        kind: "error",
        message: `Could not read file: ${(err as Error).message}`,
      });
      return;
    }
    const result = parseBudget(text);
    if (!result.ok) {
      setStatus({ kind: "error", message: `Import failed — ${result.error}` });
      return;
    }
    onImport(result.budget);
    const sheetCount = result.budget.sheets.length;
    const suffix = result.migrated ? " (migrated to current version)" : "";
    setStatus({
      kind: "ok",
      message: `Imported ${sheetCount} sheet${sheetCount === 1 ? "" : "s"}${suffix}.`,
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      {status.kind !== "idle" && (
        <span
          role="status"
          className={
            status.kind === "error"
              ? "text-xs text-danger"
              : "text-xs text-muted"
          }
        >
          {status.message}
        </span>
      )}
      <button
        type="button"
        className={`${iconButton} text-accent hover:border-accent hover:text-accent`}
        onClick={handleExport}
        aria-label="Export budget as JSON"
        title="Export"
      >
        <Download size={18} aria-hidden focusable={false} />
      </button>
      <button
        type="button"
        className={`${iconButton} text-link hover:border-link hover:text-link`}
        onClick={() => inputRef.current?.click()}
        aria-label="Import budget from JSON"
        title="Import"
      >
        <Upload size={18} aria-hidden focusable={false} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
