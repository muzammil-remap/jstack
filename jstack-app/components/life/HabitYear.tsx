/**
 * HabitYear (LH-03) — the year as weeks across and weekdays down, with the
 * month labels above it, and twelve bars of completions beneath ON THE SAME
 * AXIS.
 *
 * The grid is the shape Josh's second reference image shows, in the pack's
 * tokens rather than its magenta. Columns are WEEKS and rows are WEEKDAYS,
 * Monday first — the reference is Sunday-first, and matching it would have made
 * the habit year the one calendar in JSTACK that starts on a different day.
 *
 * ONE SCROLLER, OPENED AT THIS WEEK (ux S6-11(b); before it, resolution #17
 * and LH2-03). The grid and the bars were two scrollers: the grid opened at
 * the year's END and the bars at its start, so on a September screen one half
 * of the card showed Sep–Dec — mostly days that had not happened — while the
 * other showed Jan–Aug, and "130 of 253" stood over a picture of fifteen
 * dots. The bars are laid out in week columns now (`yearMonthSpans`) under
 * the grid inside one horizontal scroller, so whatever is scrolled into view
 * is the same months twice; and the scroller opens with TODAY's column at its
 * right edge rather than December's, so the months with data are the ones on
 * screen. The offset is rounded to whole columns, so the leftmost column is
 * never a row of half-circles. Once only: a person who has scrolled back to
 * January must not be dragged forward again by a re-render. A past year opens
 * at January.
 *
 * THE MONTH LABELS ARE ABSOLUTE (LH2-02). They were laid out in the flow, each
 * 40px wide inside a 10px column, so consecutive labels printed over each other
 * — "Dec" and "Jan" rendering as "Dedan" on every card at every width, 72 times
 * in one capture pass. Positioned at their column's offset instead, and dropped
 * where the next month starts too close for both to be read. They label the
 * bars too, which sit in the same columns — the month is not written twice.
 *
 * The bars carry their NUMBER above them, as the reference does; a bar chart
 * without its values is a shape and Josh asked for the count (LH2-04).
 */
import React, { useRef } from "react";
import { ScrollView, View } from "react-native";
import { Meta, Txt } from "@/theme/ui";
import { HabitBlock, HabitBlockGrid } from "@/components/life/HabitBlock";
import { HabitGridCell } from "@/components/life/HabitCells";
import { HabitPager } from "@/components/life/HabitPager";
import { cellFor, columnsFit, habitCountCaption, monthlyCounts, weekColumnOf, yearMonthLabels, yearMonthSpans, yearOpening, yearWeeks } from "@/lib/habitStats";
import { todayKey } from "@/lib/time";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { HabitStatRow } from "@/data/types";

const GAP = 2;
const BAR_MAX = 44;
/** a label needs this many columns of clear run before the next month starts */
const LABEL_COLUMNS = 4;

