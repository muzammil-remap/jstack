/**
 * TaskDetail — the task detail dialog (TK-08/09/10/12), root-mounted
 * via `app/_layout.tsx` keyed off `stores/taskCard.ts`'s `openTaskId`
 * (BUGLOG_v2.md B-14: never render a Dialog inline in a scrolled
 * section). Title, meta with repeat, focus chip, the Twenty link
 * (confirmation) · Subtasks · Accept/Delegate (or, for a task from
 * Joce, Accept-then-delegate, TK-12) · Files (X-1) · the EA's report,
 * if any · Activity.
 *
 * The verbs sit ABOVE Files, the report and the activity: they are why
 * the card is open, and everything under them is the record (ux X1-01).
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, BtnSm, Tag, Txt } from "@/theme/ui";
import { Activity } from "@/components/tasks/Activity";
import { Dialog } from "@/components/chrome/Dialog";
import { EaReport } from "@/components/tasks/EaReport";
import { Subtasks } from "@/components/tasks/Subtasks";
import { TaskEdit } from "@/components/tasks/TaskEdit";
import { WorkMark } from "@/components/tasks/WorkMark";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useSettingsStore } from "@/stores/settings";
import { completedLine, taskMetaLine } from "@/lib/taskMeta";
import { Files } from "@/components/tasks/Files";
import { useDetail } from "@/components/detail/useDetail";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { useUsageStore } from "@/stores/usage";
import { space } from "@/theme/tokens";

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useTaskCardStore((s) => s.detailTask);
  const loadDetailTask = useTaskCardStore((s) => s.loadDetailTask);
  const delegate = useTaskCardStore((s) => s.delegate);
  const acceptTask = useTaskCardStore((s) => s.acceptTask);
  const completeTask = useTaskCardStore((s) => s.completeTask);
  const focuses = useSettingsStore((s) => s.focuses);
  const openModal = useSessionStore((s) => s.openModal);
  const openSheet = useSessionStore((s) => s.openSheet);
  const roster = useTasksStore((s) => s.roster);
  const loadRoster = useTasksStore((s) => s.loadRoster);
  const isMine = useSessionStore((s) => s.isMine);
  // T-4: keyed by task id, so a second card cannot show the first one's runs
  // for the frame between opening and the fetch landing.
  const usage = useUsageStore((s) => s.forTask[id] ?? null);
  const loadTaskUsage = useUsageStore((s) => s.loadTask);

  useEffect(() => {
    void loadDetailTask(id);
    void loadRoster();
    void loadTaskUsage(id);
  }, [id, loadDetailTask, loadRoster, loadTaskUsage]);

  // LG-03: what goal this belongs to, when it belongs to one. FETCHED rather
  // than read from `stores/life.ts`, which is loaded when the Life tab mounts
  // and is therefore empty on a card opened from Tasks or from Find — a chip
  // that appears or not depending on which tab you came through is worse than
  // no chip. And fetched rather than carried on the task: the goal's text
  // living in two tables is the second declaration rule 16 exists to stop.
  // Through the one detail fetch (P-4): a null id shows nothing and asks nothing.
  const { item: goal } = useDetail(task?.goalId ?? null, (a, goalId) => a.getGoal(goalId));
  const goalText = goal?.goal.text ?? null;

  if (task == null || task.id !== id) return null;
  const openSubtasks = task.subtasks.filter((s) => !s.done).length;
  const takers = roster.filter((a) => a.canTakeTasks);
  const delegateLabel = `Delegate to ${takers[0]?.name ?? "the EA"}`;
  const onDelegate = () => (takers.length > 1 ? openSheet("delegate-picker", task.id) : void delegate(task.id, takers[0]?.id));
  const focusName = focuses.find((f) => f.id === task.focus)?.name ?? task.focus;
  // MU-03: "somebody handed me this" is relative to who is holding the
  // session, not to Joce specifically. The Accept verb belongs on a task
  // that is not yours and not the EA's — for either person.
  const fromSomeoneElse = task.owner !== "ea" && !isMine(task.owner);
  // TK-12: who finished it and when, from `completedBy`/`completedAt` — not
  // from prose the server composed, and through the ONE composer the Done
  // row and the board's Done lane use too (S6-10), so the card cannot say it
  // differently from the row that opened it.
  const completed = completedLine(task);

  return (
    <Dialog testID="task-detail" title={task.title} onClose={onClose}>
      <Txt kind="meta" testID="task-detail-meta">
        {/* `completed: false`: the phrase has its own line on the card, below,
            and one sentence twice on one card is worse than once */}
        {taskMetaLine(task, undefined, { marks: true, repeatLabel: "repeat: ", completed: false })}
      </Txt>
      {completed != null && (
        <Txt testID="task-completed-line" kind="meta">
          {completed}
        </Txt>
      )}
      {/* T-5: what an agent is doing with it right now, under the meta line
          and above the edit row — the same marker the list row carries. */}
      <WorkMark work={task.work} taskId={task.id} />
      {/* T-1: the edit row, under the title it edits. */}
      <TaskEdit task={task} />

      {/* ux X1-06: the row centres, and the Tag says so for itself — `Tag`
          hard-codes `alignSelf: "flex-start"`, which beats a parent's
          `alignItems`, so the row's rule alone did nothing (round 2 measured
          both tops still at 370). The focus tag is 15px against a 30px button;
          top-aligned they read as two rows of one. Predates this row, but
          FL-06 took the third item out and made it visible. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2], marginVertical: space[3] }}>
        <Tag testID="task-focus-chip" label={focusName} style={{ alignSelf: "center" }} />
        {goalText != null && <Tag testID="task-goal-chip" label={goalText} style={{ alignSelf: "center" }} />}
        {task.twentyUrl != null && <BtnSm testID="task-link-twenty" label="Twenty" outlined onPress={() => openModal("external-link", packPayload(task.twentyUrl, "Twenty"))} />}
        {/* FL-06: the "Dropbox folder" button is GONE. It composed a URL from
            the task's project name and rendered it as a working link to a
            domain nobody owns (BUGLOG_v2.md A-24 knew it was a placeholder).
            A task's real Dropbox links are its FILES, each carrying the one
            the backend indexed, in the Files section below.
            `tests/unit/files.test.ts` greps for that composition, so the
            helper's name is deliberately not written here — the guard would
            match this comment and pass on prose instead of on code. */}
      </View>

      <Subtasks task={task} usage={usage} />

      {/* TK-06/TK-07: the verb names the DEFAULT delegatee, and only opens a
          picker when there is more than one. A chooser offering one name is a
          tap that asks a question with one answer. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginVertical: space[4] }}>
        {/* TK-11: only while there is something to complete. A verb that is
            always there and does nothing on most cards is a verb people stop
            reading. */}
        {openSubtasks > 0 && (
          <Btn testID="task-complete-all" label="Complete all subtasks" onPress={() => void completeTask(task.id, true, task)} />
        )}
        {fromSomeoneElse && <BtnPrimary testID="task-accept" label="Accept" onPress={() => void acceptTask(task.id)} />}
        {fromSomeoneElse ? (
          <Btn testID="task-delegate" label={delegateLabel} onPress={onDelegate} />
        ) : (
          <BtnPrimary testID="task-delegate" label={delegateLabel} onPress={onDelegate} />
        )}
      </View>

      {/* X-1, ux X1-01: the task's files and its subtasks', BELOW the verbs.
          Placed above them it added ~148px between the subtasks and the two
          controls the card exists for, and at 1024 — where `Dialog` caps at
          85% of 768 — it pushed the whole verb row past the visible edge: the
          card opened with neither Delegate nor Complete on screen. Files is
          reference material, the verbs are the reason the card is open, and
          the reading order should say so. */}
      <Files task={task} />
      <EaReport task={task} />
      <Activity task={task} usage={usage} />
    </Dialog>
  );
}
