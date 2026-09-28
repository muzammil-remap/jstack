/**
 * The 200px rail (≥768, RL-02/03/04) — wordmark, the five tabs (filled
 * icon + accent-ink on the active one, GL-07), a separator, Find and
 * Settings, and the health line at the bottom (RL-05).
 */
import React from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { Txt } from "@/theme/ui";
import { hoverSurface, useHover } from "@/theme/ui/hover";
import { SyncDot } from "@/components/chrome/SyncDot";
import { HealthLine } from "@/components/chrome/HealthLine";
import type { IconName } from "@/components/chrome/icons.generated";
import { micIsOpen, useMicStore } from "@/stores/mic";
import { useVoiceStore } from "@/stores/voice";
import { useTokens } from "@/theme/ThemeProvider";
import { misc, radius, type as typeScale } from "@/theme/tokens";
import { TABS, type TabId } from "@/layout/tabRoutes";

/**
 * What the rail renders below its spacer, for the chrome that must clear it
 * (`DemoWatermark.tsx`, S6-06): the health line — 12px padding either side of
 * an 11px line, ~39 — and the sync row above it, whose `minHeight` is 38
 * (`SyncDot.tsx`, GL-04). A literal measured against what renders, like the
 * 40 it replaces, rather than derived from the type scale: the point is that
 * the mark's offset moves WITH this foot, and the number is asserted where it
 * matters — `e2e/core/offline.spec.ts` SY-02, the mark clear of the row.
 */
export const RAIL_FOOT = 39 + 38;

export function Rail({ active, onTab, onFind, onSettings, hiddenTabs = [] }: { active: TabId; onTab: (id: TabId) => void; onFind: () => void; onSettings: () => void; hiddenTabs?: string[] }) {
  const talking = useVoiceStore((s) => s.running);
  const micOpen = useMicStore(micIsOpen);
  const c = useTokens();
  const tabs = TABS.filter((t) => !hiddenTabs.includes(t.id));

  return (
    <View testID="rail" style={{ width: misc.railWidth, flexShrink: 0, height: "100%", paddingTop: 22, paddingHorizontal: 12, gap: 2, borderRightWidth: 1, borderRightColor: c.hairline }}>
      <Txt kind="wordmark" style={{ marginBottom: 14 }}>JSTACK</Txt>
      {tabs.map((t) => (
        <RailItem key={t.id} testID={`tab-${t.id}`} role="tab" icon={t.icon} label={t.label} active={t.id === active} onPress={() => onTab(t.id)} />
      ))}
      <View style={{ height: 1, backgroundColor: c.hairline, marginVertical: 8 }} />
      <RailItem testID="rail-find" role="button" icon="search" label="Find" onPress={onFind} />
      <RailItem testID="rail-settings" role="button" icon="settings" label="Settings" onPress={onSettings} />
      <View style={{ flex: 1 }} />
      {/* SY-02: above the health line, not in it. The two say different
          things — the health line is about the agents and the connection,
          this is about whether what you captured has landed — and a person
          who wants the second one wants it in the same place every time,
          which a line with three branches could not promise. */}
      <SyncDot withLabel />
      {/* the four branches, and why they are in that order, are `HealthLine`'s
          (F-41) — the rail passes the two the phone header does not have */}
      <HealthLine testID="rail-health" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12 }} talking={talking} micOpen={micOpen} />
    </View>
  );
}

/**
 * One rail entry — a tab, Find or Settings. Its own component so each can
 * own a `useHover()` (CD-17): a hook cannot be called per-item inside the
 * `tabs.map()` above, and the three shapes were already the same row of
 * icon-plus-label.
 *
 * Active is not a hover state: an active tab already carries the card
 * surface, so hovering it lifts that surface a step rather than inventing
 * a second treatment, and its text is accent ink either way.
 */
function RailItem({
  testID,
  role,
  icon,
  label,
  active = false,
  onPress,
}: {
  testID: string;
  role: "tab" | "button";
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const c = useTokens();
  const { hovered, hoverProps } = useHover();
  const base = active ? c.card : "transparent";
  const tint = active ? c.accentInk : hovered ? c.ink : c.muted;
  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      accessibilityLabel={label}
      aria-selected={role === "tab" ? active : undefined}
      onPress={onPress}
      {...hoverProps}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: active ? c.cardBorder : "transparent",
        backgroundColor: (hovered ? hoverSurface(base, c.card) : null) ?? base,
      }}
    >
      <Icon name={icon} fill={active} size={typeScale.icon.rail} color={tint} />
      <Txt weight={active ? "emphasis" : undefined} style={{ color: tint }}>{label}</Txt>
    </Pressable>
  );
}
