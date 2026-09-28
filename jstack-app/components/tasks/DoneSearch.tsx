/**
 * DoneSearch — Tasks' Done segment (TK-07): a search field filtering
 * done rows server-side (`?q=`), "No matches." when none, done rows
 * keep their EA meta and cost (TaskRow's own `meta` string already
 * carries that).
 *
 * S-4: the field and the list come from `SearchableList` — the same component
 * the two history dialogs use, one layer down. Not the DIALOG version: this is
 * a segment inside the Tasks tab, and wrapping it in a dialog to share code
 * would be the refactor changing what the screen is.
 */
import React from "react";
import { View } from "react-native";
import { SearchableList } from "@/components/chrome/SearchableListDialog";
import { TaskRow } from "@/components/tasks/TaskRow";
import { useTasksStore } from "@/stores/tasks";
import { space } from "@/theme/tokens";

export function DoneSearch() {
  const list = useTasksStore((s) => s.list);
  const q = useTasksStore((s) => s.q);
  const setQuery = useTasksStore((s) => s.setQuery);

  return (
    <View testID="done-search" style={{ gap: space[3] }}>
      <SearchableList
        searchTestID="done-search-input"
        listTestID="done-list"
        // the empty line here has never carried a testID, and adding one to
        // match the histories would be a shipped change dressed as a refactor
        emptyTestID={null}
        placeholder="Search what you and the agents finished"
        query={q}
        onQuery={(text) => void setQuery(text)}
        rows={list}
        renderRow={(task, _i, last) => <TaskRow key={task.id} task={task} last={last} />}
      />
    </View>
  );
}
