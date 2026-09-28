/**
 * Section — a heading and the thing it heads (H-1, CL-01..CL-03).
 *
 * Every section on every tab was the same three lines: a `View` with a
 * `-section` testID, a `Label`, and a body. Collapsing needs the heading to
 * stay and the body to go, which is a rule about that pair — so it belongs to
 * the pair, once, rather than to twenty components each deciding again what
 * "collapsed" means to them.
 *
 * The heading NEVER hides. That is the whole shape of it: a collapsed section
 * still shows its name, its count badge and its "all" link, so the tab reads
 * as a list of what is there rather than as a screen that lost things
 * (CL-02). The badge in particular is the reason to collapse rather than hide
 * — "Agent issues 3" collapsed is a person deciding not to look at three
 * things they know about.
 *
 * Arrange's hidden sections are a different thing entirely and stay that way:
 * hidden is an account-level layout choice that follows a person to every
 * device, collapsed is this screen on this phone. CL-03 asserts neither moves
 * the other.
 */
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Label } from "@/theme/ui/label";
import { useDeviceStore } from "@/stores/device";

export function Section({
  sectionId,
  title,
  badge,
  hint,
  right,
  testID,
  labelTestID,
  labelStyle,
  style,
  collapsible = true,
  children,
}: {
  /** what the collapsed state is remembered under (device-local) */
  sectionId: string;
  title: React.ReactNode;
  badge?: number | string;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  testID?: string;
  labelTestID?: string;
  labelStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** a section that must always stay open shows no disclosure at all */
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const collapsed = useDeviceStore((s) => s.collapsed[sectionId] === true) && collapsible;

  return (
    <View testID={testID} style={style}>
      <Label sectionId={sectionId} collapsible={collapsible} badge={badge} hint={hint} right={right} testID={labelTestID} style={labelStyle}>
        {title}
      </Label>
      {collapsed ? null : children}
    </View>
  );
}
