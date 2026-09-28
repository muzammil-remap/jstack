/**
 * The floating phone tab bar (<768, RL-01): inset 14px, height 60,
 * `.js-bar` surface (frosted, blur 24). `ListeningBar` replaces this while
 * the mic is live (row 6's Orb/ListeningBar pair).
 */
import React from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { frostedStyle, Txt } from "@/theme/ui";
import { useTokens } from "@/theme/ThemeProvider";
import { blur, misc, radius, type as typeScale } from "@/theme/tokens";
import { TABS, type TabId } from "@/layout/tabRoutes";
import { useKeyboardBottom } from "@/lib/keyboard";
import { useUiStore } from "@/stores/ui";

export function TabBar({ active, onTab, hiddenTabs = [] }: { active: TabId; onTab: (id: TabId) => void; hiddenTabs?: string[] }) {
  const c = useTokens();
  const tabs = TABS.filter((t) => !hiddenTabs.includes(t.id));
  // WPR-4 (b): while the keyboard is up the bar rides where the visual viewport ends — except over the expanded
  // editor, which owns the band above the keyboard (UX-02): the bar stands down there as the demo watermark does
  // (TE-03), rather than ride up over the editor's foot and the controls beside it
  const keyboardBottom = useKeyboardBottom();
  const editorExpanded = useUiStore((s) => s.editorExpanded);
  if (editorExpanded) return null;

  return (
    <View
      testID="tabbar"
      style={{
        position: "absolute",
        left: misc.barInset,
        right: misc.barInset,
        bottom: misc.barInset + keyboardBottom,
        height: misc.barHeight,
        flexDirection: "row",
        borderRadius: radius.card,
        backgroundColor: c.bar,
        borderWidth: 1,
        borderColor: c.cardBorder,
        ...frostedStyle(blur.bar),
        ...c.shadow.native,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Pressable
            key={t.id}
            testID={`tab-${t.id}`}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            aria-selected={isActive}
            onPress={() => onTab(t.id)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
          >
            <Icon name={t.icon} fill={isActive} size={typeScale.icon.tab} color={isActive ? c.accentInk : c.muted} />
            <Txt kind="tab" style={{ color: isActive ? c.accentInk : c.muted }}>{t.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
