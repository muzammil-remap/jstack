/**
 * cardVerbs.ts (A-4 round 9, A4R9-01/02) — what a decision card's Approve,
 * Revise and Later DO, in one place.
 *
 * The card's buttons (`components/today/DecisionCard.tsx`) and the desktop
 * keys A, R and L (`lib/shortcuts.ts`, wired in `lib/boot.ts`) both call these,
 * so a key can never answer differently from the button it stands for. It did:
 * A approved with no option after option 2 was picked, and R opened the quote
 * editor on every kind of card, where the button opens it for a quote only.
 *
 * `keyableCard` is the other half: the keys answer the open card only where its
 * buttons are there to press — Today showing, nothing open over it, the app
 * unlocked and online. They had answered Today's card from Brain, over an open
 * dialog and offline.
 */
import type { ActionItem } from "@/data/types";
import { needsYouHold } from "@/lib/needsYouSchedule";
import { now } from "@/lib/time";
import { useDeviceStore } from "@/stores/device";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTodayStore } from "@/stores/today";
import { sayRefused } from "@/lib/optimistic";

/** the option the card shows as picked: the person's, else the recommended, else the first */
function cardPick(card: ActionItem): 1 | 2 | 3 {
  return useTodayStore.getState().picks[card.id] ?? card.recommended ?? 1;
}

export function approveCard(card: ActionItem): Promise<void> {
  return useTodayStore.getState().answer(card.id, { verb: "approve", option: cardPick(card) }).catch(sayRefused);
}

export function reviseCard(card: ActionItem): void {
  const { openModal } = useSessionStore.getState();
  // a quote's revise is its draft editor
  if (card.kind === "quote") return openModal("revise-card", card.id);
  // B-3 (CB-07): revising a section opens its config, and the card stays OPEN
  // until the revision is saved — a revise you change your mind about should
  // not consume the proposal. `ConfigureDialog` answers the card and
  // re-proposes together, so the two never come apart.
  if (card.kind === "section") return openModal("life-config", card.id);
  void useTodayStore.getState().answer(card.id, { verb: "revise", revision: "" }).catch(sayRefused);
}

export function laterCard(card: ActionItem): Promise<void> {
  return useTodayStore.getState().answer(card.id, { verb: "later" }).catch(sayRefused);
}

/** why a decision's verbs are off without a connection (OF-08) — the card's, the waiting row's and the menu's */
export const OFFLINE_REASON = "needs a connection";

/** Needs you's section id — the collapse map's key, and the section's own (`components/today/NeedsYou.tsx`) */
export const NEEDS_YOU_SECTION = "needs-you";

/**
 * Is anything over the tab: a modal, a sheet, the Settings sheet or the task
 * card? ONE definition, which `useOverlayOpen` (`layout/dialogs.tsx`) and the
 * keys both read. The keys kept a list of their own and it left out the task
 * card, whose open state lives in its own store (A4R10-01).
 */
export function overlayOver(open: { modal: string | null; sheet: string | null; settingsOpen: boolean }, taskOpen: boolean): boolean {
  return open.modal != null || open.sheet != null || open.settingsOpen || taskOpen;
}

/**
 * The card the keys may answer, or null: only where its buttons are there to
 * press. `onToday` is the router's word for whether Today is the screen
 * showing; then nothing over the tab, the task card included; Needs you not
 * collapsed, since a collapsed section renders no card while the store still
 * names one (A4R10-01); Needs you not waiting outside its schedule, which renders
 * no card either (WPS-1); the gate down; and a connection (OF-08: a decision is
 * never queued). Needs you cannot be hidden — it is pinned (`PINNED.today`).
 */
export function keyableCard(onToday: boolean): ActionItem | null {
  const session = useSessionStore.getState();
  if (!onToday || session.locked || !session.online) return null;
  if (overlayOver(session, useTaskCardStore.getState().openTaskId != null)) return null;
  if (useDeviceStore.getState().collapsed[NEEDS_YOU_SECTION] === true) return null;
  if (needsYouHold(useSettingsStore.getState().quietHours, now()).held) return null;
  const { openDecisionId, composite } = useTodayStore.getState();
  return composite?.needsYou.find((c) => c.id === openDecisionId) ?? null;
}
