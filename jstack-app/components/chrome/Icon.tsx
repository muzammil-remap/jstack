/**
 * Every icon in the app is one of these — a Material Symbols Rounded glyph
 * (weight 300) rendered as an SVG path (ADR-09). `fill` selects the FILL 1
 * variant (the active tab, a selected state); glyphs with no filled variant
 * silently fall back to the plain outline.
 */
import React from "react";
import Svg, { Path } from "react-native-svg";
import { ICONS, type IconName } from "./icons.generated";

export function Icon({
  name,
  size = 20,
  color,
  fill = false,
  testID,
}: {
  name: IconName;
  size?: number;
  color: string;
  fill?: boolean;
  testID?: string;
}) {
  const def = ICONS[name];
  if (!def) return null;
  const d = (fill && def.fillD) || def.d;
  return (
    <Svg testID={testID} width={size} height={size} viewBox={def.viewBox}>
      <Path d={d} fill={color} />
    </Svg>
  );
}
