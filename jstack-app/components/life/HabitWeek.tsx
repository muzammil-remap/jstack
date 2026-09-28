/**
 * HabitWeek (LH-05) — a habit's recent days beside its name, and today's cell
 * is the toggle.
 *
 * It replaces the labelled chip that was Life's whole habit card. The chip said
 * whether you had done the thing TODAY and nothing else, which is the half of
 * the question a habit tracker is not for; a strip says whether you have been
 * doing it.
 *
 * HOW MANY DAYS IS THE WIDTH'S DECISION (LH1-06). Seven on a phone, a fortnight
 * on a tablet, four clean weeks from 1180 up. The first cut was a fixed seven
 * and measured 203px wide at 393 AND at 1920, so the card's extra width went
 * into the gap between the name and the strip — 330px of it at 1920 — and the
 * density FELL as the screen grew, which is the inverse of the dense grid Josh
 * asked for.
 *
 * TODAY IS DRAWN IN THE SAME LANGUAGE AS THE REST (LH1-07). It was the pack's
 * `HabitChip` with its label removed, which meant the box grew to 34px while
 * the mark shrank to a 14px circle on a 1.18:1 plate — the most important cell
 * in the row carrying the weakest mark and the smallest one. Now it is a 24px
 * square like its neighbours, inside a 36px transparent pressable box, with a
 * 1px accent-ink underline to say which day it is. The 36 clears GL-05's phone
 * floor outright, so it needs no exemption and no pack carve-out.
 *
 * The days behind today are not pressable — you cannot change what you did on
 * Tuesday, and a control that looks live and is not is worse than none. For
 * the same reason the Trends dialog no longer renders this strip (ux S6-11):
 * it drew the toggle with no handler, a second dead `life-habit-*` per habit.
 */
import React from "react";
import { Pressable, View } from "react-native";
import { HabitGridCell } from "@/components/life/HabitCells";
import { cellFor } from "@/lib/habitStats";
import { addDays, todayKey, weekdayShort } from "@/lib/time";
import { useTokens } from "@/theme/ThemeProvider";
import type { HabitStatRow } from "@/data/types";

const CELL = 24;
const TAP = 36;
const GAP = 4;

/**
 * SEVEN, at every width — and this is a withdrawal, recorded rather than
 * quietly reverted.
 *
 * Round 1 measured the strip at the same 203px on a phone and at 1920 and
 * asked for it to lengthen with the screen (LH1-06). It was made 7/14/28 by
 * SCREEN width, and round 2 found what that costs: the Life card is about
 * 380px wide at every width above the phone, because it sits in one of three
 * columns — so 28 cells ran 432px OUTSIDE the card at 1366, overprinted the
 * Money label and put habit squares across two other sections. "Never lay a
 * single section across columns" is a harder rule than "density should rise
 * with the screen", so the length goes back to seven.
 *
 * The finding is not closed and is not this component's to close: making the
 * strip longer means giving Habits more than one column, which is a layout
 * decision for `DISCREPANCIES.md` and not a number in a component.
 */
const STRIP_DAYS = 7;

export function HabitWeek({
  row,
  days = STRIP_DAYS,
  testID,
  onToggle,
}: {
  row: HabitStatRow;
  days?: number;
  testID?: string;
  onToggle?: (next: boolean) => void;
}) {
  const c = useTokens();
  const today = todayKey();
  const past = Array.from({ length: days - 1 }, (_, i) => addDays(today, -(days - 1 - i)));
  const doneToday = row.days[today] === true;

  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: GAP }}>
      {past.map((key) => (
        <HabitGridCell key={key} testID={`${testID ?? row.id}-day-${key}`} state={cellFor(row, key, today)} size={CELL} />
      ))}
      <Pressable
        testID={`life-habit-${row.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${row.name}, ${weekdayShort(today)} — ${doneToday ? "done" : "not done"}`}
        aria-selected={doneToday}
        accessibilityState={{ selected: doneToday }}
        onPress={onToggle != null ? () => onToggle(!doneToday) : undefined}
        // 36 square, painted 24: the tap target clears GL-05's phone floor
        // without the mark growing out of the row's language
        style={{ width: TAP, height: TAP, alignItems: "center", justifyContent: "center" }}
      >
        <HabitGridCell state={cellFor(row, today, today)} size={CELL} />
        <View style={{ width: CELL, height: 1, marginTop: 2, backgroundColor: c.accentInk }} />
      </Pressable>
    </View>
  );
}
