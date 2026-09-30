/**
 * `.js-toast` (design/tokens/components.css) — a pill toast with an
 * optional undo ring counting down from `motion.undoSeconds` (10) to 0.
 * Reads stores/session.ts's toast + undo ledger (ADR-04): `pushUndo()`
 * both records the undoable mutation's revert and shows the toast;
 * `toast()` below is for the plain, non-undoable case.
 */
import React, { useEffect, useRef } from "react";
import { Pressable, View } from "react-native";
import { Txt } from "@/theme/ui";
import { pressLands } from "@/lib/pressGate";
import { noOrphan } from "@/lib/richText";
import { bannerClearance } from "@/components/chrome/BottomBanner";
import { useBannerUp } from "@/components/chrome/MicBanner";
import { WATERMARK_CLEARANCE } from "@/components/chrome/watermarkText";
import { USE_API_ADAPTER } from "@/data/config";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";
import { useLayout } from "@/theme/useLayout";
import { misc, pagePadPhone, radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";

/** how long a plain toast stays. Undo toasts have their own clock (`motion.undoSeconds`). */
export const TOAST_MS = 3000;

/** The pack's "fixed bottom centre: 90 on phone, 24 desktop" (README
 * Components). The demo watermark shares the band above the phone's tab
 * bar: R-27 moved the MARK up while a toast was showing and its ground chip
 * then painted out whatever content it landed on (ux-review R3-01). The
 * mark stays put; while it renders, the phone toast sits
 * `WATERMARK_CLEARANCE` above the pack's 90 (DISCREPANCIES row 22). On a
 * real backend there is no mark and the toast is at the pack's number. */
export const TOAST_BOTTOM = { phone: 90, desktop: 24 } as const;
const phoneBottom = TOAST_BOTTOM.phone + (USE_API_ADAPTER ? 0 : WATERMARK_CLEARANCE);
/**
 * S6-13/S6-18: a bottom banner shares the band too — the pack's 60px bar on
 * a desktop sits exactly where the toast's 24 lands — and the toast steps
 * over it the same way: one step above the banner's top while one is up. The
 * band itself is `bannerClearance` in `BottomBanner.tsx`, beside the offset
 * and height it derives from, because the tab page ends above that same band
 * (A4-03) and two copies would drift the moment the bar changed.
 *
 * On a desktop the pill is a reading width; on a phone the page padding is
 * the edge (S6-13).
 */
const DESKTOP_MAX_WIDTH = 480;

/** A plain toast, no undo. It leaves on its own: the host below owns the
 * clock for every toast it shows, however the toast was raised (B-130). */
export function toast(message: string): void {
  useSessionStore.getState().showToast(message);
}

export function ToastHost() {
  const c = useTokens();
  const { phone } = useLayout();
  const toastState = useSessionStore((s) => s.toast);
  const undoCount = useSessionStore((s) => s.undo.entries.length);
  const expireUndo = useSessionStore((s) => s.expireUndo);
  const undoLatest = useSessionStore((s) => s.undoLatest);
  const bannerUp = useBannerUp();
  const setToastInset = useUiStore((s) => s.setToastInset);
  const heightRef = useRef(0);

  // B-130: the 3-second timer used to live in `toast()` above, and twenty
  // store callers raised the pill through `showToast` without it — "Saved
  // here · syncs when you're back online" and "Synced · 1 capture" sat at the
  // foot of the screen until the next toast replaced them, which the A-2
  // device pass photographed four times. The component that SHOWS a toast
  // hides it: whatever is showing leaves after TOAST_MS unless it carries an
  // undo countdown, which is its own clock (`expireUndo`). Keyed on the
  // object, and cleaned up when it changes, so a newer toast is never cleared
  // by an older one's timer — and no timer outlives the host (CD-11).
  useEffect(() => {
    if (toastState == null || toastState.undoLabel != null) return;
    const id = setTimeout(() => {
      if (useSessionStore.getState().toast === toastState) useSessionStore.getState().hideToast();
    }, TOAST_MS);
    return () => clearTimeout(id);
  }, [toastState]);

  useEffect(() => {
    if (undoCount === 0) return;
    const id = setInterval(() => {
      expireUndo();
      useSessionStore.setState((s) => (s.toast?.secondsLeft != null ? { toast: { ...s.toast, secondsLeft: Math.max(0, s.toast.secondsLeft - 1) } } : {}));
    }, 1000);
    return () => clearInterval(id);
  }, [undoCount, expireUndo]);

  // S6-13: the band this toast occupies — its offset, its measured box and
  // one step — is published as `ui.toastInset` for the surfaces that end
  // above it (the tab page, the settings sheet), and given back the moment
  // the toast leaves. The pill sat on a waiting row's Approve at 393 and on
  // two Settings rows at 1366; the host is the one component that knows both
  // where the pill is and how tall it came out.
  const bottom = phone ? Math.max(phoneBottom, bannerUp ? bannerClearance(true) : 0) : bannerUp ? bannerClearance(false) : TOAST_BOTTOM.desktop;
  useEffect(() => {
    if (toastState == null) {
      heightRef.current = 0;
      setToastInset(0);
    } else if (heightRef.current > 0) {
      setToastInset(bottom + heightRef.current + space[3]);
    }
  }, [toastState, bottom, setToastInset]);

  if (toastState == null) return null;
  const { message, undoLabel, secondsLeft } = toastState;
  return (
    // AUDIT/ux-review R11-01..03, all three in this one block, and all three
    // only findable once the device pass started photographing the toast at
    // all (B-94).
    //
    // Centring: `left: "50%"` with a CONSTANT `translateX(-140)` centres a pill
    // that is exactly 280 wide. The phone's is 196, so it sat 42px left of
    // centre — 57px of ground on one side and 140 on the other, directly above
    // a tab bar inset a symmetric 14/14. Stretching the wrapper edge to edge
    // and centring the child is width-independent, which is what "fixed bottom
    // centre" means (README Components).
    //
    // Offset: the pack says "90 on phone, 24 desktop"; it was 90 everywhere.
    // R17-01: the toast sits above the overlays and below the gate; the order is in `layout/zorder.ts`.
    // B8-01 moved this host INSIDE the app-content wrapper so that one `inert`
    // could switch it off with everything else while the app is locked. That
    // was right and it is still right; what it also did was move the toast out
    // of its own stacking context and into the one every Dialog and Sheet
    // lives in, where an unset z-index loses to their 100. Unlocked, with any
    // overlay open, the Undo was invisible AND unclickable — `elementFromPoint`
    // at its own centre returned the dialog's scrim, which is the DISMISS
    // target, so reaching for Undo closed the dialog instead. Nine call sites
    // raise a toast from inside an overlay, so it was routinely born behind
    // the surface that raised it. Mock v11 pins the same order by hand
    // (`#toast` 40 > `.sheet` 35 > `.ov` 30, all under `.lock` 50).
    //
    // 105 sits inside the wrapper, so it cannot climb over the gate: while
    // locked the whole wrapper is inert and the gate still wins the hit test.
    //
    // S6-13: the pill may be as wide as the page padding allows on a phone
    // (353 at 393, not 248) and a reading width on a desktop, and it WRAPS
    // rather than ellipsising — the sentence that says what you just did was
    // being cut mid-word, ending on a dangling middle dot. R12-01 had clamped
    // it to 248 to spare the mic orb, which shares the band at 393; the orb
    // steps aside while a toast is up instead (`Orb.tsx`), so the band is the
    // toast's for the ten seconds it has something to say.
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        paddingHorizontal: phone ? pagePadPhone.sides : 0,
        alignItems: "center",
        zIndex: Z.toast,
      }}
    >
    <View
      testID="toast"
      onLayout={(e) => {
        heightRef.current = e.nativeEvent.layout.height;
        setToastInset(bottom + heightRef.current + space[3]);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: radius.card,
        backgroundColor: c.selected,
        maxWidth: phone ? "100%" : DESKTOP_MAX_WIDTH,
      }}
    >
      <Txt kind="chip" style={{ color: c.onSelected, flexShrink: 1 }}>
        {/* S6-50: the last two words bound, so a wrapped line never splits a date */}
        {noOrphan(message)}
      </Txt>
      {undoLabel != null && (
        <Pressable
          testID="toast-undo"
          accessibilityRole="button"
          accessibilityLabel={undoLabel}
          // A4R11-01: the toast arrives under the finger that raised it — a
          // second press at that point would take back the write they meant
          // a revert that fails comes back, with this toast, while its window lasts (A4R7-12): that is the answer, not a rejection
          onPress={(e) => (pressLands("toast-undo", e) ? void undoLatest().catch(() => undefined) : undefined)}
          // AUDIT_v2.md B4-01: this rendered 54 x 18 — the Undo control behind
          // UN-01..04 and every Done/Approved/Accepted toast, under the 36px
          // floor 01_APP_SPEC.md §13 vetoes breaking. GL-05 read PASS only
          // because the sweep never ran with a toast on screen.
          style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 8 }}
        >
          <Txt kind="chip" weight="emphasis" style={{ color: c.onSelected }}>{undoLabel}</Txt>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: misc.toastRingBorder,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt kind="micro" style={{ color: c.onSelected }}>{secondsLeft ?? 0}</Txt>
          </View>
        </Pressable>
      )}
    </View>
    </View>
  );
}
