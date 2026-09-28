/**
 * SlicerRow — the one row of controls above every task view (F-1, TF-05,
 * ADR-44).
 *
 * It used to be List-only, which meant the Board, the Gantt and Done showed
 * whatever the List had last been narrowed to with no way to see or change it.
 * One row, four views, the same items — and the same state behind them, so a
 * slicer chosen on the List is still chosen when the Board opens.
 *
 * Left to right: the RANGE chip (always first, always visible — a range that
 * hides in a panel is a filter people forget is on), the slicer chips, then
 * Clear, Slicers and the filter button at the right end. On a phone the chips
 * scroll horizontally with the range chip pinned first (resolution #34); the
 * three controls at the end stay put, because a control that scrolls off is a
 * control nobody finds.
 *
 * Two things the F-1 review named and this row fixes (§4, F1-01/F1-02):
 * the scroller keeps a right GUTTER so a chip can scroll clear of its own edge
 * rather than being cut through a letter six pixels from a button; and the row
 * centres its children, because a 30px chip and a 36px button sharing a top
 * edge leave the button hanging six pixels below the line.
 *
 * Only ONE icon button. The slicer editor was a second 36px hairline square
 * beside the filter's, six pixels apart, with a third of the same size in the
 * focus row above meaning something else again — three identical squares, three
 * meanings. `tune` stays the filter (it carries the count badge); editing the
 * set is a text link beside Clear, which is what it is.
 */
import React from "react";
import { View } from "react-native";
import { Chip, IconBtn, Txt } from "@/theme/ui";
import { RangeChip } from "@/components/tasks/RangeChip";
import { useLayout } from "@/theme/useLayout";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { activeFilterCount, isDefaultRange } from "@/data/taskFilters";
import { space } from "@/theme/tokens";
import { useTasksStore } from "@/stores/tasks";

export function SlicerRow() {
  const { phone } = useLayout();
  const view = useTasksStore((s) => s.view);
  const slicer = useTasksStore((s) => s.slicer);
  const slicers = useTasksStore((s) => s.slicers);
  const filters = useTasksStore((s) => s.filters);
  const setSlicer = useTasksStore((s) => s.setSlicer);
  const clearAll = useTasksStore((s) => s.clearAll);
  const isNarrowed = useTasksStore((s) => s.isNarrowed);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const openModal = useSessionStore((s) => s.openModal);

  const count = activeFilterCount(filters);
  const chips = (
    <>
      <RangeChip />
      {slicers.map((s) => (
        <Chip
          key={s.id}
          testID={`slicer-${s.id}`}
          label={s.name}
          selected={slicer === s.id}
          onPress={() => void setSlicer(slicer === s.id ? null : s.id, activeFocus)}
        />
      ))}
    </>
  );

  // TF-07: Clear only while there is something to clear. A control that is
  // always there and does nothing most of the time is one people stop reading —
  // the same rule TK-11's "Complete all subtasks" follows.
  // S6-23: the range chip reads "All time" on Done and "Next 90 days" on the
  // other three, and nothing said why. The override is Josh's (7 Sep, "Done
  // shows everything"; resolution #45; TF-01) and it stays — but a filter
  // that changes when you tap a segment is a filter you did not choose, so it
  // is SAID, in the row's right slot beside Slicers, in the pack's hint dress
  // (11, Muted). Only while the range is the default: an explicit preset is
  // the same on every view (TF-01), and then there is nothing to explain.
  const rangeHint = view === "done" && isDefaultRange(filters.range);
  const links = (
    <>
      {rangeHint && (
        <Txt testID="task-range-hint" kind="small" style={{ minHeight: 36, lineHeight: 36 }}>
          Done defaults to all time
        </Txt>
      )}
      {isNarrowed() && (
        <>
          <Txt testID="task-clear" onPress={() => void clearAll(activeFocus)} kind="meta" tone="accentInk" style={{ minHeight: 36, lineHeight: 36 }}>
            Clear
          </Txt>
          {/* A62-04 (the A-6 review, round 2): `Clear` and `Slicers` are two
              separate controls that do unrelated things, and at 393 they sat 6
              px apart in the same size and the same Accent ink with nothing
              between them — one phrase, "Clear Slicers", on every filtered
              phone frame. README Content puts a middle dot between two items on
              one line; Muted, because the dot is not a third control. */}
          <Txt testID="task-links-sep" kind="meta" tone="muted" aria-hidden style={{ minHeight: 36, lineHeight: 36 }}>
            ·
          </Txt>
        </>
      )}
      <Txt testID="slicer-edit-open" onPress={() => openModal("slicer-edit")} kind="meta" tone="accentInk" style={{ minHeight: 36, lineHeight: 36 }}>
        Slicers
      </Txt>
    </>
  );
  const filterButton = (
    <IconBtn
      testID="task-filter-open"
      icon="tune"
      inCard
      badge={count > 0 ? count : undefined}
      accessibilityLabel={count > 0 ? `Filter · ${count} active` : "Filter"}
      onPress={() => openModal("task-filter")}
    />
  );

  // ONE WRAPPING FLOW on a phone (the F-1 review, rounds 1 and 2). It was a
  // horizontal scroller with the controls pinned beside it, and the scroller
  // cut a chip through a letter against its own clip edge — which reads as a
  // rendering fault, not as "there is more". Round 2 measured the second try
  // too: moving the links to a line of their own spent 45 vertical pixels, 9
  // of them inked, on the least frequently needed control in the row, and took
  // the phone from 26% chrome to 31% before the first task.
  //
  // So the chips WRAP, and the links and the button wrap with them. Two lines
  // either way; this way both of them carry something, nothing is clipped, and
  // there is no scroller to discover. Resolution #34's sentence is corrected in
  // §4 — it asked for the scroll to avoid three wrapped rows, and two is what
  // this actually costs.
  if (phone) {
    return (
      <View testID="task-slicers" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
        {chips}
        {links}
        {filterButton}
      </View>
    );
  }

  return (
    <View testID="task-slicers" style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>{chips}</View>
      {links}
      {filterButton}
    </View>
  );
}
