/**
 * EaReport — the task detail's "The EA's report" card (TK-10): title,
 * quote, file chips, flagged count; Looks right / Revise / Teach →
 * `POST /tasks/{id}/report`. Revise toasts the fixed copy; Teach opens
 * the same one-line sheet decision cards use (mock v11 `taskDlg()`'s
 * report block routes its own `data-act="teach"` to `acts.teachSheet`).
 */
import React, { useMemo } from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Card, CardTitle, Inset, Label, Tag, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useTaskCardStore } from "@/stores/taskCard";
import { NO_FILES, useFilesStore } from "@/stores/files";
import { space } from "@/theme/tokens";
import type { Task } from "@/data/types";

export function EaReport({ task }: { task: Task }) {
  const submitReport = useTaskCardStore((s) => s.submitReport);
  const openSheet = useSessionStore((s) => s.openSheet);
  // What the EA produced for this task, from the one files table. `Files.tsx`
  // has already loaded it for this card; this reads the same store rather than
  // fetching a second time.
  const taskFiles = useFilesStore((s) => s.byTask[task.id]) ?? NO_FILES;
  const deliverables = useMemo(() => taskFiles.filter((f) => f.addedBy === "ea"), [taskFiles]);
  const report = task.report;
  if (report == null) return null;

  // a refused report has said why (the store's toast): nothing to confirm, nothing to open
  const onRevise = async () => {
    if ((await submitReport(task.id, "revise")) == null) return;
    useSessionStore.getState().showToast("Revision requested · the EA redoes the flagged part");
  };
  const onTeach = async () => {
    if ((await submitReport(task.id, "teach")) == null) return;
    openSheet("teach", packPayload(task.id, task.title));
  };

  return (
    <View testID="ea-report" style={{ gap: space[3] }}>
      <Label>{"The EA's report"}</Label>
      <Card>
        <CardTitle>{report.summary}</CardTitle>
        <Inset style={{ marginTop: space[3] }}>
          <Txt kind="quote">{report.body}</Txt>
        </Inset>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3] }}>
          {/* X-1 (FL-01/FL-06): the chips are real files now. They used to come
              from `TaskReport.files`, a `{ name, ref }` pair that existed only
              here — the chip said `export.csv` and there was nothing behind it
              to open. They are the same deliverables the card's Files section
              lists, shown here because the report is where a person asks "what
              did it produce". They stay LABELS rather than becoming a second way
              to open the same file: the Files section directly below is the
              list, every row of it opens, and two open paths to one record is
              the drift rule 16 exists to stop. */}
          {deliverables.map((f) => (
            <Tag key={f.id} testID={`report-file-${f.id}`} label={f.name} />
          ))}
          {report.flagged > 0 && <Tag label={`${report.flagged} flagged`} />}
        </View>
        <View style={{ flexDirection: "row", gap: space[2], marginTop: space[4] }}>
          <BtnPrimary testID="report-accept" label="Looks right" onPress={() => void submitReport(task.id, "accept")} />
          <Btn testID="report-revise" label="Revise" onPress={() => void onRevise()} />
          <Btn testID="report-teach" label="Teach" onPress={() => void onTeach()} />
        </View>
      </Card>
    </View>
  );
}
