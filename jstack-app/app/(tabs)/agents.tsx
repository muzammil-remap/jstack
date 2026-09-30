/**
 * Agents — configuration only (ADR-01). Row 14/15 fill stats/portals/
 * history/needseyes/feed/checks/lock. No focus chips (FS-05).
 */
import React, { useEffect, useReducer } from "react";
import { TabScreen } from "@/layout/TabScreen";
import { useAgentsStore } from "@/stores/agents";

export default function AgentsScreen() {
  const summary = useAgentsStore((s) => s.summary);
  const load = useAgentsStore((s) => s.load);
  // A-2: failed with nothing from before to show — the tab says so, and a tap runs its loads again
  const failed = useAgentsStore((s) => s.loadError != null && s.summary == null);
  // N8N-2: a summary with no source is not on its way
  const notConnected = useAgentsStore((s) => s.notConnected.summary === true);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    void load();
  }, [load, attempt]);

  const subtitle = summary ? `${summary.issues} need you · ${summary.runsToday} runs today` : notConnected ? "not connected yet" : "loading…";
  return <TabScreen tab="agents" onRetry={failed ? retry : undefined} title="Agents" subtitle={subtitle} />;
}
