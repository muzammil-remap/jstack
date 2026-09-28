/**
 * `<Dialog>` (RL-06) — phone: full screen. Desktop: 66vw, capped at the width
 * of its surface KIND (S6-26, `SURFACE_WIDTH`: a confirm 480, a panel inside
 * the Settings sheet 640, RL-06's recorded 900 for the rest) and at 90vh, and
 * otherwise HUGGING its content: the old
 * 60vh floor left the decision history standing 640px tall with two rows in
 * its top 220px and 66% empty frosted panel below, while the task detail
 * dialog beside it hugged — the app disagreeing with itself (ux-review
 * R2-10). README, Principles 2 defends blank space at the END of a list, not
 * a slab sized past it. A thin chrome (header with a close button + title)
 * around whatever content the caller renders; individual dialogs (Decision
 * history, Task detail, ...) are built row by row from here on.
 *
 * v2.3.2 WPR-3: an optional `footer` stays below the scrolling content — on a
 * phone the foot of the screen — for a control that belongs there, as Dictate
 * to EA's large orb does.
 */
import React, { useContext } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { WATERMARK_CLEARANCE } from "@/components/chrome/watermarkText";
import { useSessionStore } from "@/stores/session";
import { useLayout } from "@/theme/useLayout";
import { blur, radius } from "@/theme/tokens";
import { frostedStyle, Txt } from "@/theme/ui";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";
import { CloseButton, DialogScrimContext, DialogSurfaceContext, overlayBackdrop, SURFACE_WIDTH } from "@/layout/dialogKit";

export function Dialog({ title, onClose, children, footer, testID = "dialog" }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; testID?: string }) {
  const c = useTokens();
  const { phone } = useLayout();
  // S6-26: the width is the registry entry's surface kind, from one table
  const surface = useContext(DialogSurfaceContext);
  // S6-05: a dialog opened from INSIDE the Settings sheet (Sync, Devices, a
  // focus, the emergency confirm) sits on a surface that already carries the
  // pack's scrim. Painting a second one over it dimmed the sheet's own card to
  // (181,181,180) — darker than the app's light ground — and the page behind
  // by 45 levels more. One scrim: the sheet's, with the dialog's own shadow
  // and narrower width doing the work of saying which is on top.
  const overSettings = useSessionStore((s) => s.settingsOpen);
  // S6-41: the host hands the scrim to the outermost open overlay — the
  // delegate picker over the task card painted a second one (S6-05's class)
  const paintsScrim = useContext(DialogScrimContext) && !overSettings;

  return (
    <View
      testID={`${testID}-backdrop`}
      style={[overlayBackdrop(Z.dialog, paintsScrim), { alignItems: phone ? "stretch" : "center", justifyContent: "center" }]}
    >
      {/* C-3: out of the Tab order — Escape and the header's CloseButton are the
          keyboard paths to close, and a scrim in the tab sequence is a stray stop
          a keyboard/screen-reader user has no reason to land on before the dialog's
          own content. */}
      <Pressable testID={`${testID}-scrim`} accessibilityLabel="Close" onPress={onClose} tabIndex={-1} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View
        testID={testID}
        style={
          phone
            ? { flex: 1, width: "100%", backgroundColor: c.bar, paddingTop: 44, ...frostedStyle(blur.bar) }
            : // B3R2-09: the pack's ceiling is 900 (handoff.md Settings, "sheet
              // max-width 900"); 1000 put every dialog 100px past it at 1920.
              // S6-26: a confirm or a panel stops at its own kind's width
              // (`SURFACE_WIDTH`); the rest keep RL-06's recorded 900.
              { width: "66%", maxWidth: SURFACE_WIDTH[surface], maxHeight: "90%", borderRadius: radius.card, backgroundColor: c.bar, borderWidth: 1, borderColor: c.cardBorder, ...c.shadow.native, ...frostedStyle(blur.bar) }
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderBottomColor: c.hairline }}>
          <Txt kind="heading">{title}</Txt>
          <CloseButton testID={`${testID}-close`} onClose={onClose} />
        </View>
        {/* X1-11 (P-9): 90%, not 85% — at 1366 the task card ran 46 px past the
            fold and the ACTIVITY card's meta was sliced through its glyphs.
            The extra height cannot meet the demo watermark: a modal sends it
            to the foot (K1-03, `DemoWatermark.tsx`), below any 90% dialog.
            The content SCROLLS (ux-review B3R2-01). `maxHeight` caps the
            dialog but nothing inside it was scrollable, so Arrange at 1024
            ran past the bottom border and rendered "Revert to yesterday" and
            "Done" on the bare scrim, outside their own dialog. `flexShrink`
            rather than `flex: 1` on desktop keeps R2-10's hugging: a short
            dialog is still the height of its content, not a slab.
            On a phone the dialog covers the tab bar, so the demo watermark
            drops to the foot of the screen; the scroll box ends above it
            (ux-review R2-02, `watermarkText.ts`). */}
        <ScrollView style={phone ? { flex: 1, marginBottom: footer != null ? 0 : WATERMARK_CLEARANCE } : { flexShrink: 1 }} contentContainerStyle={{ padding: 16 }}>
          {children}
        </ScrollView>
        {/* WPR-3: the foot keeps the watermark's clearance on a phone, as the scroll box does without one */}
        {footer != null && (
          <View testID={`${testID}-footer`} style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: phone ? WATERMARK_CLEARANCE : 16 }}>
            {footer}
          </View>
        )}
      </View>
    </View>
  );
}
