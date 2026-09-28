/** Brain — the entry/latest/memory/rules load lives here (ADR-01), reloading on every focus-chip change (FS-02, brain half). */
import React, { useEffect, useReducer } from "react";
import { TabScreen } from "@/layout/TabScreen";
import { useBrainStore } from "@/stores/brain";
import { staleLine } from "@/lib/lastSeen";
import { useRepliesStore } from "@/stores/replies";
import { useSettingsStore } from "@/stores/settings";

export default function BrainScreen() {
  const load = useBrainStore((s) => s.load);
  const activeFocus = useSettingsStore((s) => s.activeFocus);
  // A-2: failed with nothing from before to show — the tab says so, and a tap runs its loads again
  const failed = useBrainStore((s) => s.loadError != null && s.latestIn.length === 0);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  const staleAt = useBrainStore((s) => s.staleAt); // A-3: an offline copy says how old it is

  // R-1: replies are their own endpoint with no `?focus=`, so they load once
  // rather than on every focus-chip change. Latest in reads them to say
  // "replied", and Brain > Replies lists them.
  const loadReplies = useRepliesStore((s) => s.load);

  useEffect(() => {
    void load(activeFocus);
    void loadReplies();
  }, [load, activeFocus, loadReplies, attempt]);

  return <TabScreen tab="brain" onRetry={failed ? retry : undefined} deltaLine={staleAt != null ? staleLine(staleAt) : undefined} title="Brain" subtitle="capture, recall, and the memory it runs on" />;
}
