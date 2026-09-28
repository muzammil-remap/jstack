/**
 * SettingsSheet — SE-01/SE-09: opens from the rail (desktop) or the
 * header button (phone); scrim, X, or Esc closes (Esc already routes
 * through app/_layout.tsx's global shortcut → closeAll()). One long
 * scrolling dialog, not tabs (mock v11 `settingsDlg()`): Notifications
 * full-width, then a responsive grid — one column below 1180px, two
 * above (`useLayout().columns === 3`) — holding Appearance, Schedules,
 * Autonomy, Security and behaviour, Voice, and Focus filters, in that
 * order. Phone: full
 * screen, 12px padding. `payload` optionally names a section id to
 * scroll to on open (AG-08's "schedules" hint).
 */
import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { WATERMARK_CLEARANCE } from "@/components/chrome/watermarkText";
import { Appearance } from "@/components/settings/Appearance";
import { Autonomy } from "@/components/settings/Autonomy";
import { Rules } from "@/components/settings/Rules";
import { Focuses } from "@/components/settings/Focuses";
import { Notifications } from "@/components/settings/Notifications";
import { Schedules } from "@/components/settings/Schedules";
import { Security } from "@/components/settings/Security";
import { Voice } from "@/components/settings/Voice";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";
import { frostedStyle, Txt } from "@/theme/ui";
import { useLayout } from "@/theme/useLayout";
import { blur, misc, radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { Z } from "@/layout/zorder";

export function SettingsSheet({ payload, onClose }: { payload?: string; onClose: () => void }) {
  const c = useTokens();
  const { phone, columns } = useLayout();
  const devices = useSettingsStore((s) => s.devices);
  const loadDevices = useSettingsStore((s) => s.loadDevices);
  const toastInset = useUiStore((s) => s.toastInset);
  const scrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (payload == null) return;
    const y = sectionY.current[payload];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
  }, [payload]);

  const onSectionLayout = (id: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionY.current[id] = e.nativeEvent.layout.y;
  };

  // Below 1180 the two halves become ONE flat column. Nesting them as two
  // stacked sub-columns kept each half's own `gap`, so the seam between them
  // opened a ~98px band of empty scrim at 393 against 49px everywhere else
  // (ux-review R2-07). `alignItems: flex-start` keeps a short section from
  // being stretched to its neighbour's height at three columns.
  // F-66 (P-13): the six sections ONCE, split into the two halves the three-
  // column layout shows side by side; below 1180 they are one flat column, so
  // the seam between the halves keeps the same gap as everything else
  // (ux-review R2-07). `alignItems: flex-start` keeps a short section from
  // being stretched to its neighbour's height at three columns.
  const section = (key: string, node: React.ReactNode, anchor?: string) => (
    <View key={key} {...(anchor != null ? { onLayout: onSectionLayout(anchor) } : {})}>
      {node}
    </View>
  );
  const left = [section("appearance", <Appearance />, "appearance"), section("schedules", <Schedules />, "schedules")];
  const right = [
    section(
      "autonomy",
      <>
        <Autonomy />
        <Rules />
      </>,
      "autonomy",
    ),
    section("security", <Security />),
    section("voice", <Voice />, "voice"),
    section("focuses", <Focuses />),
  ];
  const grid =
    columns === 3 ? (
      <View style={{ flexDirection: "row", gap: space[4], alignItems: "flex-start" }}>
        <View style={{ flex: 1, gap: space[4] }}>{left}</View>
        <View style={{ flex: 1, gap: space[4] }}>{right}</View>
      </View>
    ) : (
      <View style={{ gap: space[4] }}>
        {left}
        {right}
      </View>
    );
  return (
    <View
      testID="settings-backdrop"
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: misc.scrim, alignItems: "center", justifyContent: "center", paddingBottom: phone ? 0 : toastInset, zIndex: Z.sheet, ...frostedStyle(misc.scrimBlur) }}
    >
      <Pressable testID="settings-scrim" accessibilityLabel="Close" onPress={onClose} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} />
      <View
        testID="settings-sheet"
        style={
          phone
            ? { flex: 1, width: "100%", backgroundColor: c.bar, padding: 12, ...frostedStyle(blur.bar) }
            : { width: "92%", maxWidth: 900, maxHeight: "92%", borderRadius: radius.card, backgroundColor: c.bar, borderWidth: 1, borderColor: c.cardBorder, padding: 18, ...c.shadow.native, ...frostedStyle(blur.bar) }
        }
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <View>
            <Txt kind="heading">Settings</Txt>
            <Txt kind="meta" style={{ marginTop: 2 }}>One account · {devices.length} devices · changes save as you make them</Txt>
          </View>
          <Pressable testID="settings-close" accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={8} style={{ minHeight: 36, minWidth: 36, alignItems: "center", justifyContent: "center" }}>
            <Icon name="close" size={20} color={c.muted} />
          </Pressable>
        </View>
        {/* on a phone the sheet covers the tab bar, so the demo watermark
            drops to the foot of the screen; the scroll box ends above it
            (ux-review R2-02, `watermarkText.ts`) — and above a showing
            toast's band (S6-13, `ui.toastInset`: the pill covered two
            Settings rows at 1366; on a desktop the backdrop's padding keeps
            the band below the sheet's foot, so the foot moves and the head
            stays) */}
        <ScrollView ref={scrollRef} testID="settings-scroll" style={{ flex: 1, marginBottom: phone ? Math.max(WATERMARK_CLEARANCE, toastInset) : 0 }} contentContainerStyle={{ gap: space[4] }}>
          <Notifications />
          {grid}
        </ScrollView>
      </View>
    </View>
  );
}
