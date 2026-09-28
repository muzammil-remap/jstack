/**
 * HabitMonth (LH-02) — one calendar month per habit, seven columns Monday
 * first, with the day numbers.
 *
 * It opens on the CURRENT month and ‹ › page it, bounded by the log
 * (resolution #17): there is no month before the first day anybody logged and
 * none after today, and arrows that page into nothing are arrows that say the
 * data goes on. The bound is `stats.earliest`, which the server sends, because
 * a response carrying one month cannot say where the log begins.
 *
 * EVERY DAY OF THE MONTH IS PAINTED, including the ones that have not happened
 * (LH1-01). Drawing only the elapsed days left five week-rows reserved and one
 * painted — 98px of void per habit — which reads as a rendering fault. A future
 * day is a hairline box with its number at the pack's disabled opacity: the
 * grid survives, the claim does not.
 *
 * The caption is "18 of 30", counted over days that HAVE HAPPENED. A month
 * opened on the 9th reporting eighteen out of thirty-one would read as a
 * failure rather than as a month in progress; the server does that arithmetic
 * (`possible` never counts a future day) and this prints it.
 */
import React from "react";
import { View } from "react-native";
import { Meta } from "@/theme/ui";
import { HabitBlock, HabitBlockGrid } from "@/components/life/HabitBlock";
import { HabitGridCell, WEEKDAY_INITIALS } from "@/components/life/HabitCells";
import { HabitPager } from "@/components/life/HabitPager";
import { cellFor, habitCountCaption, monthCells } from "@/lib/habitStats";
import { addMonths, monthCaption, todayKey } from "@/lib/time";
import { space } from "@/theme/tokens";
import type { HabitStatRow } from "@/data/types";

const CELL = 26;
const GAP = 3;

export function HabitMonth({
  rows,
  anchor,
  onAnchor,
  canGoBack,
  canGoForward,
}: {
  rows: HabitStatRow[];
  anchor: string;
  onAnchor: (next: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
}) {
  const today = todayKey();

  return (
    <View style={{ gap: space[4] }}>
      <HabitPager
        testID="habit-month"
        caption={monthCaption(anchor)}
        backLabel="Previous month"
        forwardLabel="Next month"
        backReason="Nothing logged before this"
        forwardReason="This is the current month"
        {...(canGoBack ? { onBack: () => onAnchor(addMonths(anchor, -1)) } : {})}
        {...(canGoForward ? { onForward: () => onAnchor(addMonths(anchor, 1)) } : {})}
      />

      <HabitBlockGrid>
        {rows.map((row) => (
          <HabitBlock key={row.id} testID={`habit-month-${row.id}`} title={row.name} hint={<Meta testID={`habit-month-count-${row.id}`}>{habitCountCaption(row)}</Meta>}>
            <View style={{ flexDirection: "row", gap: GAP }}>
              {WEEKDAY_INITIALS.map((initial, i) => (
                <Meta key={i} style={{ width: CELL, textAlign: "center" }}>
                  {initial}
                </Meta>
              ))}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP, width: 7 * CELL + 6 * GAP }}>
              {monthCells(anchor).map((key, i) =>
                key == null ? (
                  // the days before the 1st and after the last: a spacer, not a
                  // cell, so the columns line up without drawing a day that is
                  // not in this month
                  <View key={`pad-${i}`} style={{ width: CELL, height: CELL }} />
                ) : (
                  <HabitGridCell
                    key={key}
                    testID={`habit-month-${row.id}-${key}`}
                    state={cellFor(row, key, today)}
                    size={CELL}
                    label={String(Number(key.slice(8, 10)))}
                    today={key === today}
                  />
                ),
              )}
            </View>
          </HabitBlock>
        ))}
      </HabitBlockGrid>
    </View>
  );
}
