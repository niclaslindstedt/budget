// Temporary diagnostic logger for the "amount auto-selects on page
// refresh" report. Captures everything that touches focus or selection
// during the first second after the page boots, plus every focus event
// on inputs / textareas after that, plus page-lifecycle events. The
// goal is to identify, definitively, what is putting the keyboard up
// and selecting the amount cell on iOS Safari when the user taps the
// URL bar reload icon.
//
// Routed through the in-app logger so the user can capture and copy
// the trace from Settings → Logs on the /preview/ build. Production
// callers are silent — `createLogger` only persists when capture is
// enabled, and capture is preview-only.
//
// REMOVE this file (and its import in main.tsx) once the root cause is
// identified.

import { createLogger } from "./logger";

const log = createLogger("focus-diag");

function describeNode(node: EventTarget | Node | null): string {
  if (!node) return "null";
  if (node === document) return "document";
  if (node === window) return "window";
  if (!(node instanceof Element)) return "(non-element)";
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const cls = node.className
    ? `.${String(node.className).split(/\s+/).filter(Boolean).slice(0, 2).join(".")}`
    : "";
  let extra = "";
  if (node instanceof HTMLInputElement) {
    extra = ` [type=${node.type} inputMode=${node.inputMode || "-"} value="${String(node.value).slice(0, 12)}"]`;
  } else if (node instanceof HTMLTextAreaElement) {
    extra = ` [textarea value="${String(node.value).slice(0, 12)}"]`;
  } else if (node instanceof HTMLButtonElement) {
    extra = ` [button "${node.textContent?.trim().slice(0, 20) || ""}"]`;
  }
  return `${tag}${id}${cls}${extra}`;
}

function describeSelection(el: HTMLInputElement | HTMLTextAreaElement): string {
  try {
    return `selection=[${el.selectionStart},${el.selectionEnd}]`;
  } catch {
    return "selection=(unavailable)";
  }
}

function snapshotActive(label: string) {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    log.info(
      `${label} active=${describeNode(el)} ${describeSelection(el)} hasFocus=${document.hasFocus()}`,
    );
  } else {
    log.info(
      `${label} active=${describeNode(el)} hasFocus=${document.hasFocus()}`,
    );
  }
}

export function installFocusDiagnostic(): void {
  const bootedAt = performance.now();
  log.info(
    `boot readyState=${document.readyState} url=${window.location.pathname} ua=${navigator.userAgent.slice(0, 80)}`,
  );

  snapshotActive("boot/sync");
  // Sample activeElement at several points during boot — iOS Safari
  // sometimes restores focus before React mounts, sometimes after, and
  // sometimes between paints. Catching it at multiple intervals tells
  // us when (relative to boot) the focus lands.
  for (const ms of [0, 30, 100, 300, 1000, 2500]) {
    setTimeout(() => snapshotActive(`boot+${ms}ms`), ms);
  }
  requestAnimationFrame(() =>
    snapshotActive(`raf1 (+${(performance.now() - bootedAt).toFixed(0)}ms)`),
  );

  // Page lifecycle — pageshow with persisted=true means BFcache
  // restore; pagehide with persisted=true means the page entered
  // BFcache. visibilitychange covers tab-switch / app-backgrounding.
  window.addEventListener("pageshow", (event) => {
    log.info(
      `pageshow persisted=${event.persisted} (+${(performance.now() - bootedAt).toFixed(0)}ms)`,
    );
    snapshotActive("pageshow");
  });
  window.addEventListener("pagehide", (event) => {
    log.info(`pagehide persisted=${event.persisted}`);
    snapshotActive("pagehide");
  });
  document.addEventListener("visibilitychange", () => {
    log.info(`visibilitychange state=${document.visibilityState}`);
    snapshotActive("visibilitychange");
  });

  // Focus events on every input / textarea — both the bubbling
  // `focusin` (which is what `select-on-focus` listens to) and the
  // non-bubbling `focus` event on the target itself once it's in the
  // DOM. Tag with isTrusted so we can tell user-initiated focus from
  // programmatic focus.
  document.addEventListener(
    "focusin",
    (event) => {
      const t = event.target;
      if (
        !(t instanceof HTMLInputElement) &&
        !(t instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      log.info(
        `focusin target=${describeNode(t)} relatedTarget=${describeNode(event.relatedTarget)} isTrusted=${event.isTrusted}`,
      );
    },
    true,
  );
  document.addEventListener(
    "focusout",
    (event) => {
      const t = event.target;
      if (
        !(t instanceof HTMLInputElement) &&
        !(t instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      log.info(
        `focusout target=${describeNode(t)} relatedTarget=${describeNode(event.relatedTarget)} isTrusted=${event.isTrusted}`,
      );
    },
    true,
  );

  // Selection — fires when the text selection inside an input or
  // anywhere in the document changes. Debounced because typing
  // generates a torrent of selectionchange events.
  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener("selectionchange", () => {
    if (selectionTimer !== null) clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      selectionTimer = null;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        log.info(
          `selectionchange (debounced) active=${describeNode(el)} ${describeSelection(el)}`,
        );
      }
    }, 50);
  });

  // First user-input events — covers what the select-on-focus guard
  // considers a "real" interaction.
  const onFirstInteract = (kind: string) => {
    log.info(
      `first-user-interact kind=${kind} (+${(performance.now() - bootedAt).toFixed(0)}ms)`,
    );
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("touchstart", onTouchStart, true);
  };
  const onPointerDown = () => onFirstInteract("pointerdown");
  const onKeyDown = () => onFirstInteract("keydown");
  const onTouchStart = () => onFirstInteract("touchstart");
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("touchstart", onTouchStart, true);
}
