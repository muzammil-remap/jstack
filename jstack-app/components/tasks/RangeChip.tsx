/**
 * RangeChip — the first item of the slicer row, on every task view (F-1,
 * TF-01/TF-02, ADR-44).
 *
 * The range is the one filter that is ALWAYS on: a group nobody selected
 * filters nothing, but a range nobody selected still decides which tasks are
 * on the screen. So it is never in the panel — a filter that is always doing
 * something and is only visible two taps away is a filter people forget is on,
 * and then read the list as if it were everything.
 *
 * The label is composed from `tasks.rangeDays` by the same function the server
 * filters with (`data/taskFilters.ts`), so raising the parameter to 120 moves
 * the chip and the list together. A chip that said "Next 90 days" over a
 * 30-day list would be worse than no chip.
 */
import React from "react";
import { Chip } from "@/theme/ui";
import { currentParameter } from "@/stores/parameters";
import { rangeLabel } from "@/data/taskFilters";
import { todayKey } from "@/lib/time";
import { useSessionStore } from "@/stores/session";
import { useTasksStore } from "@/stores/tasks";

export function RangeChip() {
  const view = useTasksStore((s) => s.view);
  const range = useTasksStore((s) => s.filters.range);
  const openModal = useSessionStore((s) => s.openModal);
  const days = currentParameter("tasks.rangeDays") as number;

  return (
    <Chip
      testID="task-range"
      // "· edit" says the chip is a control. The other chips in this row are
      // toggles and read as toggles; this one opens something, and a chip that
      // looks like its neighbours but behaves differently is a small lie.
      label={`${rangeLabel(range, view, days, todayKey())} · edit`}
      // ALWAYS selected, because the range is always in force — even "All time"
      // is a choice somebody is looking at. Wearing the unselected style in a
      // row of on/off toggles made the one filter that never stops working read
      // as the one that is off (the F-1 review, §4 F1-04).
      selected
      onPress={() => openModal("task-range")}
    />
  );
}
