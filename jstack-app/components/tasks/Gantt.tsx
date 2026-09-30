/**
 * Gantt — Tasks' timeline (G-1, ADR-46): a real axis, swimlanes by project,
 * and bars you can move.
 *
 * ADR-12 made this read-only in V2 and ADR-46 reverses it, so the sentence at
 * the foot has been round the loop once: V2 printed "Drag a bar to change
 * dates" with no drag behind it, A-45 removed it as an instruction with no
 * affordance, and this row builds the affordance. It says so again because it
 * is true again, and `e2e/core/gantt.spec.ts` GT-04 is what keeps it true.
 *
 * This file assembles the MODEL — which tasks have a place on the timeline,
 * which lane each belongs to, what "Fit" means — and hands it to
 * `GanttChart.tsx`, which owns the pixels. The split is where the coordinate
 * space begins: nothing above it knows what a day is worth in pixels.
 *
 * LANE ORDER follows the list (GT-03) — first appearance wins — with two lanes
 * pinned last and in this order: "No project" (resolution #16), then
 * "Unscheduled" for tasks with no dates at all. Unscheduled is not an error
 * state; it is where a task waits to be given a place, and dropping one on the
 * chart gives it one (GT-07).
 *
 * `compact` is Waiting on's mini card and renders through `GanttMini`: the same
 * geometry at a scale that fits its container instead of scrolling.
 */