export function HabitYear({
  rows,
  year,
  onYear,
  canGoBack,
  canGoForward,
  cell,
}: {
  rows: HabitStatRow[];
  year: number;
  onYear: (next: number) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  /** 8 on a phone, larger where there is room (resolution #17) */
  cell: number;
}) {
  const c = useTokens();
  const today = todayKey();
  const weeks = yearWeeks(year);
  const pitch = cell + GAP;
  const spans = yearMonthSpans(weeks, year);
  // null for any year but this one, which opens at January
  const openAt = weekColumnOf(weeks, today);
  // S6-55: what the scrollers show once placed — every row opens the same way,
  // so the first to report speaks for all — and only what fits inside it is
  // captioned or valued (`Oc` is not a month, `(` is not a count)
  const [seen, setSeen] = React.useState<{ first: number; columns: number } | null>(null);

  // only the labels with room to be read; the rest would overprint
  const labels = yearMonthLabels(weeks).filter((l, i, all) => {
    const next = all[i + 1];
    return next == null || next.index - l.index >= LABEL_COLUMNS;
  });
  const shown = seen == null ? labels : labels.filter((l) => columnsFit(l.index, l.index + LABEL_COLUMNS, seen.first, seen.columns));
  const valueFits = (i: number) => {
    if (seen == null) return true;
    const mid = Math.floor((spans[i].start + spans[i].end) / 2);
    return columnsFit(mid - 1, mid + 1, seen.first, seen.columns);
  };

  return (
    <View style={{ gap: space[4] }}>
      <HabitPager
        testID="habit-year"
        caption={String(year)}
        backLabel="Previous year"
        forwardLabel="Next year"
        backReason="Nothing logged before this"
        forwardReason="This is the current year"
        {...(canGoBack ? { onBack: () => onYear(year - 1) } : {})}
        {...(canGoForward ? { onForward: () => onYear(year + 1) } : {})}
      />

      <HabitBlockGrid>
        {rows.map((row) => {
          const counts = monthlyCounts(row, year);
          const max = Math.max(...counts.map((m) => m.count), 1);
          return (
            <HabitBlock key={row.id} testID={`habit-year-${row.id}`} title={row.name} hint={<Meta testID={`habit-year-count-${row.id}`}>{habitCountCaption(row)}</Meta>}>
              <YearScroller testID={`habit-year-scroll-${row.id}`} openAtColumn={openAt} pitch={pitch} spans={spans} onPlaced={(first, columns) => setSeen((s) => s ?? { first, columns })}>
                <View style={{ width: weeks.length * pitch }}>
                  {/* absolutely placed: in the flow they overprinted each other */}
                  <View style={{ height: 14 }}>
                    {shown.map((l) => (
                      <Meta key={l.index} style={{ position: "absolute", left: l.index * pitch, width: LABEL_COLUMNS * pitch }}>
                        {l.label}
                      </Meta>
                    ))}
                  </View>

                  <View style={{ flexDirection: "row", gap: GAP }}>
                    {weeks.map((week, i) => (
                      <View key={i} style={{ gap: GAP }}>
                        {week.map((key) => (
                          <HabitGridCell
                            key={key}
                            testID={`habit-year-${row.id}-${key}`}
                            state={key.slice(0, 4) === String(year) ? cellFor(row, key, today) : "future"}
                            size={cell}
                            today={key === today}
                          />
                        ))}
                      </View>
                    ))}
                  </View>

                  {/* twelve bars, each as wide as its month's columns, the number above */}
                  <View testID={`habit-year-bars-${row.id}`} style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6 }}>
                    {counts.map((m, i) => (
                      <View key={m.month} style={{ width: (spans[i].end - spans[i].start) * pitch, alignItems: "center", gap: 2, paddingRight: GAP }}>
                        <Txt kind="stat">{valueFits(i) ? String(m.count) : " "}</Txt>
                        <View
                          testID={`habit-year-bar-${row.id}-${m.month}`}
                          style={{
                            width: "100%",
                            // proportional, with a visible floor: a month with no
                            // completions must still read as a month, not a gap
                            height: Math.max(2, Math.round((m.count / max) * BAR_MAX)),
                            borderRadius: 2,
                            // the same fill a hit cell carries (LH1-03): `accent`
                            // is a mid tone in light, and the bars are read at a
                            // glance beside those cells
                            backgroundColor: m.count > 0 ? c.accentInk : c.hairline,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              </YearScroller>
            </HabitBlock>
          );
        })}
      </HabitBlockGrid>
    </View>
  );
}

/**
 * A horizontal scroller that opens with one column at its right edge.
 *
 * Both measurements are needed before it can place itself — its own width
 * from `onLayout`, the content's from `onContentSizeChange` — and either may
 * arrive first, so each callback tries and the first to have both wins. A
 * computed offset rather than `scrollToEnd`, because the end is December and
 * the point is this week. Once only.
 */
function YearScroller({ testID, openAtColumn, pitch, spans, onPlaced, children }: { testID: string; openAtColumn: number | null; pitch: number; spans: readonly { start: number; end: number }[]; onPlaced?: (first: number, columns: number) => void; children: React.ReactNode }) {
  const ref = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const content = useRef(0);
  const done = useRef(false);
  const place = () => {
    if (done.current || openAtColumn == null || viewport.current === 0 || content.current === 0) return;
    done.current = true;
    // S6-44 / S6-55: the window opens on a month start with today inside and the
    // current month's caption whole (`yearOpening`), and reports what it shows,
    // so a caption or a value that would be cut at either edge is not drawn
    const columns = Math.max(1, Math.floor(viewport.current / pitch));
    const first = yearOpening(spans, openAtColumn, columns, LABEL_COLUMNS);
    const x = Math.max(0, Math.min(first * pitch, content.current - viewport.current));
    ref.current?.scrollTo({ x, animated: false });
    onPlaced?.(Math.round(x / pitch), columns);
  };
  return (
    <ScrollView
      ref={ref}
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator
      onLayout={(e) => {
        viewport.current = e.nativeEvent.layout.width;
        place();
      }}
      onContentSizeChange={(w) => {
        content.current = w;
        place();
      }}
    >
      {children}
    </ScrollView>
  );
}
