/**
 * TrendsDialog (LF-03, LH-02..LH-04) — Week / Month / Year / All time, each a
 * real `GET /habits/stats` call.
 *
 * It used to be four tabs over one visual: a row of dots per habit, capped to
 * the most recent thirty for width, with a summary line under it. Josh's words
 * were "Trend tabs are empty. Current 'week' view is not great, doesn't show
 * hits and misses clearly" — and a dot row cannot, because a dot that is absent
 * and a dot that is a miss look the same and neither says WHICH day it was.
 *
 * So each tab is now its own view over dated days: the last seven days as the
 * month's card grid, a calendar month with its numbers, a year as weeks by
 * weekdays with twelve bars beneath, and an all-time bar row per year with the
 * streak line.
 *
 * THE ANCHOR LIVES HERE, not in the views. Month and year page with ‹ › and the
 * bounds are the log's — `stats.earliest`, which the server sends, and today —
 * so a view cannot page into a month nobody has data for.
 *
 * ux S6-11(c): THE DIALOG HOLDS ONE HEIGHT. `Dialog` hugs its content up to a
 * 90% ceiling (R2-10), which is right for a dialog with one thing in it and
 * wrong for one whose segments swap content: the control you had just pressed
 * moved up to 181px between tabs. On a desktop the body is given the ceiling
 * as its floor (`trendsBodyHeight`), so the dialog stands at its cap on every
 * tab and the header and segments never move; a tab shorter than that leaves
 * blank sheet below it, which README Principles 2 defends. A phone's dialog is
 * the screen and needs nothing.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Meta, Seg, Txt } from "@/theme/ui";
import { HabitAllTime } from "@/components/life/HabitAllTime";
import { HabitBlock, HabitBlockGrid } from "@/components/life/HabitBlock";
import { HabitGridCell, WEEKDAY_INITIALS } from "@/components/life/HabitCells";
import { HabitMonth } from "@/components/life/HabitMonth";
import { HabitYear } from "@/components/life/HabitYear";
import { cellFor, habitCountCaption, habitSummaryLine, trendsBodyHeight } from "@/lib/habitStats";
import { addDays, mondayIndex, todayKey } from "@/lib/time";
import { useLifeStore } from "@/stores/life";
import { bp, space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";
import type { HabitPeriod, HabitStatRow } from "@/data/types";

const PERIODS: { key: HabitPeriod; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All time" },
];

export function TrendsDialog({ onClose }: { onClose: () => void }) {
  const { width, height, phone } = useLayout();
  const habitStats = useLifeStore((s) => s.habitStats);
  const loadHabitStats = useLifeStore((s) => s.loadHabitStats);
  const [period, setPeriod] = useState<HabitPeriod>("week");
  const [anchor, setAnchor] = useState(() => `${todayKey().slice(0, 7)}-01`);
  const [year, setYear] = useState(() => Number(todayKey().slice(0, 4)));

  // the anchor the SERVER is asked about — month pages by month, year by year,
  // and week and all time do not page at all
  const query = period === "month" ? anchor : period === "year" ? `${year}-01-01` : todayKey();

  useEffect(() => {
    void loadHabitStats(period, query);
  }, [period, query, loadHabitStats]);

  const rows = habitStats?.habits ?? [];

  /**
   * Where the log begins, from the RESPONSE (LH-02).
   *
   * It was derived here from the days in hand, and that was wrong in a way only
   * the e2e found: the month view carries one month, so the earliest day it
   * holds is the month being looked at and ‹ was disabled on every month there
   * has ever been. A bound on a window cannot be computed from that window.
   */
  const earliest = habitStats?.earliest ?? todayKey();

  const today = todayKey();

  return (
    <Dialog testID="trends-dialog" title="Habits · trends" onClose={onClose}>
      <View style={{ minHeight: trendsBodyHeight(height, phone) }}>
        <Seg testID="trends-period" options={PERIODS} value={period} onChange={setPeriod} />

        <View style={{ marginTop: space[4] }}>
          {period === "week" && <HabitWeekCards rows={rows} today={today} />}

          {period === "month" && (
            <HabitMonth
              rows={rows}
              anchor={anchor}
              onAnchor={setAnchor}
              canGoBack={anchor > earliest.slice(0, 7) + "-01"}
              canGoForward={anchor < `${today.slice(0, 7)}-01`}
            />
          )}

          {period === "year" && (
            <HabitYear
              rows={rows}
              year={year}
              onYear={setYear}
              canGoBack={year > Number(earliest.slice(0, 4))}
              canGoForward={year < Number(today.slice(0, 4))}
              // resolution #17: 8px on the phone, where the grid scrolls
              cell={width < bp.tablet ? 8 : 11}
            />
          )}

          {period === "all" && <HabitAllTime rows={rows} />}
        </View>

        <Txt testID="trends-summary" kind="meta" style={{ marginTop: space[4] }}>
          {habitSummaryLine(habitStats, period)}
        </Txt>
        {rows.length === 0 && <Meta testID="trends-empty">Nothing here yet</Meta>}
      </View>
    </Dialog>
  );
}

/** the month grid's cell and gap, so the two card grids draw one square */
const CELL = 26;
const GAP = 3;
const WEEK_DAYS = 7;

/**
 * ux S6-11(a): the week as the MONTH's card grid over the last seven days —
 * one card per habit, a weekday initial over every cell and the day's number
 * in it, today underlined, the "5 of 7" caption beside the name.
 *
 * It was nine bare rows of the Life card's strip with the name repeated — a
 * name at x 248 and seven unlabelled cells to x 522 inside a 900px dialog,
 * 68% of it empty, and Josh's own complaint about the week view ("doesn't show
 * hits and misses clearly") moved into a dialog. The strip stays on the Life
 * card, where it is the toggle; here nothing is a toggle, so the dialog no
 * longer carried a second, dead `life-habit-*` control for every habit.
 */
function HabitWeekCards({ rows, today }: { rows: HabitStatRow[]; today: string }) {
  const days = Array.from({ length: WEEK_DAYS }, (_, i) => addDays(today, i - (WEEK_DAYS - 1)));
  return (
    <HabitBlockGrid>
      {rows.map((row) => (
        <HabitBlock key={row.id} testID={`trend-row-${row.id}`} title={row.name} hint={<Meta testID={`trend-week-count-${row.id}`}>{habitCountCaption(row)}</Meta>}>
          <View style={{ flexDirection: "row", gap: GAP }}>
            {days.map((key) => (
              <Meta key={key} style={{ width: CELL, textAlign: "center" }}>
                {WEEKDAY_INITIALS[mondayIndex(key)]}
              </Meta>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: GAP }}>
            {days.map((key) => (
              <HabitGridCell
                key={key}
                testID={`trend-week-${row.id}-${key}`}
                state={cellFor(row, key, today)}
                size={CELL}
                label={String(Number(key.slice(8, 10)))}
                today={key === today}
              />
            ))}
          </View>
        </HabitBlock>
      ))}
    </HabitBlockGrid>
  );
}
