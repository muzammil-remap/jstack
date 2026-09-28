/**
 * Desktop keyboard shortcuts (the brief's Desktop section; V2_DECISIONS.md
 * "Deferred or refused brief items" — built minimal, not the full "week's
 * cards in two minutes" deck, which is V2.1): 1–5 switch tabs, Esc closes
 * the open dialog/sheet, Cmd/Ctrl+K opens Find, Cmd/Ctrl+Z undoes the
 * latest ledger entry, A/R/L answer the open decision card
 * (Approve/Revise/Later) when one is open — through the card's own verbs and
 * only where its buttons are there to press (`lib/cardVerbs.ts`, A4R9-01/02).
 */
import { Platform } from "react-native";

type ShortcutHandlers = {
  onTab: (n: 1 | 2 | 3 | 4 | 5) => void;
  onEscape: () => void;
  onFind: () => void;
  onUndo: () => void;
  onApprove: () => void;
  onRevise: () => void;
  onLater: () => void;
  /** shortcuts that answer the open card are no-ops unless one is open */
  hasOpenCard: () => boolean;
  /** C-2: a modal, a sheet, Settings or the task card — lets Escape through
   * from inside a text field (the caps dialog's amount box) without opening
   * the door to the letter shortcuts, which stay blocked while typing. */
  hasOpenOverlay: () => boolean;
  /** C-5: the letter deck (A/R/L) belongs to the Expanded (non-phone)
   * layout it was designed for — `theme/useLayout.ts`'s `!phone`. The tab
   * digits and the mod-key shortcuts are not gated by this. */
  isExpandedLayout: () => boolean;
};

const CONTROL = "button, a, select, [role='button'], [role='link'], [role='tab'], [role='radio'], [role='checkbox'], [role='switch'], [role='menuitem']";

/** focus is on a control that is not part of a decision card */
function atForeignControl(target: HTMLElement | null): boolean {
  if (target == null || typeof target.closest !== "function") return false;
  if (target.closest(CONTROL) == null) return false;
  return target.closest("[data-testid^='decision-card-']") == null;
}

export function installShortcuts(handlers: ShortcutHandlers): () => void {
  if (Platform.OS !== "web") return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const typing = target != null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      handlers.onFind();
      return;
    }
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      handlers.onUndo();
      return;
    }
    // C-2: Escape is let through a text field when something is open to close
    // (the caps dialog's amount box) — letters stay blocked while typing either way.
    const escapeOverOpen = e.key === "Escape" && handlers.hasOpenOverlay();
    if (typing && !escapeOverOpen) return; // everything else needs focus off a text field

    if (e.key === "Escape") {
      handlers.onEscape();
      return;
    }
    if (/^[1-5]$/.test(e.key)) {
      handlers.onTab(Number(e.key) as 1 | 2 | 3 | 4 | 5);
      return;
    }
    if (!handlers.hasOpenCard() || !handlers.isExpandedLayout()) return;
    // A4R9-01: a letter under a modifier is the browser's or the OS's (Ctrl+A
    // selects, Ctrl+L is the address bar), a held key is not four answers, and
    // a focused control owns the keys typed at it — typing "all ok" at the Send
    // button Brain's field leaves focused answered every open card. The card's
    // OWN controls are the exception: after picking an option, A approves it.
    if (mod || e.altKey || e.repeat || atForeignControl(target)) return;
    const k = e.key.toLowerCase();
    if (k === "a") handlers.onApprove();
    else if (k === "r") handlers.onRevise();
    else if (k === "l") handlers.onLater();
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}
