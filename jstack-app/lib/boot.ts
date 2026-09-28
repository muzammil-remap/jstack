/**
 * The app's boot sequence (S-3): everything `app/_layout.tsx` used to do in
 * one long effect — the test hook, the two stores the shell itself reads,
 * the keyboard and auto-lock listeners, and the desktop shortcut map.
 *
 * Lifted out so the root layout stays under SM-05's 100 lines. It is a hook
 * rather than a plain function because it owns real subscriptions with real
 * teardown; the layout calls it once and nothing else does.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import { approveCard, keyableCard, laterCard, overlayOver, reviseCard } from "@/lib/cardVerbs";
import { keyVerbLands } from "@/lib/pressGate";
import { useTaskCardStore } from "@/stores/taskCard";
import type { ActionItem } from "@/data/types";
import { useFonts } from "expo-font";
import { InstrumentSans_400Regular, InstrumentSans_500Medium, InstrumentSans_600SemiBold } from "@expo-google-fonts/instrument-sans";
import { SourceSerif4_400Regular, SourceSerif4_500Medium } from "@expo-google-fonts/source-serif-4";
import { installWebScrollbars } from "@/lib/webScrollbars";
import { installAutoLock } from "@/lib/autoLock";
import { installKeyboardListeners } from "@/lib/keyboard";
import { registerServiceWorker } from "@/lib/pwa";
import { installShortcuts } from "@/lib/shortcuts";
import { subscribeServerEvents } from "@/lib/serverEvents";
import { installSync } from "@/lib/syncInstall";
import { loadUnconfirmedLock } from "@/lib/emergencyLock";
import { installTestHook } from "@/lib/testBuild";
import { useAgentsStore } from "@/stores/agents";
import { useParametersStore } from "@/stores/parameters";
import { openFromUrl } from "@/lib/openFromUrl";
import { useOpenFind } from "@/layout/find";
import { useSessionStore } from "@/stores/session";
import { TABS } from "@/layout/tabRoutes";
import { useSettingsStore } from "@/stores/settings";
import { useLayout } from "@/theme/useLayout";

/** the keys' card, handed to `act` only when there is one they may answer */
function withKeyableCard(today: boolean, act: (card: ActionItem) => void): void {
  const card = keyableCard(today);
  // A4R11-01: answering a card promotes the next into its slot, so a second
  // verb pressed inside the settle window would answer a card nobody has read
  if (card != null && keyVerbLands(card.id)) act(card);
}

