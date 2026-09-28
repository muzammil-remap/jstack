/**
 * routingLine.ts (R-1, RP-06) — a capture's one meta line, and its tags.
 *
 * V2.1 gave a Latest in row two lines: a `when · source` line and an accent
 * line of routing chips the server had composed as prose. Josh's note of
 * 7 Sep asked for the label tags; putting them under two existing lines makes
 * a four-line row for one sentence of capture. So the routing, the source and
 * the time are ONE line, and the tags are the second.
 *
 * The routing is rendered from the STRUCTURE (`CaptureRouting`) rather than
 * from the server's prose, because the app now has to say different things
 * about the same fields — a question is "question" until it is answered and
 * "replied" afterwards, and the app is the only end that knows the reply
 * arrived. A server sentence cannot be amended by the client without the
 * client parsing it, which is how you end up with a regex over English.
 *
 * A PROVISIONAL filing renders as V2.1's line verbatim, "-> filing .
 * Librarian". That is not back-compatibility for its own sake: provisional
 * means the Librarian has not decided, and that sentence is exactly what the
 * person is being told. `routed` is still read for a record written before
 * this row existed.
 */
import { siloShortName } from "@/data/labels";
import type { BrainItem, CaptureRouting } from "@/data/types";

const STORAGE_LABEL: Record<CaptureRouting["storage"], string> = {
  twenty: "Twenty",
  journal: "journal",
  memory: "memory",
  dropbox: "Dropbox",
};

const FILING = "\u2192 filing \u00b7 Librarian";

/**
 * `answered` is whether a reply exists for this capture — the caller has the
 * replies, not this function. Only a `question` uses it.
 */
export function routingLine(item: BrainItem, answered: boolean): string {
  const r = item.routing;
  if (r == null) return item.routed.join(" \u00b7 ");
  // W-1 / UP-08: what the screened extract step read, when it read anything.
  // The count is the SERVER's (`extractedWords`), and the triage card prints
  // the same number from the same field \u2014 an app that counted for itself would
  // be a second implementation of one fact (rule 16).
  const saved = item.extractedWords != null ? [`content saved \u00b7 ${item.extractedWords} words`] : [];
  if (r.provisional) return [FILING, ...saved].join(" \u00b7 ");
  if (r.kind === "question") return answered ? "question \u00b7 replied" : "question";
  return [`${r.kind} \u2192 ${STORAGE_LABEL[r.storage]}`, ...(r.also ?? []), ...saved].join(" \u00b7 ");
}

type CaptureTag = { label: string; tone: "accent" | "neutral" | "alert" };

/**
 * Silo(s) first in the accent tone, then the content labels, then the
 * sensitivity — and the sensitivity ONLY when it is `sensitive`. `normal` and
 * `open` are the absence of a restriction, and a tag that says "nothing
 * special applies here" on every row is noise that makes the one row where
 * something does apply harder to see. The alert tone exists for the value
 * that changes what a person does with the thing.
 */
export function captureTags(item: BrainItem): CaptureTag[] {
  const r = item.routing;
  const silos = r?.silos ?? [item.labels.silo];
  // NOT filtered. `open` and `unlabelled` are the two most useful tags on the
  // row: one says a human or a rule has looked at this and it is fine, the
  // other says nothing has (R1). Hiding them would leave a row with a silo and
  // no answer to "has anyone classified this yet".
  const labels = r?.labels ?? item.labels.types;
  const tags: CaptureTag[] = silos.map((s) => ({ label: siloShortName(s), tone: "accent" as const }));
  for (const l of labels) tags.push({ label: l, tone: "neutral" });
  if (r?.sensitivity === "sensitive") tags.push({ label: "sensitive", tone: "alert" });
  return tags;
}
