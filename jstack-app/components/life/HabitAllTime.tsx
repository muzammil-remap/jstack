/**
 * HabitAllTime (LH-04) — a bar row per year, and the line that says how it has
 * gone overall.
 *
 * "current streak 4 · longest 19 · 128 of 184 · 70%" is composed by
 * `lib/habitStats.ts`, not here, because the streak numbers are the server's
 * and the sentence is the one thing on this screen a person will quote.
 *
 * A YEAR WITH NO DATA IS NOT DRAWN. The fixture is 184 days, so on a September
 * clock this is one row and on a February clock it is two — and that is the
 * honest rendering either way. An empty bar for a year you did not have the app
 * is a claim that you failed it.
 *
 * THE BAR IS THE RATE, NOT THE RANK (LH2-05). It was scaled against the biggest
 * year in the same card, which with one year of data means the biggest year is
 * the only year: every bar in every card drew at 100%, so a habit kept 35% of
 * the time and one kept 96% of the time made the identical mark. More fixture
 * would not have fixed that — it would have hidden it behind a second year.
 * `done / possible` is the number the line beside it already prints, so the
 * picture and the sentence cannot disagree.
 */
import React from "react";
import { View } from "react-native";
import { Meta } from "@/theme/ui";
import { HabitBlock, HabitBlockGrid } from "@/components/life/HabitBlock";
import { habitAllTimeLine, yearlyCounts } from "@/lib/habitStats";
import { useTokens } from "@/theme/ThemeProvider";
import type { HabitStatRow } from "@/data/types";

const BAR_HEIGHT = 10;

export function HabitAllTime({ rows }: { rows: HabitStatRow[] }) {
  const c = useTokens();

  return (
    <HabitBlockGrid>
      {rows.map((row) => {
        const years = yearlyCounts(row);
        return (
          <HabitBlock key={row.id} testID={`habit-all-${row.id}`} title={row.name}>
            {years.length === 0 ? (
              <Meta testID={`habit-all-empty-${row.id}`}>Nothing logged yet</Meta>
            ) : (
              years.map((y) => (
                <View key={y.year} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Meta style={{ width: 34 }}>{y.year}</Meta>
                  <View style={{ flex: 1, height: BAR_HEIGHT, borderRadius: 2, backgroundColor: c.hairline }}>
                    <View
                      testID={`habit-all-bar-${row.id}-${y.year}`}
                      style={{
                        // the RATE for that year, floored at 2% so a year with
                        // one completion is still a mark rather than nothing
                        width: `${Math.max(2, Math.round(y.rate * 100))}%`,
                        height: BAR_HEIGHT,
                        borderRadius: 2,
                        backgroundColor: c.accentInk,
                      }}
                    />
                  </View>
                  <Meta style={{ width: 34, textAlign: "right" }}>{String(y.count)}</Meta>
                </View>
              ))
            )}
            <Meta testID={`habit-all-line-${row.id}`}>{habitAllTimeLine(row)}</Meta>
          </HabitBlock>
        );
      })}
    </HabitBlockGrid>
  );
}
