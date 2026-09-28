/**
 * DemoWatermark (I-1, ID-02) — the one line that says this is not real data.
 *
 * Josh shows this app to people. A demo running on fixtures looks exactly
 * like a demo running on his actual life, and the difference matters most in
 * the moment nobody is thinking about it: a screenshot, a shared screen, a
 * phone handed across a table. So the app says which one it is, permanently,
 * in the quietest way that still cannot be missed once you look.
 *
 * It is driven by `USE_API_ADAPTER` — the same flag that decides whether the
 * app talks to a real backend at all (`data/config.ts`) — so it cannot
 * disagree with reality. There is no prop to turn it off and no setting to
 * hide it: a watermark somebody can switch off is decoration.
 *
 * Placement: bottom-left, above the tab bar on a phone, at the foot of the
 * rail on desktop, so it never sits over a control. Mounted at the root and
 * OUTSIDE the gated subtree, above the gate's own layer — the locked screen
 * is the most likely thing on the phone somebody else is holding, so it is
 * the one screen the warning must not be missing from (ID-02).
 */
import React from "react";
import { View } from "react-native";
import { useBannerUp } from "@/components/chrome/MicBanner";
import { RAIL_FOOT } from "@/components/chrome/Rail";
import { DEMO_WATERMARK_TEXT } from "@/components/chrome/watermarkText";
import { USE_API_ADAPTER } from "@/data/config";
import { useSessionStore } from "@/stores/session";
import { useTaskCardStore } from "@/stores/taskCard";
import { useUiStore } from "@/stores/ui";
import { Txt } from "@/theme/ui";
import { misc, radius, space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import { useTokens } from "@/theme/ThemeProvider";
import { useScreenDialogOpen } from "@/layout/dialogs";
import { Z } from "@/layout/zorder";

// The words live in `watermarkText.ts` — a file with no react-native import,
// so the e2e spec can read the string without loading this component.

/**
 * Whether the mark is on screen. It was exported for `layout/TabScreen.tsx`
 * while the page's band was asked per state; the band is a constant on a phone
 * now (a band that flickers moves the content behind a dialog — see
 * `TabScreen.tsx`), so this is the component's own again.
 */
function useWatermarkUp(): boolean {
  const editorExpanded = useUiStore((s) => s.editorExpanded);
  const bannerUp = useBannerUp();
  const { phone } = useLayout();
  if (USE_API_ADAPTER) return false;
  if (editorExpanded) return false;
  if (phone && bannerUp) return false;
  return true;
}

export function DemoWatermark() {
  const c = useTokens();
  const { phone } = useLayout();
  const up = useWatermarkUp();
  // a `screen`-kind dialog replaces the tab bar and the rail, so there is
  // nothing in the corner to clear — and the two offsets below, measured
  // against those, put the mark inside Talk's "or type" field at 393 and
  // through its Reply button's edge at 1366 (ux-review R1-02). The screen's
  // own bottom padding (`TalkScreen.tsx`) keeps its controls above the line.
  const onScreen = useScreenDialogOpen();
  // ux-review R2-02: on a phone a full-bleed dialog, the Settings sheet, a
  // bottom sheet and an open task ALSO cover the tab bar, so the offset
  // measured against the bar put the mark across the Settings sheet's rows
  // and inside a dialog's scroll box. Every surface that covers the bar
  // keeps `WATERMARK_CLEARANCE` free at its foot (`Dialog`, `Sheet`,
  // `SettingsSheet`, `TalkScreen`), and the mark drops to the foot, as it
  // does for a `screen`. A toast shares the band above the bar and printed
  // over the mark from x=98 — and moving the MARK for it was wrong (ux-review
  // R3-01: the raised chip painted out the content it landed on), so the
  // toast is what steps over the mark (`Toast.tsx`); the mark never moves.
  const overlay = useSessionStore((s) => s.modal != null || s.sheet != null || s.settingsOpen);
  const taskOpen = useTaskCardStore((s) => s.openTaskId != null);
  // K1-03 (P-9): a centred MODAL on a tablet or desktop reaches the mark's
  // band — Find at 1024 met it at the panel's bottom-left corner — so a modal
  // and the task card send the mark to the foot at every width, as the
  // phone's overlays already did. A sheet and the settings panel keep the
  // desktop rule: neither is centred, and neither reaches the band.
  const modalOpen = useSessionStore((s) => s.modal != null);
  const atFoot = onScreen || (phone && (overlay || taskOpen)) || modalOpen || taskOpen;

  // `useWatermarkUp()` above holds the three reasons the mark is not on
  // screen, so that the page which reserves its band and the mark itself can
  // never disagree (A-6):
  //   · USE_API_ADAPTER — on a real backend there is nothing to warn about;
  //   · TE-03 — while a field is the expanded editor the mark gets out of the
  //     way entirely rather than being stepped over: the editor takes up to
  //     85% of the band above the keyboard, so there is no band left to share,
  //     and unlike a toast the mark has nothing to say while somebody writes;
  //   · S6-02 — on a phone the mark and a bottom banner share the band above
  //     the tab bar, and the mark's chip painted over the whole of "Mic on ·
  //     listening for Brain", the warning JOSH_QA_v22 item 11 exists for. The
  //     banner is the one a person must read, so the mark yields while it is
  //     up. On a desktop the mark is at the rail's foot, which the banner
  //     never reaches.
  if (!up) return null;

  return (
    <View
      testID="demo-watermark"
      pointerEvents="none"
      style={{
        position: "absolute",
        left: space[3],
        // Clear of the tab bar on a phone — which is 60px tall, so `space[6]`
        // (12) put the watermark ON it. Caught by ID-02's own "sits clear of
        // the controls it must not cover" at 393; it read fine at 1366,
        // where there is no bar at all.
        // `misc.barHeight` is the bar's own 60, but its rendered box is ~73
        // with padding and the safe-area inset, so barHeight + 8 still sat 5px
        // inside it. The gap is measured against what the bar actually
        // occupies, not against the token.
        // On DESKTOP the rail's own foot occupies that corner — the health
        // line ("needs attention · $0.42") and, since SY-1, the sync row
        // above it — and the watermark printed straight over it, in the same
        // muted token, on all 24 desktop frames of the device pass (B-32,
        // ux-review B3R1-04). The offset was 40, measured against the health
        // line alone, and when the sync row arrived the chip sat exactly on
        // it: on every desktop frame of the Stage 6 pass the row was there and
        // could not be seen (S6-06). `RAIL_FOOT` is what the rail renders
        // below its spacer, the same way the phone offset above is measured
        // against the tab bar rather than against `misc.barHeight`.
        // v2.3.2 WPR-1: on a phone the mark sits on the tab bar's top edge (the bar's inset, its height, a hairline
        // step) rather than a band above it — the page no longer ends above a band, so the mark takes one line, not a
        // strip across the screen.
        bottom: atFoot ? space[3] : phone ? misc.barInset + misc.barHeight + space[1] : space[3] + RAIL_FOOT,
        // above the gate (110) so it is on the locked screen too, below the
        // privacy shield (200), which is meant to cover everything
        zIndex: Z.watermark,
        // Its own ground, behind its own ink (ux-review R2-01). Sitting above
        // every overlay means an open dialog does not cover the mark — it
        // dims the page under it, and Muted ink on the scrimmed ground read
        // 1.7:1 on every light desktop overlay frame (1.07:1 under two
        // scrims). README Accessibility documents the legible pair, "Muted on
        // Card 4.6:1"; painting the ground here makes that pair true wherever
        // the mark lands. On the bare ground the backing is invisible.
        backgroundColor: c.ground,
        borderRadius: radius.tag,
        paddingHorizontal: space[2],
        paddingVertical: space[1],
      }}
    >
      {/* `small` IS the 11px step in the scale (theme/tokens.ts `type.small`);
          an inline fontSize here would be both a lint error and a second
          place the type scale lives. */}
      <Txt kind="small" tone="muted">
        {DEMO_WATERMARK_TEXT}
      </Txt>
    </View>
  );
}
