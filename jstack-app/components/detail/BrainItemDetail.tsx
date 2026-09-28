/**
 * BrainItemDetail (O-1, OP-01/OP-02) — what a Brain row opens.
 *
 * ADR-52's rule is "everything listed opens", and Brain's rows were the
 * loudest example of it not being true: a Find result and a Latest in row both
 * looked tappable, and one toasted "Opened" while the other did nothing. A row
 * that looks like a door and is not one is worse than a row that does not.
 *
 * The QUERY'S MATCHES are highlighted in the accent tone (OP-01), as the runs
 * `lib/richText.tsx`'s `highlightRuns` cuts — the one splitter, beside
 * `richRuns`, so a match cannot be a differently-cut span that drifts from
 * every other one (hard rule 16). The tags under the text are the ROW's
 * tags, composed by the same `captureTags` (RP-06), so the detail cannot
 * disagree with the list it came from. Until P-1 this header claimed both
 * and the code kept neither: a private `runs()` and the raw silo key (F-69).
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Meta, Tag, Txt } from "@/theme/ui";
import { useDetail } from "@/components/detail/useDetail";
import { useBrainStore } from "@/stores/brain";
import { formatWhen } from "@/lib/time";
import { highlightRuns } from "@/lib/richText";
import { captureTags } from "@/lib/routingLine";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

export function BrainItemDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const c = useTokens();
  const query = useBrainStore((s) => s.findQuery);
  const { item, missing } = useDetail(id, (a, id) => a.getBrainItem(id));

  return (
    <Dialog testID="brain-item" title="From Brain" onClose={onClose}>
      {missing && <Txt testID="brain-item-missing">That item is no longer here.</Txt>}
      {item != null && (
        <View style={{ gap: space[3] }}>
          <Txt testID="brain-item-text">
            {highlightRuns(item.text, query).map((r, i) => (
              <Txt key={i} style={r.hit ? { color: c.accentInk } : undefined} testID={r.hit ? `brain-item-hit-${i}` : undefined}>
                {r.text}
              </Txt>
            ))}
          </Txt>
          <Meta testID="brain-item-meta">
            {item.meta} · {formatWhen(item.at)}
          </Meta>
          {/* W-1 / UP-08: what the screened extract step read out of a shared
              link, rendered through `Txt` AND NOTHING ELSE.
              
              No `RichText`, no `richRuns`, no link detection, no markdown, and
              deliberately not the query-highlighting the capture's own text
              gets above — this is CONTENT FROM OUTSIDE the system, and every
              one of those is a way for a stranger's bytes to become something
              the app renders as its own. `SECURITY.md`'s ingestion threat
              model is the long form; `hardening.test.ts`'s SH-06 grep is the
              guard. The provenance line says where it came from, because text
              with no source is text a person will read as the app's. */}
          {item.extractedText != null && (
            <View testID="brain-item-extracted" style={{ gap: space[1] }}>
              <Meta testID="brain-item-extracted-from">
                {`content saved · ${item.extractedWords ?? 0} words · ${item.extractedFrom ?? "a shared link"}`}
              </Meta>
              <Txt kind="quote" testID="brain-item-extracted-text">
                {item.extractedText}
              </Txt>
            </View>
          )}
          {/* the silo and the types the Librarian set, composed by the SAME
              `captureTags` the row uses (RP-06): the silo reads "family",
              never the wire key (rule 21), and a `sensitive` tag on the row
              is on the detail too (P-1, B-73) */}
          <View testID="brain-item-labels" style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
            {captureTags(item).map((t) => (
              <Tag key={`${t.tone}-${t.label}`} label={t.label} tone={t.tone} />
            ))}
          </View>
        </View>
      )}
    </Dialog>
  );
}
