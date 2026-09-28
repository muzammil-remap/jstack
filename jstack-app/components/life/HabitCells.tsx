/**
 * The one cell every habit grid is drawn from (LH-1, LH-02, LH-08).
 *
 * Three grids show the same fact at three densities — a month with day numbers,
 * a year at 8px, a strip beside a name — and the thing that must not vary
 * between them is what a hit and a miss LOOK like. A cell drawn per grid would
 * drift the moment one of them was tuned, and hard rule 20 is that a colour
 * means one thing.
 *
 * THREE STATES, THREE FILLS — and the first cut of this row had only two, which
 * the ux round measured as three separate defects (LH1-01/02/03):
 *
 *   hit     `accentInk` fill, `onSelected` ink. NOT `accent`: in light that is
 *           a mid tone and white on it measures 3.83:1, under every floor the
 *           pack states for itself. `accentInk` gives 6.9:1 in light, and in
 *           dark the pair inverts by itself — `accentInk` is #B7C8D8 there and
 *           `onSelected` is #191815 — so one token pair is right in both
 *           schemes and no component branches on the theme.
 *   miss    `hairline` as a FILL, `ink` number. A POSITIVE MARK, not the
 *           absence of one: it was a hairline BORDER with no fill, which
 *           measured 1.12:1 against the sheet, and Josh's whole complaint was
 *           that the misses do not show. Grey rather than accent, because
 *           `accentSoft` is the pack's fill for a habit chip that is DONE and
 *           would say the opposite of what this cell means.
 *   future  a hairline box and a number at the pack's `Disabled: opacity .45`.
 *           It used to draw NOTHING, and the result was that a month opened on
 *           the 9th reserved five week-rows and painted one — 98px of void per
 *           habit, which reads as a rendering fault rather than as days that
 *           have not happened. The grid survives; the content does not.
 *
 * THE NUMBER IS `ink` IN EVERY CELL BUT A HIT, and that is a decision, not a
 * miss. It was `muted`, which measures 3.55 light and 2.95 dark against these
 * fills and cannot be made to clear 4.5 on a dialog sheet at any fill worth
 * using — `muted` is a colour for meta text on a card, and this is neither. The
 * day number's job is ORIENTATION, telling you which square is the 14th; the
 * result is carried entirely by the FILL, which is what LH-08 measures at 5.3:1
 * and up. So the number is legible in every cell and says nothing by its
 * colour, and the eye still counts fills.
 *
 * `today` IS AN UNDERLINE, not a border. It was a 2px ring, which the pack
 * reserves exclusively for focus and which a keyboard user could not tell from
 * it (LH1-08); it was then a 1px accent-ink border, which is invisible when
 * today is a hit because a hit's fill IS accent ink — four of nine cards showed
 * no today marker at all (LH2-08). An underline beneath the cell sits on the
 * card, not on the fill, so it survives every state. It is the same mark the
 * week strip uses, which is the point: one idea, drawn once.
 */
import React from "react";
import { View } from "react-native";
import { Txt } from "@/theme/ui";
import { radius } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { HabitCell } from "@/lib/habitStats";

/** the pack's `Disabled: opacity .45`, applied to a future day's number */
const FUTURE_INK_OPACITY = 0.45;

export function HabitGridCell({
  state,
  size,
  label,
  today = false,
  testID,
}: {
  state: HabitCell;
  size: number;
  /** the day number, on the month grid only — the year grid has no room */
  label?: string;
  today?: boolean;
  testID?: string;
}) {
  const c = useTokens();
  const hit = state === "hit";
  const future = state === "future";

  const cell = (
    <View
      testID={testID}
      style={{
        width: size,
        height: size,
        borderRadius: radius.tag,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hit ? c.accentInk : future ? "transparent" : c.hairline,
        // a hairline only where there is no fill to carry the shape
        borderWidth: future ? 1 : 0,
        borderColor: c.hairline,
      }}
    >
      {label != null && (
        // `Txt kind="meta"` rather than a styled `Text`: typography belongs to
        // `theme/` and the lint rule that says so is right. Only the COLOUR is
        // overridden, which is this cell's own decision — the number is legible
        // in every state and says nothing by its hue.
        <Txt kind="meta" style={{ color: hit ? c.onSelected : c.ink, opacity: future ? FUTURE_INK_OPACITY : 1 }}>
          {label}
        </Txt>
      )}
    </View>
  );

  if (!today) return cell;
  return (
    <View style={{ alignItems: "center" }}>
      {cell}
      <View testID={testID != null ? `${testID}-today` : undefined} style={{ width: size, height: 1, marginTop: 1, backgroundColor: c.accentInk }} />
    </View>
  );
}

/** The label row above a month grid, Monday first like every other calendar in
 * the app. Its own export so the month view and anything that later shows a
 * fortnight cannot disagree about which column is which. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
