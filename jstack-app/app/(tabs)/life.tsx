/** Life — goals, habits, people, money, health, learning (row 13). */
import React, { useEffect, useReducer } from "react";
import { TabScreen } from "@/layout/TabScreen";
import { useLifeStore } from "@/stores/life";
import { useSettingsStore } from "@/stores/settings";

export default function LifeScreen() {
  const load = useLifeStore((s) => s.load);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  // A-2: failed with nothing from before to show — the tab says so, and a tap runs its loads again
  const failed = useLifeStore((s) => s.loadError != null && s.goals.length === 0 && s.habits.length === 0);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    void load(activeFocus);
  }, [load, activeFocus, attempt]);

  return (
    <TabScreen
      tab="life"
      onRetry={failed ? retry : undefined}
      title="Life"
      subtitle="goals, habits, people, money and health"
      footer="Each section is a template the EA configures; you edit or revert."
    />
  );
}
