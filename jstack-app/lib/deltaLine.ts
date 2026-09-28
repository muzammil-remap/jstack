/**
 * The "what changed while you were away" line (OF-09, CD-02).
 *
 * A pure function rather than store code, for the reason seam 9 put the sync
 * status in `lib/syncStatus.ts`: composing a sentence is not state, it is a
 * reading of state, and the store is at its 200-line cap because everything
 * that could be a reading kept being written into it.
 *
 * The counts come off the delta's own ids, so the line cannot say a number the
 * block does not name — the second-copy failure V2.1 kept finding (rule 16).
 */
import type { Delta } from "@/data/types";

/**
 * @param delta   what the server said moved, or undefined on a cold open
 * @param serverLine the server's own sentence, shown when there is no delta
 *
 * `removed` is named only when it is non-empty: a real backend fills it, the
 * mock never does, and "0 gone" is noise in a line meant to be glanced at.
 */
export function composeDeltaLine(delta: Delta | undefined, serverLine: string | undefined): string | undefined {
  if (delta == null) return serverLine;

  const parts: string[] = [];
  if (delta.added.length > 0) parts.push(`${delta.added.length} new`);
  if (delta.changed.length > 0) parts.push(`${delta.changed.length} changed`);
  if (delta.removed.length > 0) parts.push(`${delta.removed.length} gone`);

  // An empty delta is an answer, not a missing one. Saying nothing here would
  // leave the previous line on screen, which would be a lie by omission.
  return parts.length === 0 ? "Nothing changed while you were away." : `Since you last looked: ${parts.join(", ")}.`;
}
