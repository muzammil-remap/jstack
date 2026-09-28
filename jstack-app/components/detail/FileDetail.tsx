/**
 * FileDetail (O-1's shell, filled by X-1 — FL-02) — what a file row opens.
 *
 * THE DECISION THIS FILE OWNS: viewer or link. A file with text the backend
 * extracted (`previewText`, or a `text` kind) is READ HERE; anything else is
 * a thing that lives in Dropbox, and the honest offer is to go there through
 * the external-link confirmation that names the destination. Made once, in
 * one place, because the task card, Brain's section, the archive and Find all
 * open the same dialog — four surfaces each deciding would be four rules that
 * drift (rule 16).
 *
 * TEXT ONLY, through `Txt` (UP-08's rule, arriving early). Extracted text is
 * CONTENT FROM OUTSIDE — a shared page, a PDF somebody sent — and the one
 * safe way to render it is as characters. No markdown, no HTML, no links made
 * live from it. W-1 adds the ingestion threat model that explains why; the
 * rule is here now because this is the row that first renders the text.
 *
 * `GET /files/{id}` is fetched on open rather than read from the list: the
 * signed `url` is minted per request and short-lived, so the copy in a list
 * loaded ten minutes ago would already be stale (§4.17).
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { BtnSm, Meta, Txt } from "@/theme/ui";
import { FILE_KIND_LABELS, formatSize } from "@/data/files";
import { formatWhen } from "@/lib/time";
import { useDetail } from "@/components/detail/useDetail";
import { personLabel } from "@/lib/taskMeta";
import { cachedFiles } from "@/lib/recentFiles";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { space } from "@/theme/tokens";

export function FileDetail({ id, onClose }: { id: string; onClose: () => void }) {
  // FL-05: offline, the cache answers. It has the metadata, the preview and
  // the Dropbox link — everything except `url`, which is exactly the field
  // that would be useless offline anyway. A file in neither place is MISSING.
  const { item: file, missing } = useDetail(id, (a, id) =>
    a.getFile(id).catch(async () => {
      const cached = (await cachedFiles()).find((f) => f.id === id);
      if (cached == null) throw new Error("not on this device");
      return cached;
    }),
  );
  const openModal = useSessionStore((s) => s.openModal);

  if (missing) {
    return (
      <Dialog testID="file" title="File" onClose={onClose}>
        <Txt testID="file-missing">That file is not on this device, and there is no connection to fetch it.</Txt>
      </Dialog>
    );
  }
  if (file == null) {
    return (
      <Dialog testID="file" title="File" onClose={onClose}>
        <Meta testID="file-loading">Loading…</Meta>
      </Dialog>
    );
  }

  const text = file.previewText;
  const meta = [FILE_KIND_LABELS[file.kind], formatSize(file.size), personLabel(file.addedBy), formatWhen(file.at)].filter(Boolean).join(" · ");

  return (
    <Dialog testID="file" title={file.name} onClose={onClose}>
      <View style={{ gap: space[3] }}>
        <Meta testID="file-meta">{meta}</Meta>
        {/* Where it actually lives. Josh asked for Dropbox to be the record
            (Q16) and a person opening a file wants to know which folder it is
            in — that is the difference between "the app has it" and "I can
            find it again without the app". */}
        <Meta testID="file-folder">{file.folder}</Meta>

        {text != null && text !== "" && (
          <View testID="file-viewer">
            <Txt kind="quote">{text}</Txt>
          </View>
        )}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {file.dropboxUrl != null && (
            <BtnSm
              testID="file-open-dropbox"
              label="Open in Dropbox"
              outlined
              onPress={() => openModal("external-link", packPayload(file.dropboxUrl, "Dropbox"))}
            />
          )}
          {/* The signed working copy, when the store holds one. Separate from
              the Dropbox link on purpose: they are two different places, and
              one button that sometimes means one and sometimes the other is a
              button you cannot trust. */}
          {file.url != null && <BtnSm testID="file-open" label="Open the file" outlined onPress={() => openModal("external-link", packPayload(file.url, file.name))} />}
        </View>

        {text == null && file.dropboxUrl == null && file.url == null && <Meta testID="file-nowhere">There is nowhere to open this one yet.</Meta>}
      </View>
    </Dialog>
  );
}
