/**
 * lib/dialogFocus.ts (C-3) — what makes an open dialog reachable and nothing
 * else: `role="dialog"` / `aria-modal`, focus moved onto it when it opens, a
 * Tab/Shift+Tab trap over its own focusable set, and the focus it hands back
 * to whatever had it when the dialog closes. Imperative DOM attributes on a
 * react-native-web host node — the same shape lib/webInert.ts's `setInert`
 * uses, and for the same reason: neither `role` nor `aria-modal` is a typed
 * React Native prop. Web only; native has no equivalent here yet (C-3b) —
 * `accessibilityViewIsModal` exists as a real `View` prop, but hides every
 * OTHER open overlay from a query or a screen reader while it is set, which
 * this app cannot accept unconditionally: a picker can sit over the task
 * card at once (S6-41), and either one owning the flag hid the other's
 * content. Doing this right means the flag belongs to the whole open-overlay
 * REGION (`app/_layout.tsx`'s `useOverlayOpen()`, the same question its own
 * `inert` call already answers for the routed stack), not to one dialog at a
 * time — see `components/chrome/DialogHost.tsx`'s `DialogFrame` comment.
 */
import { Platform } from "react-native";

type FocusTarget = { focus: () => void };
type DialogNode = {
  setAttribute?: (k: string, v: string) => void;
  querySelectorAll?: (selector: string) => ArrayLike<FocusTarget>;
  addEventListener?: (type: string, fn: (e: KeyboardEvent) => void) => void;
  removeEventListener?: (type: string, fn: (e: KeyboardEvent) => void) => void;
  focus?: () => void;
};

/** README Accessibility / WCAG 2.4.3: every control a keyboard reaches, in one pass over the DOM. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"], [contenteditable="true"]';

function activeElement(): unknown {
  return (globalThis as { document?: { activeElement?: unknown } }).document?.activeElement ?? null;
}

/**
 * C-3b — every restore currently in flight, module-wide, not just the last
 * one. Dialog A's cleanup defers its `opener.focus()` a frame (see
 * `installDialogA11y` below); if dialog B opens in the same commit (A
 * closes, B opens — e.g. task detail swapping straight to a picker), B's
 * install must cancel A's still-pending restore, or it fires after B has
 * already moved focus in and steals it back onto A's opener, which sits
 * outside B. `closeAll()` (C-1) can close the task card AND a modal/sheet in
 * the SAME commit, so more than one restore can be scheduled at once — a
 * single handle here would let a second dialog's schedule silently replace
 * the first's, leaving it uncancellable (C-3c). A `Set` cancels all of them.
 * A second, cheaper guard backs it up regardless: each restore is skipped if
 * focus has already landed inside some other open dialog by the time it runs.
 */
const pendingRestores = new Set<number>();

function cancelPendingRestores(): void {
  if (pendingRestores.size === 0) return;
  const caf = (globalThis as { cancelAnimationFrame?: (h: number) => void }).cancelAnimationFrame;
  for (const handle of pendingRestores) caf?.(handle);
  pendingRestores.clear();
}

function isInsideOpenDialog(node: unknown): boolean {
  const el = node as { closest?: (selector: string) => unknown } | null;
  return el?.closest?.('[role="dialog"]') != null;
}

/** Marks a node as a modal dialog for assistive tech. */
export function markDialog(node: unknown): void {
  const el = node as DialogNode | null;
  el?.setAttribute?.("role", "dialog");
  el?.setAttribute?.("aria-modal", "true");
}

/** The dialog's first focusable descendant, or the container itself if it has none — a dialog that opens must land somewhere. */
export function firstFocusable(node: unknown): FocusTarget | null {
  const el = node as DialogNode | null;
  if (el == null) return null;
  const list = el.querySelectorAll?.(FOCUSABLE);
  if (list != null && list.length > 0) return list[0];
  return typeof el.focus === "function" ? (el as FocusTarget) : null;
}

/** Traps Tab/Shift+Tab inside `node`'s current focusable set. Returns the remover. */
export function trapTab(node: unknown): () => void {
  const el = node as DialogNode | null;
  if (el?.addEventListener == null) return () => {};
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const list = el.querySelectorAll?.(FOCUSABLE);
    const items = list != null ? Array.from(list) : [];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = activeElement();
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  el.addEventListener("keydown", onKeyDown);
  return () => el.removeEventListener?.("keydown", onKeyDown);
}

