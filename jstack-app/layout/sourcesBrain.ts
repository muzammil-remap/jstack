/**
 * sourcesBrain.ts (R-1) — Brain's published bindings.
 *
 * Separate from `layout/sources.ts` because that file is at its 250-line cap
 * and because the binds there are all Life's; this is the first bind whose
 * store is not `stores/life.ts`. Both are spread into the one `BINDS` record,
 * which stays the single closed list `GET /sections/catalogue` is generated
 * from — the split is a file boundary, not a second registry.
 */
import { useMemo } from "react";
import { formatWhen } from "@/lib/time";
import { fileBelongsTo, fileMetaLine } from "@/data/files";
import { useFilesStore } from "@/stores/files";
import { useRepliesStore } from "@/stores/replies";
import { useSessionStore } from "@/stores/session";
import type { BindDef, BindResult } from "@/layout/bindKit";
import type { BlockRow } from "@/data/types";

const BRAIN_FILES_ROWS = 4;

export const BRAIN_BINDS: Record<string, BindDef> = {
  /**
   * X-1 (FL-03) — Brain › Files: what has arrived lately, from anywhere.
   *
   * The meta line answers the three questions a person has about a file they
   * did not just make: who put it there, what it is, and what it belongs to.
   * `formatWhen` for the last one, never a raw instant (rule 19).
   */
  /**
   * ux X1-02: FOUR rows, as Memory shows four.
   *
   * Uncapped it printed all ten and ran column 2 a thousand pixels past every
   * other column — 74% of the page height at 1366, and at 1024 a 423 x 1032px
   * slab down half a tablet. It also made `all` mean nothing: a link to "the
   * rest" beside a list that is already all of it. The section answers "what
   * arrived lately"; the archive answers "everything", and now the two say
   * different things.
   */
  "files.recent": {
    endpoint: "/files",
    block: "rows",
    label: "Files, newest first",
    use: (): BindResult => {
      const files = useFilesStore((s) => s.recent);
      const openModal = useSessionStore((s) => s.openModal);
      const items = useMemo<BlockRow[]>(
        () =>
          files.slice(0, BRAIN_FILES_ROWS).map((f) => ({
            id: f.id,
            name: f.name,
            // ux X1-04: `fileMetaLine`, the one composer — this list and the
            // task card's showed the same file in two different orders.
            meta: fileMetaLine(f, fileBelongsTo(f)),
            verb: { label: "open", action: "open" as const },
          })),
        [files],
      );
      return {
        items,
        total: files.length,
        act: async (id) => {
          openModal("file", id);
        },
      };
    },
  },

  "brain.replies": {
    endpoint: "/brain/replies",
    block: "rows",
    label: "Answers from your EA",
    use: (): BindResult => {
      const replies = useRepliesStore((s) => s.replies);
      const openModal = useSessionStore((s) => s.openModal);
      /**
       * The rows arrive unread-first from the server and are rendered in that
       * order (RP-02). An unread row says so in its meta rather than in a
       * colour: the section is a published block type and cannot carry a dot,
       * and "New" is legible to somebody who cannot see the difference
       * between two greys anyway.
       */
      const items = useMemo<BlockRow[]>(
        () =>
          replies.map((r) => ({
            id: r.id,
            name: r.text,
            meta: `${r.read ? "" : "New · "}${formatWhen(r.at)}`,
            verb: { label: "open", action: "open" as const },
          })),
        [replies],
      );
      return {
        items,
        act: async (id) => {
          openModal("reply", id);
        },
      };
    },
  },
};
