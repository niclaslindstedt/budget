import { useEffect, useMemo, useRef, useState } from "react";

import { useT } from "../../../i18n";
import {
  clearLogs,
  getLogs,
  type LogEntry,
  type LogLevel,
  subscribeToLogs,
} from "../../../utils/logger";
import { SelectPicker } from "../../form";
import { Field, Section } from "./shared";

type LogFilter = "all" | LogLevel;

export function LogsTab() {
  const t = useT();
  // `version` is a tick that increments whenever the logger pushes or
  // clears — used to force this component to re-read `getLogs()`. A
  // ref-style subscription is simpler than mirroring the full buffer
  // into local state and lets the logger own the storage.
  const [version, setVersion] = useState(0);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [copyStatus, setCopyStatus] = useState<null | "copied" | "failed">(
    null,
  );
  const listRef = useRef<HTMLDivElement | null>(null);
  // Track whether the user is currently scrolled to the bottom — only
  // auto-scroll new entries into view if they were already pinned
  // there, so reading earlier entries while logs stream in stays sane.
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    return subscribeToLogs(() => setVersion((v) => v + 1));
  }, []);

  // `version` is the force-re-read signal — it bumps on every logger
  // push/clear so the memo recomputes against the latest buffer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allEntries = useMemo(() => getLogs(), [version]);
  const entries = useMemo(() => {
    if (filter === "all") return allEntries;
    return allEntries.filter((e) => e.level === filter);
  }, [allEntries, filter]);

  // Auto-scroll behaviour: after every render where new entries came
  // in, snap to the bottom if the user was already there.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries.length]);

  function handleScroll() {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    stickToBottomRef.current = atBottom;
  }

  async function handleCopy() {
    const text = entries.map(formatLogLine).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus(null), 2000);
  }

  return (
    <Section title={t("settings.logs.title")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Field label={t("settings.logs.filterLabel")}>
          <SelectPicker<LogFilter>
            value={filter}
            options={[
              { value: "all", label: t("settings.logs.filterAll") },
              { value: "info", label: t("settings.logs.filterInfo") },
              { value: "warn", label: t("settings.logs.filterWarn") },
              { value: "error", label: t("settings.logs.filterError") },
            ]}
            onChange={setFilter}
            ariaLabel={t("settings.logs.filterLabel")}
            triggerClassName="field-input flex cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
          />
        </Field>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={entries.length === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("settings.logs.copy")}
          </button>
          <button
            type="button"
            onClick={clearLogs}
            disabled={allEntries.length === 0}
            className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("settings.logs.clear")}
          </button>
        </div>
      </div>
      <p className="text-xs text-muted">
        {entries.length === 0
          ? t("settings.logs.empty")
          : t("settings.logs.entryCount", { count: entries.length })}
        {copyStatus === "copied" && (
          <>
            {" — "}
            <span className="text-success">{t("settings.logs.copied")}</span>
          </>
        )}
        {copyStatus === "failed" && (
          <>
            {" — "}
            <span className="text-danger">{t("settings.logs.copyFailed")}</span>
          </>
        )}
      </p>
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="max-h-[334px] overflow-y-auto rounded border border-line bg-surface font-mono text-xs"
      >
        {entries.length === 0 ? (
          <p className="px-2 py-3 text-muted">{t("settings.logs.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry, idx) => (
              <li
                key={`${entry.ts}-${idx}`}
                className="flex flex-wrap items-baseline gap-2 border-b border-line px-2 py-1 last:border-b-0"
              >
                <span className="text-muted tabular-nums">
                  {formatLogTime(entry.ts)}
                </span>
                <span className={levelClass(entry.level)}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="text-path">[{entry.scope}]</span>
                <span className="break-words whitespace-pre-wrap text-fg">
                  {entry.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatLogLine(entry: LogEntry): string {
  return `${formatLogTime(entry.ts)} [${entry.scope}] ${entry.level.toUpperCase()} ${entry.message}`;
}

function levelClass(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-danger";
    case "warn":
      return "text-flag";
    case "info":
      return "text-meta";
  }
}
