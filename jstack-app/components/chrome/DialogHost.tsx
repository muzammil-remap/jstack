/**
 * Renders whichever dialogs are open, from `layout/dialogs.tsx` (S-3,
 * SM-05/NR-02/RL-06).
 *
 * All of this used to be inline in `app/_layout.tsx`. It has to mount at the
 * root and nowhere else: `position: "absolute"` only spans the nearest
 * positioned ancestor, so a dialog rendered inside a scrolled `ScrollView`
 * covers that content's box rather than the viewport (BUGLOG_v2.md B-14).
 * The `OverlayBoundary` around it is NR-02 — a dialog that throws in render
 * or mount is closed with a toast and the tab underneath stays usable.
 *
 * Order comes from the registry array, and DOM order is stacking order
 * here; see `layout/dialogs.tsx` for why each position is what it is.
 */
import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { TalkBanner } from "@/components/chrome/TalkBanner";
import { OverlayBoundary } from "@/components/chrome/ErrorBoundary";
import { installDialogA11y } from "@/lib/dialogFocus";
import { DIALOGS } from "@/layout/dialogs";
import { DialogScrimContext, DialogSurfaceContext } from "@/layout/dialogKit";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";

/**
 * C-3 — every open entry gets a role, initial focus, a Tab trap over its own
 * controls, and its focus back on close (`lib/dialogFocus.ts`). One wrapper
 * for the whole registry rather than a change to Dialog.tsx, Sheet.tsx and
 * ScreenSurface.tsx: mount/unmount IS open/close here, since a closed entry
 * renders nothing. Transparent and absolutely filled so it changes nothing
 * about the backdrop it wraps (B-14: overlays are already position absolute),
 * and `role`/`aria-modal` on it describes the whole subtree regardless of
 * what mounts inside it later — a detail dialog behind `useDetail` (TaskDetail)
 * renders nothing on its first pass, which is what `installDialogA11y`'s
 * `MutationObserver` half exists for (an e2e run against a real DOM caught
 * the version that assumed content was already there when this effect ran).
 *
 * `testID` (C-3b) is `${d.name}-frame` per entry, for tests that need to
 * address one dialog's wrapper directly. `accessibilityViewIsModal` was
 * tried here too and reverted: React Native Testing Library (and, per its
 * own docs, a real screen reader) treats it as "hide every OTHER tree from
 * queries while this one is open" — fine for one dialog alone, but this app
 * can have two open at once (a picker over a task card, S6-41), and setting
 * it on either broke the other's own content from being found, proven by
 * `tests/native/screens.test.tsx`'s existing two-overlay case going red the
 * moment it was added. The web half of C-3 keeps "announce me" (`role`) and
 * "hide the rest" (`inert` on the routed stack in `app/_layout.tsx`) as two
 * separate mechanisms for exactly this reason; native's one prop conflates
 * them, and doing this properly means moving the modal flag to wrap the
 * whole overlay region once — `useOverlayOpen()` already answers "is
 * anything open" for `app/_layout.tsx`'s own `inert` call, so that is where
 * it belongs, not per-dialog. Left undone rather than shipped half-checked.
 */
function DialogFrame({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const ref = useRef<View>(null);
  useEffect(() => installDialogA11y(ref.current), []);
  return (
    <View ref={ref} testID={testID} style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}

export function DialogHost() {
  const modal = useSessionStore((s) => s.modal);
  const modalPayload = useSessionStore((s) => s.modalPayload);
  const closeModal = useSessionStore((s) => s.closeModal);
  const sheet = useSessionStore((s) => s.sheet);
  const sheetPayload = useSessionStore((s) => s.sheetPayload);
  const closeSheet = useSessionStore((s) => s.closeSheet);
  const settingsOpen = useSessionStore((s) => s.settingsOpen);
  const settingsSection = useSessionStore((s) => s.settingsSection);
  const closeSettings = useSessionStore((s) => s.closeSettings);
  const openTaskId = useTaskCardStore((s) => s.openTaskId);
  const openTask = useTaskCardStore((s) => s.openTask);

  // S6-41: the scrim belongs to the outermost open overlay. The entries are in
  // z-order, so the first open one takes it and none above it paints another.
  let scrimTaken = false;
  return (
    <OverlayBoundary>
      <>
        {/* V-2: a voice session runs whether or not TalkScreen is mounted, so
            the banner lives with the overlays rather than in a tab — inside
            the gate (a locked screen must not carry it: the session ends with
            the lock) and rendered whether or not any dialog is open. */}
        <TalkBanner />
        {DIALOGS.map((d) => {
          // `open` is nullable state, `payload` is the string the entry's
          // `props` mapper reads. A dialog that needs a payload and has none
          // does not render at all — the old inline version wrote that as
          // `modalPayload != null &&` on eight separate lines.
          let open = false;
          let payload: string | null = null;
          let onClose: () => void = closeModal;

          switch (d.source) {
            case "modal":
              open = modal === d.name;
              payload = modalPayload ?? null;
              onClose = closeModal;
              break;
            case "sheet":
              open = sheet === d.name;
              payload = sheetPayload ?? null;
              onClose = closeSheet;
              break;
            case "settings":
              open = settingsOpen;
              payload = settingsSection ?? null;
              onClose = closeSettings;
              break;
            case "task":
              open = openTaskId != null;
              payload = openTaskId ?? null;
              onClose = () => openTask(null);
              break;
          }

          if (!open) return null;
          if (d.requiresPayload && payload == null) return null;
          const paintsScrim = !scrimTaken;
          scrimTaken = true;
          // S6-26: the entry's surface KIND is what `Dialog` sizes itself by —
          // provided here, where entries mount, so `render()` stays the bare
          // component and `dialogs.test.ts` can still read what it returns.
          // The fallback is RL-06's recorded `sheet`; `panel` for the rest is
          // the ux round's proposal and waits on that row (`dialogKit.tsx`).
          return (
            <DialogSurfaceContext.Provider key={d.name} value={d.surface ?? "sheet"}>
              <DialogScrimContext.Provider value={paintsScrim}>
                <DialogFrame testID={`${d.name}-frame`}>{d.render(payload ?? "", onClose)}</DialogFrame>
              </DialogScrimContext.Provider>
            </DialogSurfaceContext.Provider>
          );
        })}
      </>
    </OverlayBoundary>
  );
}
