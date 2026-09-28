/**
 * ScreenSurface — the surface a `screen`-kind dialog is rendered on.
 *
 * `layout/dialogs.tsx` says a `screen` "replaces the tab bar and the rail
 * while it is open", and `app/(tabs)/_layout.tsx` hides both. Nothing put a
 * surface over the TAB, so the first screen (Talk with EA, V-2) was laid out
 * as a flex sibling of the tabs: Brain squeezed into the top of the viewport
 * at full brightness, the conversation underneath it, the Memory card sliced
 * mid-row where the transcript began (ux-review R1-01, every `talk-*` frame).
 *
 * `Dialog` and `Sheet` carry their own absolute-fill backdrop; this is the
 * `screen` kind's. Opaque ground, edge to edge, above the tabs and below the
 * overlays that may open on top of a conversation (`Dialog`/`Sheet` sit at
 * 100, the gate at 110, the watermark at 150 — `DemoWatermark.tsx`).
 *
 * TS-01 / UX-J adds the second presentation. A conversation edge-to-edge on a
 * 1920 monitor stretched Talk's Reply row across two feet of glass and hid the
 * app behind it for no reason; on a phone, edge-to-edge is exactly right. So
 * the same kind renders two ways — `presentation: "panel"` on the registry
 * entry gives a centred 880 px column over a dimmed scrim at `bp.desktop` and
 * up, with the rail still visible behind it, and `"full"` (the default) is the
 * phone's. ONE flag, because Josh's open item was "panel or edge-to-edge" and
 * the answer has to be changeable in one place (resolution: panel).
 *
 * It is a presentation, not a second kind: `dialogs.test.ts` still asserts
 * Talk is the app's only `screen`, and the panel is that screen's inner column.
 */
import React from "react";
import { View } from "react-native";
import { useTokens } from "@/theme/ThemeProvider";
import { bp, misc, radius, space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import { Z } from "@/layout/zorder";

/** UX-J: the reading width a conversation gets on a desktop. Not exported —
 * TS-01 pins 880 as a literal in the e2e, because a test that imports the
 * number it is checking asserts only that a constant equals itself. */
const SCREEN_PANEL_WIDTH = 880;

export function ScreenSurface({ children, presentation = "full" }: { children?: React.ReactNode; presentation?: "full" | "panel" }) {
  const c = useTokens();
  const { width } = useLayout();
  const asPanel = presentation === "panel" && width >= bp.desktop;

  if (!asPanel) {
    return (
      <View testID="screen-surface" style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: c.ground, zIndex: Z.screen }}>
        {children}
      </View>
    );
  }

  return (
    <View
      testID="screen-surface"
      // the scrim dims the app rather than hiding it: the rail stays usable
      // behind the panel, which is what makes this a panel and not a screen
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: misc.scrim, zIndex: Z.screen, alignItems: "center", justifyContent: "center", padding: space[4] }}
    >
      <View
        testID="screen-panel"
        style={{
          width: "100%",
          maxWidth: SCREEN_PANEL_WIDTH,
          // tall, but never the whole window — the app it sits over stays
          // visible at top and bottom, the same 85% Sheet uses on a phone
          maxHeight: "85%",
          flex: 1,
          backgroundColor: c.ground,
          borderRadius: radius.card,
          borderWidth: 1,
          borderColor: c.cardBorder,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}