export function useAppBoot(): void {
  const router = useRouter();
  const closeAll = useSessionStore((s) => s.closeAll);
  const undoLatest = useSessionStore((s) => s.undoLatest);
  const openFind = useOpenFind();
  // the router's own word for whether Today is showing, read by the keys at the
  // moment they are pressed (A4R9-01)
  const pathname = usePathname();
  const onToday = useRef(pathname === TABS[0].path);
  useEffect(() => {
    onToday.current = pathname === TABS[0].path;
  }, [pathname]);
  // C-5: the letter deck belongs to the Expanded (non-phone) layout — read
  // the same way, a ref the keydown closure checks fresh at press time.
  const { phone } = useLayout();
  const expandedRef = useRef(!phone);
  useEffect(() => {
    expandedRef.current = !phone;
  }, [phone]);

  useEffect(() => {
    installTestHook();
    // WPF-4: a lock the server was never told about comes back up before anything loads
    void loadUnconfirmedLock();
    // P-1: offline shell loading. Production web only — a worker in the test
    // build would serve Playwright a cached shell between specs.
    registerServiceWorker();
    void useSettingsStore.getState().load(); // notifications, quiet hours, autonomy, voice, focuses, appLayout, capabilities
    // The health line lives in the RAIL and the phone header, i.e. on every
    // tab — but only app/(tabs)/agents.tsx used to load the summary it reads,
    // so until Agents was opened the chrome asserted "all healthy · $0.00"
    // from a null summary while Agents itself said "needs attention · $0.42"
    // in the same session (ux-review R3-02). It is the shell's data, so the
    // shell fetches it.
    void useAgentsStore.getState().load();
    // L-1: the six tunables, before the lock timer needs one. `installAutoLock`
    // below arms from the table's defaults and re-arms when this lands, so a
    // slow first request cannot leave the app unlocked on the old constant.
    void useParametersStore.getState().load();
    const removeKeyboard = installKeyboardListeners();
    const removeAutoLock = installAutoLock();
    // D-1/ADR-36: one subscription to the server's event stream for the life
    // of the app, torn down with the others so a fast refresh in development
    // does not stack a second listener on top of the first.
    const removeServerEvents = subscribeServerEvents();
    // O-1: online/offline listeners, the focus retry and the 30s timer that
    // only runs while something is queued.
    const removeSync = installSync();
    // RP-04: a notification click arrives as `/<tab>?ref=<ref>`. Read once, at
    // boot, after the stores above have been asked to load — the dialog it
    // opens reads its record from a store, so opening it earlier would show
    // the empty state for a frame.
    openFromUrl();
    const removeShortcuts = installShortcuts({
      onTab: (n) => router.navigate(TABS[n - 1].path),
      onEscape: () => closeAll(),
      // K-1: Cmd/Ctrl+K opens FIND, which is what the shortcut has always
      // been called. Before this it navigated to Brain and left the person to
      // find the field themselves — a shortcut that takes you near the thing.
      onFind: openFind,
      // A4R9-10: only the undo the toast still offers — a plain toast that took
      // its place hid the Undo button, and Ctrl+Z reverted what was off the screen
      onUndo: () => {
        if (useSessionStore.getState().toast?.undoLabel != null) void undoLatest();
      },
      // A4R9-01/02: the card's own verbs (`lib/cardVerbs.ts`), and only where its
      // buttons are there to press — Today showing, nothing over it, online
      onApprove: () => withKeyableCard(onToday.current, (card) => void approveCard(card)),
      onRevise: () => withKeyableCard(onToday.current, reviseCard),
      onLater: () => withKeyableCard(onToday.current, (card) => void laterCard(card)),
      hasOpenCard: () => keyableCard(onToday.current) != null,
      // C-2: the same question `useOverlayOpen` (layout/dialogs.tsx) answers,
      // asked imperatively since the key handler is not a component
      hasOpenOverlay: () => overlayOver(useSessionStore.getState(), useTaskCardStore.getState().openTaskId != null),
      isExpandedLayout: () => expandedRef.current,
    });
    return () => {
      removeServerEvents();
      removeSync();
      removeKeyboard();
      removeAutoLock();
      removeShortcuts();
    };
  }, [router, closeAll, undoLatest, openFind]);
}

/**
 * Loads the five faces and, on web, installs them under the pack's family
 * names. Returns whether they are ready — the layout holds the splash until
 * they are (ADR-10).
 *
 * DS-02 used to be solved here, at runtime, by `lib/webFonts.ts` — expo-font
 * registers each face under its IMPORT KEY (`InstrumentSans_400Regular`)
 * while the pack's stacks ask for `'Instrument Sans'`, so every stack fell
 * through to its fallback and the app rendered in the OS UI font. S-4
 * replaced that 140-line workaround with real `@font-face` rules in
 * `app/+html.tsx` against the files in `public/fonts/`, and deleted it.
 * `useFonts` stays because NATIVE still resolves the import keys
 * (`theme/tokens.ts`'s `Platform.select`), and the splash still holds until
 * the faces are ready (ADR-10).
 */
export function useAppFonts(): boolean {
  const [fontsLoaded] = useFonts({
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
    SourceSerif4_400Regular,
    SourceSerif4_500Medium,
  });
  useEffect(() => {
    if (fontsLoaded) installWebScrollbars();
  }, [fontsLoaded]);
  return fontsLoaded;
}
