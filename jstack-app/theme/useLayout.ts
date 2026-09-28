/**
 * The one hook allowed to read the window width (ADR-07; enforced by
 * eslint-rules/no-window-dimensions.js everywhere else). `phone` drives the
 * tab bar vs rail, the mic orb placement and dialog sizing; `rail` drives
 * the 200px rail; `columns` drives <Columns>. Breakpoints are
 * design/tokens/layout.css's --js-bp-tablet (768) and --js-bp-desktop
 * (1180) via theme/tokens.ts's `bp`.
 */
import { useWindowDimensions } from "react-native";
import { bp } from "./tokens";

export type Layout = {
  width: number;
  phone: boolean;
  rail: boolean;
  columns: 1 | 2 | 3;
};

/** Pure breakpoint table (DS-06/RL-01..04), exported so tests exercise the
 * table directly instead of mocking react-native's dimension APIs. */
export function layoutFor(width: number): Layout {
  const phone = width < bp.tablet;
  const rail = !phone;
  const columns: 1 | 2 | 3 = width < bp.tablet ? 1 : width < bp.desktop ? 2 : 3;
  return { width, phone, rail, columns };
}

/**
 * `Layout` plus the viewport height. Height is deliberately NOT part of the
 * pure `layoutFor` table: no breakpoint reads it, and folding it in would
 * mean every test of that table had to invent a height. S-2b's expanded
 * `Field` is its first consumer — it sizes itself against the space above
 * `session.keyboardInset` (UX-02) — and this is still the one file ADR-07
 * lets read the window.
 */
type Viewport = Layout & { height: number };

export function useLayout(): Viewport {
  const { width, height } = useWindowDimensions();
  return { ...layoutFor(width), height };
}
