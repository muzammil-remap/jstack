/**
 * Chip-family primitives (S-2 split of theme/ui.tsx, ADR-33): Chip, Seg,
 * HabitChip. `Tag` moved to `./tag` at P-7 (F-36).
 */
import React from "react";
import { Pressable, StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";
import { touchSlop, webData } from "@/lib/webData";
import { useLayout } from "@/theme/useLayout";
import { useTokens } from "@/theme/ThemeProvider";
import { hoverSurface, useHover } from "./hover";
import { fonts, radius, sizes, space, type as typeScale } from "@/theme/tokens";
import { Icon } from "@/components/chrome/Icon";

export function Chip({
  label,
  selected = false,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useTokens();
  const Wrapper = onPress ? Pressable : View;
  const { hovered, hoverProps } = useHover();
  // CD-17: only a chip that is actually a button has a hover state, and
  // only `Pressable` implements the props — a `View` would drop them
  const isHovered = onPress != null && hovered;
  return (
    <Wrapper
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      aria-selected={onPress ? selected : undefined}
      onPress={onPress}
      {...(onPress ? hoverProps : {})}
      {...(onPress ? touchSlop(4, { chip: "1" }) : webData({ chip: "1" }))}
      style={[
        {
          minHeight: 30,
          justifyContent: "center",
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: radius.control,
          backgroundColor: (isHovered ? hoverSurface(selected ? c.accentSoft : c.card, c.card) : null) ?? (selected ? c.accentSoft : c.card),
          borderWidth: selected ? 0 : 1,
          borderColor: c.cardBorder,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: typeScale.size.chip,
          // CD-17: the pack's hover rule takes muted text to ink
          color: selected ? c.accentInk : isHovered ? c.ink : c.muted,
          fontWeight: String(selected ? typeScale.weight.emphasis : typeScale.weight.regular) as TextStyle["fontWeight"],
        }}
      >
        {label}
      </Text>
    </Wrapper>
  );
}

/** `.js-seg` — a segmented control; `options` in display order, `value`
 * the selected option's key.
 *
 * `width` mirrors the mock, which sizes each segmented control at its call
 * site — the Tasks one takes its whole column (`class="seg"`, no cap) while
 * Settings' pin theirs (`width:190px` for Theme, `width:200px;flex:none` for
 * every Autonomy row). A blanket `maxWidth: 520` left the Tasks control 67px
 * short of the card beneath it at 1920 (ux-review D12), and giving Settings'
 * rows no floor let the flex row squeeze three labels until they overprinted
 * each other — `AutoLightDark`, `ProposeAuto` (D4). `flexShrink: 0` is what
 * stops the squeeze; the width is what stops the sprawl.
 *
 * `grow` (ux S6-54): a control with neither a width nor the row sizes itself
 * to its LABELS — six speeds came out 119 px, 19.8 px a segment, with the
 * glyphs printing over each other. `grow` gives it the rest of its row, so
 * the segments widen with the screen and with the option count.
 */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  testID,
  width,
  grow,
  wrapOnPhone,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  testID?: string;
  width?: number;
  grow?: boolean;
  /** S6-54: on a phone, take two rows rather than squeeze the labels. Set it
   * where the labels are words and there are more than four of them — see the
   * note in the body for why this is the call site's decision and not a count. */
  wrapOnPhone?: boolean;
}) {
  const c = useTokens();
  const { phone } = useLayout();
  // S6-54 (A-6): seven segments — "Any kind" through "Link" — in the Files
  // archive's 354 px at 393 gave each 50.6 px, and the labels are whole words,
  // so "Document", "Spreadsheet" and "Image" printed through their neighbours.
  // B-171 fixed the other half of S6-54 by giving the Speed control its whole
  // row; this one already spans its row, so width is not the answer. A
  // segmented control is equal segments across a row — when the row cannot
  // hold them, the honest shape is the same segments over TWO rows, not a
  // smaller type size or a clipped word.
  //
  // WHICH control wraps is the CALL SITE's, like `width` and `grow` above, and
  // for the reason the A-6 review gave when this was a blanket rule keyed on
  // the option count: it wrapped three controls that fit. Files' `who` row (5
  // short labels, the widest 42 px in a 71 px segment) wrapped anyway and left
  // "Dev" stranded across 355 px, and Voice's Speed — six labels, the widest
  // 24 px — wrapped 4+2 and put `1.75x` over row 1's dividers, regressing
  // B-171 at 393. A count is not a fit.
  //
  // The basis is a QUARTER and the segments do not grow, so every segment in
  // the control is one width and row 2 lines up with row 1 (the review's
  // A6-03: growing the last row made it thirds against row 1's quarters, and
  // the selected pill changed width depending on which row it landed in).
  const wrap = phone && wrapOnPhone === true;
  return (
    <View testID={testID} style={{ flexDirection: "row", padding: 3, borderRadius: radius.seg, backgroundColor: c.hairline, flexShrink: 0, ...(wrap ? { flexWrap: "wrap" as const, rowGap: 3 } : {}), ...(width != null ? { width } : {}), ...(grow ? { flex: 1, minWidth: 0, marginLeft: space[4] } : {}) }}>
      {options.map((opt) => {
        const selected = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            accessibilityRole="tab"
            accessibilityLabel={opt.label}
            aria-selected={selected}
            onPress={() => onChange(opt.key)}
            {...webData({ seg: "1", "seg-value": opt.key })}
            style={[
              // 36 on the phone, where README Accessibility sets the floor;
              // the mock's 30 stands on pointer devices (AUDIT_v2.md A-02, found
              // once the sweep could see `role="tab"` at all)
              wrap
                ? { flexGrow: 0, flexBasis: "25%", minHeight: 36, alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 7 }
                : { flex: 1, minHeight: phone ? 36 : 30, alignItems: "center", justifyContent: "center", paddingVertical: 6, borderRadius: 7 },
              selected && { backgroundColor: c.card, ...c.shadowSeg.native },
            ]}
          >
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: typeScale.size.chip,
                color: selected ? c.ink : c.muted,
                fontWeight: String(selected ? typeScale.weight.emphasis : typeScale.weight.regular) as TextStyle["fontWeight"],
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `.js-habit` — a habit toggle chip; `compact` is Today's smaller 32px cut
 * (design/DISCREPANCIES.md #3), the default 34px is Life's. */
export function HabitChip({
  label,
  done,
  compact = false,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  done: boolean;
  compact?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const c = useTokens();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-selected={done}
      onPress={onPress}
      testID={testID}
      {...touchSlop(4, { habit: "1" })}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        minHeight: compact ? sizes.habitCompact : sizes.habit,
        paddingLeft: 9,
        paddingRight: 11,
        borderRadius: radius.control,
        borderWidth: done ? 0 : 1,
        borderColor: c.hairline,
        backgroundColor: done ? c.accentSoft : "transparent",
      }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: done ? 0 : 1.5,
          borderColor: c.muted,
          backgroundColor: done ? c.accentInk : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done && <Icon name="check" size={9} color={c.onSelected} />}
      </View>
      <Text
        style={{
          fontFamily: fonts.body,
          fontSize: typeScale.size.label,
          color: done ? c.accentInk : c.muted,
          fontWeight: String(done ? typeScale.weight.emphasis : typeScale.weight.regular) as TextStyle["fontWeight"],
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
