/**
 * Files.tsx (X-1, FL-01/FL-02, UP-01) — the task card's files.
 *
 * The task's AND every subtask's, in one list, because the server answers it
 * that way (`GET /tasks/{id}/files`). A person filing a receipt does not
 * think about which subtask it belonged to, and a row that belongs to one
 * says so on its own line rather than making the reader hold two lists.
 *
 * Every row opens (O-1's invariant). What it opens is `FileDetail`, which
 * decides between the text viewer and the external-link confirmation — that
 * decision is a property of the FILE, so it lives in one place rather than
 * being made again by each list that shows one.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { AttachButton, AttachChips, useAttachments } from "@/theme/ui/attach";
import { Label, ListCard, Meta, Row, Txt } from "@/theme/ui";
import { fileMetaLine } from "@/data/files";
import { NO_FILES, useFilesStore } from "@/stores/files";
import { useSessionStore } from "@/stores/session";
import { space } from "@/theme/tokens";
import type { Task } from "@/data/types";

export function Files({ task }: { task: Task }) {
  const files = useFilesStore((s) => s.byTask[task.id]) ?? NO_FILES;
  const loadTaskFiles = useFilesStore((s) => s.loadTaskFiles);
  const upload = useFilesStore((s) => s.upload);
  const uploadError = useFilesStore((s) => s.uploadError);
  const openModal = useSessionStore((s) => s.openModal);
  const showToast = useSessionStore((s) => s.showToast);
  const pending = useAttachments();

  useEffect(() => {
    void loadTaskFiles(task.id);
  }, [task.id, loadTaskFiles]);

  const subtaskTitle = (subtaskId: string | undefined) => (subtaskId == null ? undefined : task.subtasks.find((s) => s.id === subtaskId)?.title);

  const onAttach = async (chosen: ReturnType<typeof useAttachments>["files"]) => {
    for (const file of chosen) {
      const stored = await upload(file, { taskId: task.id });
      // A queued upload returns null with no error: it is not a failure, it is
      // a promise the outbox is now holding. Saying "did not go through" would
      // be false, and saying nothing would be worse.
      if (stored != null && "queued" in stored) showToast("Queued · it uploads when you are back on");
    }
    pending.clear();
  };

  // ux X1-05: `space[3]`, the same gap `Subtasks` uses in the same card.
  //
  // ux X1-10: and a bottom margin. Before the reorder the VERB ROW's own
  // bottom margin gave the next label its rhythm; now a card sits there, and
  // ACTIVITY's label landed 3px under it against 12px above its own — the
  // section boundary read as belonging to the wrong side.
  return (
    <View testID="task-files" style={{ gap: space[3], marginTop: space[4], marginBottom: space[4] }}>
      {/* No `sectionId`: the task card's headings do not collapse (EaReport's
          and Subtasks' are the same), and a disclosure control on one of four
          headings would say the other three were stuck. JQ-6 is the reason to
          be careful here — a collapse key is only worth having where the
          section is actually collapsible. */}
      {/* ux X1-05 (P-9): the attach control is 32 px tall and it made the
          heading ROW 32 px, so the label's ink sat 9 px further from its card
          than SUBTASKS' does. The control keeps its size and its hit area;
          the negative margins take it out of the row's height, the way
          `webHitArea` keeps a link's slop out of the layout. */}
      <Label right={<View style={{ marginVertical: -9 }}><AttachButton testID="task-files-attach" label="Attach a file to this task" onFiles={(chosen) => void onAttach(chosen)} /></View>}>Files</Label>

      <AttachChips files={pending.files} onRemove={pending.remove} testID="task-files-pending" />
      {uploadError != null && <Meta testID="task-files-error">{uploadError}</Meta>}

      {files.length === 0 ? (
        <Meta testID="task-files-empty">Nothing here yet</Meta>
      ) : (
        <ListCard>
          {files.map((f, i) => (
            <Row key={f.id} last={i === files.length - 1} testID={`task-file-${f.id}`} onPress={() => openModal("file", f.id)} accessibilityLabel={`Open ${f.name}`}>
              <View style={{ flex: 1 }}>
                <Txt kind="body">{f.name}</Txt>
                {/* ux X1-04: `fileMetaLine`, the one composer — this list and
                    Brain's showed the same file in two different orders. */}
                <Meta>{fileMetaLine(f, subtaskTitle(f.subtaskId))}</Meta>
              </View>
            </Row>
          ))}
        </ListCard>
      )}
    </View>
  );
}