/**
 * Installs everything above on an open dialog's root node and returns the
 * cleanup — called when the dialog unmounts (C-3), which restores focus to
 * whatever the opener was rather than leaving it on a node that is gone.
 *
 * A detail dialog behind `useDetail` (TaskDetail and its kind) returns
 * `null` until its fetch lands, so THIS effect — which fires once, on the
 * frame's own mount — often finds nothing inside yet and falls back to the
 * container per `firstFocusable`. Rather than special-case every dialog
 * that loads asynchronously, a `MutationObserver` watches for real content
 * to appear and moves focus onto it for real, once, the first time there is
 * something to move it to. `trapTab` needs no equivalent: it reads the
 * focusable set fresh on every Tab press, not once at install time.
 */
export function installDialogA11y(node: unknown): () => void {
  if (Platform.OS !== "web") return () => {};
  // C-3b/C-3c: a new dialog opening cancels every restore a just-closed one
  // (or several, closeAll()/C-1) left pending — this one is the modal
  // context now.
  cancelPendingRestores();
  const el = node as DialogNode | null;
  const activeOnInstall = activeElement();
  markDialog(el);
  // GS-02: a control inside may have already claimed focus by the time this
  // effect runs — React applies an `<input autoFocus>` during its OWN commit
  // (a plain `.focus()` call, not a queryable attribute: RNW forwards
  // `autoFocus` straight through, and neither React nor RNW reflects it back
  // to the DOM, confirmed against the real bundle before writing this),
  // which for a field with an opinion on where focus belongs (Find's query
  // field) happens before this effect's own pick ever runs. Moving focus to
  // the generic "first focusable" heuristic in that case steals it right
  // back onto the dialog's own chrome: `Dialog.tsx` renders its CloseButton
  // before `{children}`, so "first in DOM order" is the close button on
  // every dialog that has one.
  //
  // The true opener is only ever what had focus BEFORE this dialog's own
  // content could have claimed any of it — if something inside already has
  // it, `activeOnInstall` is that inside control, not the real opener, and
  // there is no reliable way from here to recover what the real one was.
  // Restore-on-close is skipped in that case (`opener` stays null) rather
  // than restoring focus onto a control this dialog owns and is about to
  // unmount anyway.
  const claimedAlready = isInsideOpenDialog(activeOnInstall);
  const opener = (claimedAlready ? null : activeOnInstall) as FocusTarget | null;
  const target = claimedAlready ? null : firstFocusable(el);
  target?.focus();
  const untrap = trapTab(el);

  const MO = (globalThis as { MutationObserver?: typeof MutationObserver }).MutationObserver;
  const fellBackToContainer = !claimedAlready && target === (el as unknown as FocusTarget | null);
  const observer = fellBackToContainer && MO != null && el?.querySelectorAll != null ? new MO(() => {
    const list = el.querySelectorAll!(FOCUSABLE);
    if (list.length === 0) return;
    list[0].focus();
    observer?.disconnect();
  }) : null;
  observer?.observe(el as unknown as Node, { childList: true, subtree: true });

  return () => {
    observer?.disconnect();
    untrap();
    // C-3: NOT called synchronously. The same store write that closes this
    // dialog (openTaskId -> null) also flips app/_layout.tsx's `overlayOpen`,
    // whose OWN effect lifts `inert` off the routed screen the opener lives
    // in — and an inert element refuses focus outright. Both effects fire
    // off the same commit with no guaranteed order between siblings, so a
    // synchronous `opener.focus()` here could race the inert removal and
    // silently land on <body> instead. One frame is enough for both to settle.
    let handle: number | undefined;
    const restore = () => {
      if (handle != null) pendingRestores.delete(handle);
      // C-3b: a dialog that opened in the same frame this one closed has
      // already moved focus onto itself by the time this runs — do not
      // steal it back onto an opener that now sits outside the open dialog.
      if (isInsideOpenDialog(activeElement())) return;
      opener?.focus?.();
    };
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
    if (raf != null) {
      handle = raf(restore);
      pendingRestores.add(handle);
    } else restore();
  };
}
