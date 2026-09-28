/**
 * List-row primitives (S-2 split of theme/ui.tsx, ADR-33): Row, Track, Dot,
 * plus Checkbox and Switch (moved from ./controls to keep that file under
 * SM-03's 250-line cap — a list row's own checkbox is their most common
 * home anyway).
 */
import React from "react";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { pressLands } from "@/lib/pressGate";
import { touchSlop } from "@/lib/webData";
import { useTokens } from "@/theme/ThemeProvider";
import { hoverSurface, useHover } from "./hover";
import { radius, sizes } from "@/theme/tokens";
import { Icon } from "@/components/chrome/Icon";

/** `.js-row` — one row inside a <ListCard>. Pass `last` to drop the
 * divider (RN has no `:last-child`; the caller knows its own last row). */
export function Row({
  children,
  last = false,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: {
  children: React.ReactNode;
  last?: boolean;
  /** CD-17: a row that is itself the tap target ("Row-as-button"). Given
   * one, the row becomes a `Pressable` and takes the pack's hover state;
   * without one it stays the plain `View` it has always been. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useTokens();
  const { hovered, hoverProps } = useHover();
  const isHovered = onPress != null && hovered;
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      testID={testID}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      {...(onPress ? hoverProps : {})}
      style={[
        {
          flexDirection: "row",
          gap: 10,
          alignItems: "flex-start",
          paddingVertical: 9,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: c.hairline,
          // a row has no surface at rest; hovered, it borrows one step of
          // the card's own tint
          backgroundColor: (isHovered ? hoverSurface("transparent", c.card) : null) ?? "transparent",
        },
        style,
      ]}
    >
      {children}
    </Wrapper>
  );
}

/** `.js-track` — a progress bar; `value` 0..1, `over` swaps the fill to
 * the alert colour (money over budget, etc). */
export function Track({ value, over = false, style, testID }: { value: number; over?: boolean; style?: StyleProp<ViewStyle>; testID?: string }) {
  const c = useTokens();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      style={[{ height: sizes.barTrack, borderRadius: 4, backgroundColor: c.hairline, overflow: "hidden" }, style]}
    >
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, borderRadius: 4, backgroundColor: over ? c.alert : c.accent, opacity: over ? 0.8 : 1 }} />
    </View>
  );
}

export function Dot({ kind = "ok", feed = false, testID }: { kind?: "ok" | "alert" | "neutral"; feed?: boolean; testID?: string }) {
  const c = useTokens();
  const color = kind === "alert" ? c.alert : kind === "neutral" ? c.muted : c.ok;
  const size = feed ? sizes.dotFeed : sizes.dot;
  return <View testID={testID} style={{ width: size, height: size, borderRadius: radius.round === "50%" ? size / 2 : size, backgroundColor: color }} />;
}

export function Checkbox({
  checked,
  ea = false,
  onPress,
  testID,
  accessibilityLabel,
}: {
  checked: boolean;
  ea?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel: string;
}) {
  const c = useTokens();
  // AUDIT_v2.md A-07 — a Checkbox with no `onPress` is a STATUS MARK, not a
  // control, and must not announce itself as one. Subtasks renders it that way
  // (there is no endpoint in CONTRACT_v2.md §4 to toggle a subtask's `done`),
  // and it was carrying `role="checkbox"` with an accessible name of
  // 'Mark "…" done' — a screen reader promising an action that a tap did not
  // perform: the rig's own `mutationCount` was 16 before and 16 after.
  const interactive = onPress != null;
  return (
    <Pressable
      accessibilityRole={interactive ? "checkbox" : "image"}
      accessibilityLabel={interactive ? accessibilityLabel : `${accessibilityLabel} — ${checked ? "done" : "not done"}`}
      aria-checked={checked}
      // A4R11-01: a tick completes its row and the row leaves, so the settle
      // window applies to it as to every button (`lib/pressGate.ts`)
      onPress={onPress == null ? undefined : (e) => (pressLands(testID ?? accessibilityLabel, e) ? onPress() : undefined)}
      testID={testID}
      {...touchSlop(11, { checkbox: "1" })}
      style={{
        width: sizes.checkbox,
        height: sizes.checkbox,
        marginTop: 2,
        borderRadius: radius.tag,
        borderWidth: 1.5,
        borderStyle: ea ? "dashed" : "solid",
        borderColor: ea ? c.accentInk : checked ? c.accentInk : c.muted,
        backgroundColor: checked ? c.accentInk : "transparent",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && <Icon name="check" size={11} color={c.onSelected} />}
    </Pressable>
  );
}

/** `.sw` (mock v11 lines 211-214) — 40×24 track, 18px thumb. Sizes are the
 * mock's own literals, not a named token (layout.css has no switch size). */
export function Switch({
  value,
  onValueChange,
  testID,
  accessibilityLabel,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
  accessibilityLabel: string;
}) {
  const c = useTokens();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      aria-checked={value}
      onPress={() => onValueChange(!value)}
      testID={testID}
      {...touchSlop(6, { switch: "1" })}
      style={{
        width: 40,
        height: 24,
        borderRadius: 12,
        backgroundColor: value ? c.accentSoft : c.hairline,
        justifyContent: "center",
        padding: 3,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: value ? c.accentInk : c.bar,
          alignSelf: value ? "flex-end" : "flex-start",
          ...c.shadowSeg.native,
        }}
      />
    </Pressable>
  );
}
