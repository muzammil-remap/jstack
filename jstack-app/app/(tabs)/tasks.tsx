/**
 * Tasks — the list, waiting and slicer loads live here (ADR-01), reloading on
 * every focus-chip change (FS-02, tasks half); `TaskViews`'s own
 * setView/setSlicer/setFilters/setQuery each reload the list themselves.
 * The header's "N open" is the store's `openCount` (B-12): `list` is whatever
 * the active segment/slicer/filter narrowed it to (0 while viewing Done),
 * not a stable open count — so the store derives it from the plain list load
 * where that is the request, and fetches it on its own otherwise (P-4).
 */
import React, { useEffect, useReducer } from "react";
import { TabScreen } from "@/layout/TabScreen";
import { useSettingsStore } from "@/stores/settings";
import { useTasksStore } from "@/stores/tasks";
import { staleLine } from "@/lib/lastSeen";

export default function TasksScreen() {
  const waiting = useTasksStore((s) => s.waiting);
  const openCount = useTasksStore((s) => s.openCount);
  const load = useTasksStore((s) => s.load);
  const loadWaiting = useTasksStore((s) => s.loadWaiting);
  const loadSlicers = useTasksStore((s) => s.loadSlicers);
  const loadColumns = useTasksStore((s) => s.loadColumns);
  const loadOpenCount = useTasksStore((s) => s.loadOpenCount);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  // A-2: failed with nothing from before to show — the tab says so, and a tap runs its loads again
  const failed = useTasksStore((s) => s.loadError != null && s.list.length === 0);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const staleAt = useTasksStore((s) => s.staleAt); // A-3: an offline copy says how old it is

  useEffect(() => {
    void load(activeFocus);
    void loadWaiting(activeFocus);
    // F-1: the slicer chips are a stored list now, fetched once with the tab
    void loadSlicers();
    // B-1: Twenty's columns, fetched with the tab and refetched by "Refresh"
    void loadColumns();
    void loadOpenCount(activeFocus);
  }, [load, loadWaiting, loadSlicers, loadColumns, loadOpenCount, activeFocus, attempt]);

  return <TabScreen tab="tasks" title="Tasks" onRetry={failed ? retry : undefined} deltaLine={staleAt != null ? staleLine(staleAt) : undefined} subtitle={`${openCount} open · ${waiting.length} waiting`} />;
}
