import { useRef, useState } from "react";

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

const buttonClass =
  "inline-flex h-8 cursor-pointer items-center justify-center rounded border border-line bg-transparent px-3 text-sm text-fg hover:text-fg-bright hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg";

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
    <div className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={buttonClass} onClick={handleExport}>
        Export
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={() => inputRef.current?.click()}
      >
        Import
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // reset so picking the same filename twice still fires onChange
          e.target.value = "";
        }}
      />
      {status.kind !== "idle" && (
        <span
          role="status"
          className={
            status.kind === "error"
              ? "text-sm text-danger"
              : "text-sm text-muted"
          }
        >
          {status.message}
        </span>
      )}
    </div>
  );
}
