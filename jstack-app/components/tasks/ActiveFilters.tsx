/**
 * ActiveFilters — what is narrowing this list, on the list (F-1, TF-04,
 * ADR-44).
 *
 * Before this row an applied filter was visible only inside the dialog that
 * applied it. The list simply got shorter, and the only way to find out why was
 * to reopen the panel — which is the same defect as a search box that keeps its
 * query and does not show it.
 *
 * One chip per selected value, each removable with one tap. The RANGE is not
 * here: it has its own chip in the row above, always visible, and listing it
 * twice would make a person clear it twice.
 *
 * The labels are the readable ones. `in_progress` is a wire value and belongs
 * on the wire; a chip that says it is the app showing its own plumbing.
 */
import React from "react";
import { View } from "react-native";
import { Chip } from "@/theme/ui";
import { FILTER_GROUP_KEYS, activeFilterCount, type FilterGroupKey } from "@/data/taskFilters";
import { space } from "@/theme/tokens";
import { useSettingsStore } from "@/stores/settings";
import { useTasksStore } from "@/stores/tasks";
import { filterValueLabel } from "@/components/tasks/filterLabels";

export function ActiveFilters() {
  const filters = useTasksStore((s) => s.filters);
  const setFilters = useTasksStore((s) => s.setFilters);
  const columns = useTasksStore((s) => s.columns);
  const view = useTasksStore((s) => s.view);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const columnName = (id: string) => columns.find((col) => col.id === id)?.name ?? id;
  // the columns count towards the badge on every view (they are applied
  // wherever they are set), but they only draw a CHIP on the board — so the
  // row's own emptiness is counted the way it is drawn, or a list with nothing
  // but a hidden lane renders an empty gap where the chips would be.
  const shownColumns = view === "board" ? (filters.columns ?? []) : [];
  if (activeFilterCount({ ...filters, columns: shownColumns }) === 0) return null;

  const remove = (key: FilterGroupKey, value: string) => {
    const next = { ...filters, [key]: (filters[key] as string[]).filter((v) => v !== value) };
    void setFilters(next, activeFocus);
  };

  return (
    <View testID="task-active-filters" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      {FILTER_GROUP_KEYS.flatMap((key) =>
        (filters[key] as string[]).map((value) => (
          <Chip
            key={`${key}-${value}`}
            testID={`active-filter-${key}-${value}`}
            label={`${filterValueLabel(key, value)} ✕`}
            selected
            onPress={() => remove(key, value)}
          />
        )),
      )}
      {/* BD-02: the columns the board is showing. Not a `FILTER_GROUP_KEYS`
          member, because it does not filter TASKS — it hides lanes, and the
          server has no business dropping a task because a lane is hidden. On
          the board only, for the same reason the group is: a chip reading
          "Now ✕" over a LIST names something the list is not doing. */}
      {shownColumns.map((id) => (
        <Chip
          key={`columns-${id}`}
          testID={`active-filter-columns-${id}`}
          label={`${columnName(id)} ✕`}
          selected
          onPress={() => void setFilters({ ...filters, columns: (filters.columns ?? []).filter((x) => x !== id) }, activeFocus)}
        />
      ))}
    </View>
  );
}
