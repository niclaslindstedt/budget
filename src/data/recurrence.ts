// Recurrence rules for complex budget entries. Each rule is expanded
// into a list of ISO `YYYY-MM-DD` dates by `expandRecurrence`. Output
// is sorted, de-duplicated, and clamped to `[start, end]` so callers
// can feed it straight into row creation without re-sanitising.

export type RecurrenceRule =
  | { kind: "once"; date: string }
  | { kind: "dates"; dates: string[] }
  | {
      kind: "everyNDays";
      start: string;
      end: string;
      intervalDays: number;
    }
  | {
      // Covers monthly (intervalMonths=1), quarterly (=3), yearly (=12),
      // or any other N-month cadence. For each anchor month in range, the
      // emitted date is `dayOfMonth` (clamped to that month's length)
      // shifted by `offsetDays`. The anchor is always counted from `start`.
      kind: "everyNMonths";
      intervalMonths: number;
      dayOfMonth: number;
      offsetDays: number;
      start: string;
      end: string;
    };

export type RecurrenceKind = RecurrenceRule["kind"];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_RE.test(value)) return false;
  const d = parseIso(value);
  return d !== null && toIso(d) === value;
}

function parseIso(value: string): Date | null {
  if (!ISO_RE.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  // Construct in UTC to avoid DST-induced day-flips when we add days.
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function expandRecurrence(rule: RecurrenceRule): string[] {
  const out = new Set<string>();
  switch (rule.kind) {
    case "once": {
      if (isIsoDate(rule.date)) out.add(rule.date);
      break;
    }
    case "dates": {
      for (const d of rule.dates) if (isIsoDate(d)) out.add(d);
      break;
    }
    case "everyNDays": {
      const start = parseIso(rule.start);
      const end = parseIso(rule.end);
      const step = Math.floor(rule.intervalDays);
      if (!start || !end || step < 1) break;
      for (
        let cursor = start;
        cursor.getTime() <= end.getTime();
        cursor = addDays(cursor, step)
      ) {
        out.add(toIso(cursor));
      }
      break;
    }
    case "everyNMonths": {
      const start = parseIso(rule.start);
      const end = parseIso(rule.end);
      const stride = Math.floor(rule.intervalMonths);
      if (!start || !end || stride < 1) break;
      // Walk forward `stride` months at a time from `start`, computing the
      // anchor day (clamped to the month's length) and shifting by the
      // offset — so day=1, offset=-2, stride=1, March-2026 produces
      // 2026-02-27; stride=3 gives quarterly; stride=12 gives yearly.
      const anchor = Math.max(1, Math.floor(rule.dayOfMonth));
      let y = start.getUTCFullYear();
      let m = start.getUTCMonth();
      const endTs = end.getTime();
      while (true) {
        const day = Math.min(anchor, daysInMonth(y, m));
        const candidate = addDays(
          new Date(Date.UTC(y, m, day)),
          Math.floor(rule.offsetDays),
        );
        if (candidate.getTime() > endTs) break;
        if (candidate.getTime() >= start.getTime()) {
          out.add(toIso(candidate));
        }
        // Step to the next eligible month. Bail once the next anchor's
        // month is past `end`, even if the offset could pull it back into
        // range — that's the user's contract for "end".
        m += stride;
        while (m > 11) {
          m -= 12;
          y += 1;
        }
        if (
          y > end.getUTCFullYear() ||
          (y === end.getUTCFullYear() && m > end.getUTCMonth())
        ) {
          // Last shot: the next anchor's month is past end, but its
          // offset-shifted date could still land before end. Check once.
          const lastDay = Math.min(anchor, daysInMonth(y, m));
          const lastCandidate = addDays(
            new Date(Date.UTC(y, m, lastDay)),
            Math.floor(rule.offsetDays),
          );
          if (
            lastCandidate.getTime() <= endTs &&
            lastCandidate.getTime() >= start.getTime()
          ) {
            out.add(toIso(lastCandidate));
          }
          break;
        }
      }
      break;
    }
  }
  return [...out].sort();
}
