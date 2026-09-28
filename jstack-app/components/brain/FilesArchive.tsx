/**
 * FilesArchive (X-1, FL-03/FL-04) — Brain › Files "all".
 *
 * `SearchableList` rather than `SearchableListDialog`: S-4 split those two on
 * purpose, and this is the case it was split FOR. The dialog version owns the
 * query and nothing else, and the archive has three filters beside the query
 * that all have to reach the same request — folding them into the shared
 * component would push archive-shaped props into the two history dialogs that
 * have no use for them.
 *
 * EVERY FILTER GOES TO THE SERVER, including the text. The alternative — fetch
 * once and narrow in the browser — would be quicker to write and would quietly
 * change what the feature means: the archive is the whole history, not the
 * page of it the device happens to be holding, and `previewText` matching is
 * the backend's index rather than a substring scan the client could do. It
 * also keeps the silo gate on the server, where it belongs.
 *
 * ux S6-31: the list SAYS WHEN IT ENDS ("10 files · that's all", README
 * Principles 2, the Find dialog's own form), every row carries the same
 * `open` the Brain tab's rows carry, the meta names what the file belongs to,
 * and the who-chips are the roster rather than a literal three — the file Dev
 * added could not be filtered for.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { SearchableList } from "@/components/chrome/SearchableListDialog";
import { BtnSm, Meta, Row, Seg, Txt } from "@/theme/ui";
import { fileBelongsTo, FILE_KIND_LABELS, FILE_RANGES, fileMetaLine, type FileRange } from "@/data/files";
import { PERSON_LABEL } from "@/lib/enumLabels";
import { useFilesStore, type FileFilter } from "@/stores/files";
import { useSessionStore } from "@/stores/session";
import { space } from "@/theme/tokens";
import type { Attachment, AttachmentKind, TaskOwner } from "@/data/types";

/** who, as the archive asks it. "Anyone" first because it is the default and
 * the one most often wanted; the rest are everyone the app knows, by name —
 * never a wire id. */
const WHO: { key: string; label: string }[] = [
  { key: "all", label: "Anyone" },
  ...(Object.keys(PERSON_LABEL) as TaskOwner[]).map((id) => ({ key: id as string, label: PERSON_LABEL[id] })),
];

const KINDS: { key: AttachmentKind | "all"; label: string }[] = [
  { key: "all", label: "Any kind" },
  ...(Object.keys(FILE_KIND_LABELS) as AttachmentKind[]).map((k) => ({ key: k, label: FILE_KIND_LABELS[k] })),
];

export function FilesArchive({ onClose }: { onClose: () => void }) {
  const rows = useFilesStore((s) => s.archive);
  const loadArchive = useFilesStore((s) => s.loadArchive);
  const openModal = useSessionStore((s) => s.openModal);

  const [q, setQ] = useState("");
  const [addedBy, setAddedBy] = useState("all");
  // Typed to the vocabulary rather than to `string`: the chips and the request
  // read the same union, so a chip whose key is not a real kind is a `pnpm
  // check` error rather than a filter the server quietly ignores.
  const [kind, setKind] = useState<AttachmentKind | "all">("all");
  const [range, setRange] = useState<FileRange>("all");

  // One place the request is built, so the chips and the query cannot get out
  // of step — a filter applied by one code path and ignored by another is the
  // defect this shape exists to prevent.
  const run = useCallback(
    (next: Partial<FileFilter & { q: string }> = {}) => {
      const filter: FileFilter = { q: next.q ?? q.trim(), addedBy: next.addedBy ?? addedBy, kind: next.kind ?? kind, range: next.range ?? range };
      void loadArchive(filter);
    },
    [q, addedBy, kind, range, loadArchive],
  );

  // B-51: the archive fetches when it OPENS, not only when a filter moves.
  // `SearchableListDialog` does its own first fetch; `SearchableList` is the
  // controlled half and deliberately does not, so this owns it — without it
  // the dialog opened on "Nothing here yet" over a list of ten files.
  useEffect(() => {
    void loadArchive({});
  }, [loadArchive]);

  return (
    <Dialog testID="files-archive-dialog" title="Files" onClose={onClose}>
      <View style={{ gap: space[3], marginBottom: space[4] }}>
        <Seg
          testID="files-archive-who"
          options={WHO}
          value={addedBy}
          onChange={(v) => {
            setAddedBy(v);
            run({ addedBy: v });
          }}
        />
        <Seg
          testID="files-archive-kind"
          // S6-54: seven labels, and they are words — "Spreadsheet" needs 70 px
          // against the 51 a seventh of this card gives it at 393. The only
          // control in the app that does; `who` and `range` fit their row.
          wrapOnPhone
          options={KINDS}
          value={kind}
          onChange={(v) => {
            setKind(v);
            run({ kind: v });
          }}
        />
        <Seg
          testID="files-archive-range"
          options={FILE_RANGES.map((r) => ({ key: r.id, label: r.label }))}
          value={range}
          onChange={(v) => {
            setRange(v);
            run({ range: v });
          }}
        />
      </View>

      <SearchableList<Attachment>
        searchTestID="files-archive-search"
        listTestID="files-archive-rows"
        placeholder="Search names and contents"
        query={q}
        onQuery={(next) => {
          setQ(next);
          run({ q: next.trim() });
        }}
        rows={rows}
        emptyText={q.trim() === "" ? "Nothing here yet" : `No matches for "${q.trim()}"`}
        renderRow={(f, i, last) => (
          <Row key={f.id} last={last} testID={`files-archive-row-${f.id}`} onPress={() => openModal("file", f.id)} accessibilityLabel={`Open ${f.name}`}>
            <View style={{ flex: 1 }}>
              <Txt kind="body">{f.name}</Txt>
              {/* ux X1-04: the one composer, so the archive, the task card and
                  Brain describe a file identically — with what it belongs to
                  last, as the Brain section says it (S6-31). */}
              <Meta>{fileMetaLine(f, fileBelongsTo(f))}</Meta>
            </View>
            {/* the same `open` the tab's rows carry (`RowsBlock`): a row that
                opens with nothing on it saying so reads as a list you can only
                look at */}
            <BtnSm testID={`archive-open-${f.id}`} label="open" onPress={() => openModal("file", f.id)} />
          </Row>
        )}
      />
      {rows.length > 0 && (
        // README Principles 2: "Say when the list ends." The count is the
        // FILTERED one — what the chips and the query left — so it answers
        // the question the person just asked.
        <Meta testID="files-archive-count" style={{ marginTop: space[3] }}>
          {`${rows.length} ${rows.length === 1 ? "file" : "files"} · that's all`}
        </Meta>
      )}
    </Dialog>
  );
}
