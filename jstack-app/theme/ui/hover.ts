/**
 * The pack's hover state (CD-17, DS-01b) — and `misc.hoverLift`'s first
 * consumer.
 *
 * The pack's States section says: "Hover (pointer devices): surface
 * lightens one step (Card alpha +.08)". `misc.hoverLift` has carried that
 * .08 since row 3 with nothing reading it, which is why it sat on
 * `tests/unit/tokens.test.ts`'s DS-01b allow-list with the note "React
 * Native has no :hover state". That note was true of `View`; it was never
 * true of `Pressable`, which react-native-web gives `onHoverIn`/
 * `onHoverOut`. On native both props are simply never called, so the same
 * component renders its resting surface there with no platform branch.
 *
 * Two rules, both from the pack: the surface lifts by one step, and muted
 * text goes to ink.
 */
import { useCallback, useMemo, useState } from "react";
import { misc } from "@/theme/tokens";

/** `rgba(r,g,b,a)` / `rgb(r,g,b)`, the only colour forms the pack's
 * surfaces use. Hex tokens are opaque and have no alpha to lift. */
const RGBA = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

/**
 * The hovered form of `base`, or `null` when there is nothing to lift.
 *
 * `transparent` is a real case, not an edge one: `Btn` and an unselected
 * `HabitChip` have no surface at rest, and the pack's "lightens one step"
 * for them means gaining `over`'s tint at exactly one step of alpha — so
 * the caller passes the card colour as the surface to borrow from.
 */
export function hoverSurface(base: string, over: string, by: number = misc.hoverLift): string | null {
  if (base === "transparent") {
    const m = RGBA.exec(over.trim());
    if (m == null) return null;
    return `rgba(${m[1]},${m[2]},${m[3]},${round(by)})`;
  }
  const m = RGBA.exec(base.trim());
  if (m == null) return null; // an opaque hex: no alpha to raise
  const alpha = m[4] == null ? 1 : Number(m[4]);
  if (alpha >= 1) return null;
  return `rgba(${m[1]},${m[2]},${m[3]},${round(Math.min(1, alpha + by))})`;
}

/** Keep the generated string short and stable for the style-diffing tests
 * (`.66`, not `.6599999999999999`). */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export type HoverProps = {
  onHoverIn: () => void;
  onHoverOut: () => void;
};

/**
 * `hovered` plus the two props to spread onto a `Pressable`.
 *
 * Spread them on the `Pressable` itself, never on a `View`: react-native-web
 * only implements them there, and a `View` would silently drop them — a
 * hover that never fires and never errors is exactly the kind of green-over-
 * nothing this build's hard rule 11 is about.
 */
export function useHover(): { hovered: boolean; hoverProps: HoverProps } {
  const [hovered, setHovered] = useState(false);
  const onHoverIn = useCallback(() => setHovered(true), []);
  const onHoverOut = useCallback(() => setHovered(false), []);
  return useMemo(() => ({ hovered, hoverProps: { onHoverIn, onHoverOut } }), [hovered, onHoverIn, onHoverOut]);
}
