/**
 * `<Sheet>` (RL-06) — phone: from the bottom, full width. Desktop: 420
 * wide, bottom-right (the Settings sheet is the one exception, SE-09,
 * built in row 16 on top of this same primitive).
 */
import React from "react";
import { Pressable, View } from "react-native";
import { WATERMARK_CLEARANCE } from "@/components/chrome/watermarkText";
import { useLayout } from "@/theme/useLayout";
import { blur, radius } from "@/theme/tokens";
import { frostedStyle, Txt } from "@/theme/ui";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";
import { CloseButton, DialogScrimContext, overlayBackdrop } from "@/layout/dialogKit";

export function Sheet({ title, onClose, children, testID = "sheet" }: { title?: string; onClose: () => void; children: React.ReactNode; testID?: string }) {
  const c = useTokens();
  const { phone } = useLayout();
  // S6-41: one scrim, the outermost — the host says whether one is already under this sheet
  const paintsScrim = React.useContext(DialogScrimContext);

  return (
    <View testID={`${testID}-backdrop`} style={overlayBackdrop(Z.sheet, paintsScrim)}>
      {/* C-3: out of the Tab order — see Dialog.tsx's own scrim for why. */}
      <Pressable testID={`${testID}-scrim`} accessibilityLabel="Close" onPress={onClose} tabIndex={-1} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View
        testID={testID}
        style={
          phone
            ? // a phone sheet covers the tab bar, so the demo watermark drops to
              // the foot of the screen; the sheet's verbs stay above it
              // (ux-review R2-02, `watermarkText.ts`)
              { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "85%", borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, backgroundColor: c.bar, padding: 16, paddingBottom: 16 + WATERMARK_CLEARANCE, ...frostedStyle(blur.bar) }
            : { position: "absolute", right: 24, bottom: 24, width: 420, maxHeight: "80%", borderRadius: radius.card, backgroundColor: c.bar, borderWidth: 1, borderColor: c.cardBorder, padding: 16, ...c.shadow.native, ...frostedStyle(blur.bar) }
        }
      >
        {title != null && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Txt kind="sheetTitle">{title}</Txt>
            <CloseButton testID={`${testID}-close`} onClose={onClose} size={18} />
          </View>
        )}
        {children}
      </View>
    </View>
  );
}
