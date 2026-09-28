/**
 * find.ts (K-1) — which Find to open.
 *
 * Find is one component with two registry entries: a `modal` on a desktop and
 * a `screen` on a phone, because an entry declares ONE kind and a full-screen
 * surface is a design decision rather than a width test buried in a component
 * (`layout/dialogs.tsx`, `dialogs.test.ts`). The choice is made here and
 * nowhere else — the rail, `Cmd/Ctrl+K` and the phone header's glyph all ask
 * this function, so there is one answer to "which one is open" rather than
 * three that agree until one of them is edited.
 */
import { useCallback } from "react";
import { useSessionStore } from "@/stores/session";
import { useLayout } from "@/theme/useLayout";

export const FIND_MODAL = "find";
export const FIND_PHONE = "find-phone";

export function findDialogName(phone: boolean): string {
  return phone ? FIND_PHONE : FIND_MODAL;
}

/** The callback form, for the three surfaces that open Find. A hook rather
 * than two store reads at each call site, so no shell has to know the two
 * names — the same shape `useScreenDialogOpen()` takes for the same reason.
 *
 * This file must NOT import the registry: `layout/dialogs.tsx` imports the two
 * names below, so an import back is a cycle, and a cycle between a registry
 * and something it registers fails at module-evaluation time with "cannot
 * access 'c' before initialization" — not at build, and not in a unit test.
 * `useShell()` therefore lives in the registry, which may depend on this. */
export function useOpenFind(): () => void {
  const { phone } = useLayout();
  const openModal = useSessionStore((s) => s.openModal);
  // STABLE, and that is load-bearing: `lib/boot.ts` puts this in the effect
  // that installs the keyboard listener, and a fresh closure each render would
  // tear down and re-add a window listener on every frame. It changes when the
  // width crosses 768, which is exactly when the answer changes.
  return useCallback(() => openModal(findDialogName(phone)), [phone, openModal]);
}
