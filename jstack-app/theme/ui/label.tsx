/**
 * `Label` (F-37, P-7 — out of `text.tsx`, which sat at 242/250): the section
 * header — uppercase label, the H-1 disclosure, an optional count badge, an
 * optional trailing hint, an optional right-side node.
 *
 * ux S6-19: the hint may WRAP UNDER the label. At 393 Sync's "COULD NOT BE
 * APPLIED" hint ran off the viewport and was cut mid-word — the header row
 * could neither shrink nor fall to a second line. The label cluster and the
 * hint sit in a wrapping row now: a hint that fits stays on the line as the
 * pack draws it ("right-hand hint on the same line"), and one that does not
 * takes the next line at the left edge, whole. `flexShrink` on the group and
 * on the hint is what gives the outer row that choice; without it the group
 * keeps its one-line width and overflows. The 7px between label and hint is
 * the row's `columnGap`, so a wrapped hint carries no stray indent.
 */
import React from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { useDeviceStore } from "@/stores/device";
import { useTokens } from "@/theme/ThemeProvider";
import { fonts, sizes, type as typeScale } from "@/theme/tokens";
import { Txt } from "./text";

/** `.js-label` — a section header: uppercase label, optional count badge,
 * optional trailing hint link/text, optional right-side node. */
export function Label({
  children,
  badge,
  hint,
  right,
  style,
  testID,
  sectionId,
  collapsible = true,
}: {
  children: React.ReactNode;
  badge?: number | string;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * H-1: the id this heading's collapsed state is remembered under. A heading
   * with no `sectionId` has no disclosure — a section that cannot be collapsed
   * must not show a control that says it can.
   */
  sectionId?: string;
  /** for the rare heading that has an id but must always stay open */
  collapsible?: boolean;
}) {
  const c = useTokens();
  const collapsedMap = useDeviceStore((s) => s.collapsed);
  const toggleCollapsed = useDeviceStore((s) => s.toggleCollapsed);
  const shows = sectionId != null && collapsible;
  const isCollapsed = sectionId != null && collapsedMap[sectionId] === true;

  return (
    <View testID={testID} style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, style]}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 7, rowGap: 2, flexShrink: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {shows && (
            <Pressable
              // NOT `${testID}-…`: a section's rows share that prefix, and a
              // disclosure answering to it would be swept up by every row query
              // (B-28, CODEMAP §6). Its own namespace instead.
              testID={`disclose-${sectionId}`}
              accessibilityRole="button"
              accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${typeof children === "string" ? children : "section"}`}
              accessibilityState={{ expanded: !isCollapsed }}
              // BOTH, because they are read by different renderers. React Native
              // Web 0.21 maps `accessibilityLabel` to `aria-label` but drops
              // `accessibilityState.expanded` on the floor — the button shipped
              // announcing itself as a button with no state at all, which is a
              // screen reader saying "Needs you, button" and nothing about
              // whether pressing it opens or closes. RN core folds `aria-expanded`
              // back into `accessibilityState` for the native side (View.js), so
              // the two agree rather than compete (CL-01, B-10).
              aria-expanded={!isCollapsed}
              onPress={() => toggleCollapsed(sectionId)}
              // 36px of target around a 16px glyph: the control is small on
              // purpose and must not be hard to hit. CL-01 asks for 32; GL-05's
              // phone floor is 36 and it sweeps EVERY interactive element, so 32
              // shipped a control the app's own guard calls too small (A-14).
              // The larger number satisfies both, so it is the one here.
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -8 }}
            >
              <Icon name={isCollapsed ? "chevron_right" : "keyboard_arrow_down"} size={16} color={c.muted} />
            </Pressable>
          )}
          <Txt kind="label">{children}</Txt>
          {badge != null && (
            <View
              style={{
                minWidth: sizes.badgeH,
                height: sizes.badgeH,
                borderRadius: 8,
                paddingHorizontal: 5,
                marginLeft: 7,
                backgroundColor: c.badgeBg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontFamily: fonts.body, fontSize: typeScale.size.badge, color: c.badgeFg }}>{badge}</Text>
            </View>
          )}
        </View>
        {hint != null && <Txt kind="small" style={{ flexShrink: 1 }}>{hint}</Txt>}
      </View>
      {right}
    </View>
  );
}
