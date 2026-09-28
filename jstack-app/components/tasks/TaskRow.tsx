/**
 * TaskRow — one row in List or Done (TK-03/TK-04/TK-13): a dashed
 * EA-owned checkbox or a solid one, an EA/J owner tag (Josh's rows
 * carry none), title + meta (+ repeat rule, TK-13), a chevron opening
 * the task detail. TK-12: a task from Joce also carries a small
 * "Accept" button right on the row.
 */
import { touchSlop } from "@/lib/webData";
import React from "react";
import { Text, View } from "react-native";
import { BtnSm, Checkbox, LINK_SLOP, Row, Tag, Txt } from "@/theme/ui";
import { Icon } from "@/components/chrome/Icon";
import { WorkMark } from "@/components/tasks/WorkMark";
import { useSessionStore } from "@/stores/session";
import { OWNER_COL } from "@/lib/labelColumn";
import { ownerShort, taskMetaRuns } from "@/lib/taskMeta";
import { useTaskCardStore } from "@/stores/taskCard";
import { useTasksStore } from "@/stores/tasks";
import { useSyncStore } from "@/stores/sync";
import { QUEUED_COMPLETE, queuedIdsIn } from "@/data/transport/outbox";
import { useTokens } from "@/theme/ThemeProvider";
import type { Task } from "@/data/types";

export function TaskRow({ task, last = false }: { task: Task; last?: boolean }) {
  const c = useTokens();
  const requestComplete = useTaskCardStore((s) => s.requestComplete);
  const openTask = useTaskCardStore((s) => s.openTask);
  const acceptTask = useTaskCardStore((s) => s.acceptTask);
  // A-9 (A4R8-09): a completion still in the queue reads done — a reload brings the server's open copy back until it lands
  const queuedDone = useSyncStore((s) => queuedIdsIn(s.entriesNow, QUEUED_COMPLETE).has(task.id));
  const done = task.status === "done" || queuedDone;
  // TK-12 + MU-03: the tag says "somebody else's", and who "somebody else"
  // is depends on who is looking. Hard-coding `owner === "joce"` tagged
  // Joce's own tasks as foreign the moment she was the one holding the
  // session, and left Josh's untagged in her list.
  const mine = useSessionStore((s) => s.isMine);
  // JQ-4: the two letters come from the ROSTER, where they travel with the
  // person, rather than from a map that gave Josh and Joce the same "J".
  const roster = useTasksStore((s) => s.roster);
  const tagLabel = task.owner === "ea" ? "EA" : mine(task.owner) ? null : ownerShort(task.owner, roster);
  // TK-13's repeat rule and TK-06's "delegated N ago" are `taskMetaLine`'s
  // `marks` (P-9, B2-07) — one composition for this row and the board card,
  // split around the high-priority phrase (JQ-3) by the same helper.
  const metaRuns = taskMetaRuns(task, undefined, { marks: true });

  return (
    <Row testID={`task-row-${task.id}`} last={last}>
      <Checkbox
        testID={`task-cb-${task.id}`}
        checked={done}
        ea={task.owner === "ea"}
        accessibilityLabel={`Mark "${task.title}" done`}
        onPress={() => void requestComplete(task)}
      />
      {/* S6-14: the mark has a SLOT, and the slot is there whether or not the
          row has a mark. Without one, a row with "EA" started its title 37px
          right of a row without — four times down one list, the meta lines
          rippling with it. The pack solves this on the waiting row ("type
          label at 48px fixed width so titles align"); `OWNER_COL` is that
          number for this row, beside the analogous constant. */}
      <View style={{ width: OWNER_COL }}>{tagLabel != null && <Tag testID={`task-tag-${task.id}`} label={tagLabel} />}</View>
      {/* no webHitArea on the link: it fills the column below, which fills the
          row, and padding would only push the row apart. Two lines of text do
          not clear the 36px floor on their own, though: the link's line boxes
          take the platform's default font, and on the Linux nightly runner the
          link measured 32px (GL-05, v2.21). So the floor is a `minHeight`, as
          the waiting row's link has. */}
      {/* T-5: a column, so the marker sits UNDER the meta line rather than
          beside the title taking a phone row's width — and outside the link,
          because the marker is a statement and not a control. Inside it,
          tapping "EA working" would open the card, which is the one thing a
          person reading a progress line does not mean. */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="link" {...touchSlop(LINK_SLOP)}
          testID={`task-open-${task.id}`}
          onPress={() => openTask(task.id)}
          style={{ minHeight: 36 }}
        >
          <Txt style={{ textDecorationLine: done ? "line-through" : "none", color: done ? c.muted : c.ink }}>{task.title}</Txt>
          {"\n"}
          {/* JQ-3: the priority phrase is drawn in the accent tone when it is
            high, and in meta otherwise. The runs rejoin to exactly `metaLine`,
            so nothing is lost by splitting it. */}
        {metaRuns.map((r, i) => (
          <Txt key={i} kind="meta" tone={r.accent ? "accentInk" : undefined} testID={r.accent ? `task-priority-${task.id}` : undefined}>
            {r.text}
          </Txt>
        ))}
        </Text>
        <WorkMark work={task.work} taskId={task.id} />
      </View>
      {task.owner === "joce" && <BtnSm testID={`task-accept-${task.id}`} label="Accept" onPress={() => void acceptTask(task.id)} />}
      <View style={{ marginTop: 2 }}>
        <Icon name="chevron_right" size={16} color={c.muted} />
      </View>
    </Row>
  );
}
