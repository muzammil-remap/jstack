/**
 * Today — needs/insights ship real content (row 7); allcal/calendar/
 * tasks/glance/close are row 8. FS-02: reloads on every focus-chip
 * change so the adapter receives `?focus=` and the open decision resets
 * to the first card in the new filter (stores/today.ts `load()`).
 */
import React, { useEffect, useReducer } from "react";
import { TabScreen } from "@/layout/TabScreen";
import { useLifeStore } from "@/stores/life";
import { useRepliesStore } from "@/stores/replies";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTodayStore } from "@/stores/today";


export default function TodayScreen() {
  const composite = useTodayStore((s) => s.composite);
  const load = useTodayStore((s) => s.load);
  const deltaLine = useTodayStore((s) => s.deltaLine);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  const openModal = useSessionStore((s) => s.openModal);
  const habitsLoaded = useLifeStore((s) => s.habits.length > 0);
  // A-2: failed with nothing from before to show — the tab says so, and a tap runs its loads again
  const failed = useTodayStore((s) => s.loadError != null && s.composite == null);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  const loadReplies = useRepliesStore((s) => s.load);

  useEffect(() => {
    void load(activeFocus);
    // RP-03: the "From your EA" card is Today's, so Today loads them.
    void loadReplies();
  }, [load, activeFocus, loadReplies, attempt]);

  useEffect(() => {
    // Close the day's habit chips and At a glance's count read
    // stores/life.ts directly (LF-02: shared with Life's own Habits card,
    // no round-trip through Today's composite) — load it once here since
    // Today can render before the Life tab ever has.
    if (!habitsLoaded) void useLifeStore.getState().load();
  }, [habitsLoaded]);

  // A-15 — the day is the SERVER's or it is nothing. A-22 and B-55 exist to
  // keep this in step with the day `/today` means; falling back to the
  // browser's clock states a day the app has not been told, and on a slow or
  // failed load it would state the wrong one. Same rule as A-06 and B-63.
  const dayName = composite?.dayName ?? "Today";
  const dateLabel = composite?.dateLabel ?? "";

  return (
    <TabScreen tab="today" title={dayName} subtitle={dateLabel} deltaLine={deltaLine()} onReviewWeek={() => openModal("review")} onRetry={failed ? retry : undefined} />
  );
}
