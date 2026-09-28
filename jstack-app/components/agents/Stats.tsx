/**
 * Stats — Agents' "Runs and spend" card (AG-01): four stat cards (18px
 * serif number via `<Stat>`, 11.5 label), equal to `GET /agents/summary`.
 */
import React from "react";
import { View } from "react-native";
import { Card, Dot, Section, Stat, Txt } from "@/theme/ui";
import { Sens } from "@/components/chrome/Sens";
import { useAgentsStore } from "@/stores/agents";
import { space } from "@/theme/tokens";
import { moneyPrecise } from "@/lib/money";

export function Stats() {
  const summary = useAgentsStore((s) => s.summary);

  if (summary == null) return null;

  const cells: { id: string; label: string; node: React.ReactNode }[] = [
    { id: "runs", label: "Runs today", node: <Stat testID="stat-runs">{summary.runsToday}</Stat> },
    { id: "success", label: "Success", node: <Stat testID="stat-success">{summary.successPct}%</Stat> },
    { id: "spend", label: "Spend today", node: <Sens testID="stat-spend" kind="stat">{moneyPrecise(summary.spendToday)}</Sens> },
    {
      id: "issues",
      label: "Agent issues",
      node: (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Stat testID="stat-issues">{summary.issues}</Stat>
          {summary.issues > 0 && <Dot kind="alert" testID="stat-issues-dot" />}
        </View>
      ),
    },
  ];

  return (
    <Section testID="agents-stats-section" sectionId="agents-stats" title={"Runs and spend"}>
      {/* A wrapping flex row with `flexGrow: 1` lets the last row's orphan
          stretch to the full column — Goals alone on row 2 at three times the
          width of the cards above it, the "amateur" read Josh called out on
          the v1.1 frames (ux-review D9/D8). A fixed basis fills whole rows
          instead: two across on the phone, four on the desktop grid the
          handoff specifies ("Portals grid 4 × 2"). */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: 8 }}>
        {cells.map((cell) => (
          <Card key={cell.id} testID={`stat-card-${cell.id}`} style={{ flexBasis: "47%", flexGrow: 1, minWidth: 90 }}>
            {cell.node}
            <Txt kind="label" style={{ marginTop: 2 }}>{cell.label}</Txt>
          </Card>
        ))}
      </View>
    </Section>
  );
}