import React, { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { BtnSm, Txt } from "@/theme/ui";
import { GanttChart, type Bar, type Lane } from "@/components/tasks/GanttChart";
import { GanttMini, type MiniBar } from "@/components/tasks/GanttMini";
import type { UnscheduledItem } from "@/components/tasks/GanttUnscheduled";
import { DAY_WIDTH, buildAxis, fitWindow, miniWindow, scheduleOnDay, xForInstant, type Span } from "@/lib/ganttAxis";
import { taskMetaRuns } from "@/lib/taskMeta";
import { addDays, atTime, dayKey } from "@/lib/time";
import { currentParameter } from "@/stores/parameters";
import { resolveRange } from "@/data/taskFilters";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { useTaskEditsStore } from "@/stores/taskEdits";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { Task } from "@/data/types";
import { TWENTY_APP_URL, USE_API_ADAPTER } from "@/data/config";

/** Twenty's own address, for the three "open in Twenty" links (here, Board, Tasks' footer). A real
 * build reads it from `TWENTY_APP_URL` and, with none configured, draws no link rather than a guessed
 * one (ADR-76); the mock keeps its placeholder, so the demo is unchanged. */
export const TWENTY_URL: string | null = TWENTY_APP_URL !== "" ? TWENTY_APP_URL : USE_API_ADAPTER ? null : "https://twenty.example/";
const NO_PROJECT = "No project";
/** the fallback window when the range has no two ends to draw between (`all`,
 * or a half-open custom one): four weeks either side of today, which is what
 * the axis showed before F-1 made the range real. */
const FALLBACK_BACK = -7;
const FALLBACK_FORWARD = 21;
/** the compact card's breathing room either side of its bars' own window
 * (S6-24): a day, so the first and last bars are visibly days rather than the
 * track's own ends. */
const MINI_MARGIN_DAYS = 1;

/** a task's span, when it has one. `due` alone still draws a bar: a task with a
 * deadline and no window is on the timeline that day, 9 to 5 — the hours T-1's
 * date field defaults to, so a bar and a typed date mean the same thing. */
function spanOf(t: Task): Span | null {
  if (t.startsAt != null && t.endsAt != null) return { startsAt: t.startsAt, endsAt: t.endsAt };
  if (t.due != null) return scheduleOnDay(t.due);
  return null;
}

export function Gantt({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const c = useTokens();
  const list = useTasksStore((s) => s.list);
  const range = useTasksStore((s) => s.filters.range);
  const setRange = useTasksStore((s) => s.setRange);
  const openTask = useTaskCardStore((s) => s.openTask);
  const patchTask = useTaskEditsStore((s) => s.patchTask);
  const showToast = useSessionStore((s) => s.showToast);
  const openModal = useSessionStore((s) => s.openModal);
  const clockOffsetMs = useSessionStore((s) => s.clockOffsetMs);
  const days = currentParameter("tasks.rangeDays") as number;

  const nowMs = Date.now() + clockOffsetMs;
  const todayKey = dayKey(new Date(nowMs));
  const window = resolveRange(range, "gantt", days, todayKey);
  const from = window.from ?? addDays(todayKey, FALLBACK_BACK);
  const to = window.to ?? addDays(todayKey, FALLBACK_FORWARD);

  const { lanes, unscheduled } = useMemo(() => groupIntoLanes(list, limit), [list, limit]);

  const commit = useCallback(
    (id: string, next: Span) => {
      void patchTask(id, next).then((refusal) => {
        if (refusal != null) showToast(refusal.reason);
      });
    },
    [patchTask, showToast],
  );

  const onFit = () => {
    const w = fitWindow(lanes.flatMap((l) => l.bars).map((b) => b.span));
    // GT-02: nothing scheduled means nothing to fit to, and a Fit that jumped
    // to today on an empty timeline is a control that appears to do something
    // at random. It says what happened instead.
    if (w == null) {
      showToast("Nothing scheduled to fit");
      return;
    }
    void setRange({ preset: "custom", from: w.from, to: w.to });
  };

  if (compact) {
    const bars: MiniBar[] = lanes
      .flatMap((l) => l.bars)
      .map((b) => ({ taskId: b.taskId, title: b.title, startsAt: b.span.startsAt, endsAt: b.span.endsAt, ea: b.ea }));
    // S6-24: the card's track is the bars' OWN window, not the active range —
    // 90 days across a 308px track made every one-day task a 3px speck. With
    // nothing scheduled there is nothing to fit, and the range's window stands.
    const own = miniWindow(bars, MINI_MARGIN_DAYS);
    return <GanttMini bars={bars} from={own?.from ?? from} to={own?.to ?? to} onOpen={openTask} />;
  }

  const axis = buildAxis(from, to, DAY_WIDTH);
  const inWindow = nowMs >= atTime(from, 0).getTime() && nowMs <= atTime(to, 23, 59).getTime();
  const nowX = inWindow ? xForInstant(new Date(nowMs), from, DAY_WIDTH) : null;
  const empty = lanes.length === 0 && unscheduled.length === 0;

  return (
    <View testID="gantt" style={{ gap: space[2] }}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <BtnSm testID="gantt-fit" label="Fit" outlined onPress={onFit} />
      </View>

      {empty ? (
        <Txt kind="meta">Nothing on the timeline for this focus.</Txt>
      ) : (
        <GanttChart axis={axis} lanes={lanes} unscheduled={unscheduled} from={from} nowX={nowX} onOpen={openTask} onCommit={commit} />
      )}

      <Txt kind="meta" style={{ marginTop: space[2] }}>
        {/* true again, and gated this time: GT-04 drives a real drag and
            asserts the dates it wrote (A-62, recorded in §4). */}
        {TWENTY_URL == null ? "Drag a bar to change its dates." : "Drag a bar to change its dates. "}
        {TWENTY_URL != null && (
          <Text testID="gantt-open-twenty" onPress={() => openModal("external-link", packPayload(TWENTY_URL, "Twenty"))} style={{ color: c.accentInk }}>
            Open in Twenty for the full timeline.
          </Text>
        )}
      </Txt>
    </View>
  );
}

/**
 * GT-03 and resolution #16 — the lanes, in the order they are drawn.
 *
 * First appearance in the list wins, so the lane order is the order the person
 * already sees on List and Board rather than an alphabetical one nobody asked
 * for. "No project" is pinned last whatever position it first appeared in,
 * because it is not a project — it is the absence of one, and a catch-all that
 * floats into the middle reads as a real lane.
 */
function groupIntoLanes(list: Task[], limit?: number): { lanes: Lane[]; unscheduled: UnscheduledItem[] } {
  const scheduled: { bar: Bar; project: string }[] = [];
  const unscheduled: UnscheduledItem[] = [];
  for (const t of list) {
    const span = spanOf(t);
    if (span == null) {
      // S6-29: a FINISHED task waits for nothing. The Gantt's query carries
      // every status (TF-08), so the two tasks the Done tab shows struck
      // through were listed here as work waiting for a date, with no mark to
      // say otherwise — a lane called Unscheduled holding finished work is
      // telling the reader something untrue. A finished task WITH dates keeps
      // its bar, as it always has. `status`, not `completedAt`: a task done
      // before the stamp existed carries none (`Activity.tsx` says the same).
      // The row carries the meta line every other task surface carries, from
      // the one composer (B2-07's rule), so the lane says what each task is.
      if (t.status !== "done") unscheduled.push({ id: t.id, title: t.title, meta: taskMetaRuns(t, undefined, { marks: true }) });
    } else scheduled.push({ bar: { taskId: t.id, title: t.title, span, ea: t.owner === "ea", work: t.work }, project: t.project ?? NO_PROJECT });
  }
  const shown = limit != null ? scheduled.slice(0, limit) : scheduled;

  const order: string[] = [];
  const byProject = new Map<string, Bar[]>();
  for (const { bar, project } of shown) {
    if (!byProject.has(project)) {
      byProject.set(project, []);
      order.push(project);
    }
    byProject.get(project)!.push(bar);
  }
  const named = order.filter((p) => p !== NO_PROJECT);
  const tail = byProject.has(NO_PROJECT) ? [NO_PROJECT] : [];
  return { lanes: [...named, ...tail].map((project) => ({ project, bars: byProject.get(project)! })), unscheduled };
}

/** a day key `n` days from another, without reaching for a Date field. */
