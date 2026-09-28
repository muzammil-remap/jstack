/**
 * Activity — the task detail's activity list (TK-08): who did what,
 * when, most recent first — and, since T-4, what each agent run spent
 * (US-01, US-02).
 *
 * A run line is attached to the activity entry that NAMES it (`usageId`)
 * rather than listed separately, because "Reconciliation complete" and
 * "EA · claude-sonnet-5 · 9,800 in · 2,400 out · $0.03" are one event
 * described twice. A usage row nothing claims still shows — as its own line,
 * in its place in the order — because an unexplained cost is worse than an
 * ugly list. Runs against a SUBTASK are not here at all: `Subtasks.tsx` lists
 * them under the subtask they belong to.
 */
import React from "react";
import { View } from "react-native";
import { Label, ListCard, Meta, Row, Txt } from "@/theme/ui";
import { formatWhen } from "@/lib/time";
import { personLabel } from "@/lib/taskMeta";
import { space } from "@/theme/tokens";
import { usageLine, usageTotalLine } from "@/lib/usage";
import type { Task, Usage, UsageSummary } from "@/data/types";

type Line = { key: string; at: string; text: string; meta: string; runs: Usage[] };

/** activity entries and unclaimed task-level runs, newest first. */
function lines(task: Task, usage: UsageSummary | null): Line[] {
  const rows = usage?.rows ?? [];
  const claimed = new Set(task.activity.map((a) => a.usageId).filter((id): id is string => id != null));
  const out: Line[] = task.activity.map((a, i) => ({
    key: `${a.at}-${i}`,
    at: a.at,
    text: a.text,
    meta: `${personLabel(a.actor)} · ${formatWhen(a.at)}`,
    // `subtaskId == null` as well as the join: an entry may NAME a subtask's
    // run ("Bundaberg memo drafted" names u4) and that is true — but the row
    // is drawn once, under the subtask it belongs to (US-02). `usageId` says
    // what a line is ABOUT; where the numbers go is decided by the row.
    runs: rows.filter((u) => u.id === a.usageId && u.subtaskId == null),
  }));
  for (const u of rows) {
    if (claimed.has(u.id) || u.subtaskId != null) continue;
    out.push({ key: `usage-${u.id}`, at: u.at, text: "Agent run", meta: usageLine(u), runs: [] });
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function Activity({ task, usage }: { task: Task; usage: UsageSummary | null }) {
  const rows = lines(task, usage);
  if (rows.length === 0) return null;
  // TK-11/US-02: a total only once the task is finished — "a completed task",
  // which is the status and not `completedAt` (a task done before T-3 carries
  // no stamp). Mid-task it would be a number that changes every time an agent
  // breathes, presented as a result.
  const total = task.status === "done" && usage != null ? usageTotalLine(usage) : null;

  return (
    <View testID="task-activity" style={{ gap: space[3] }}>
      <Label>Activity</Label>
      <ListCard>
        {rows.map((line, i) => (
          <Row key={line.key} last={i === rows.length - 1 && total == null}>
            <View style={{ flex: 1 }}>
              <Txt>{line.text}</Txt>
              {/* D-1: `proseDate` printed the day and nothing else — "EA ·
                  6 September" for a run that finished at 2:14am. An activity
                  line is about WHEN, so it gets the time as well, through the
                  one formatter every other surface uses (TK-13, resolution
                  #58: this row lands before the task rows so it is written
                  once). */}
              <Meta>{line.meta}</Meta>
              {line.runs.map((u) => (
                <Meta key={u.id} testID={`task-usage-${u.id}`}>
                  {usageLine(u)}
                </Meta>
              ))}
            </View>
          </Row>
        ))}
        {total != null && (
          <Row last>
            <Txt testID="task-usage-total" kind="meta">
              {total}
            </Txt>
          </Row>
        )}
      </ListCard>
    </View>
  );
}
