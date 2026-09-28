/**
 * decisionCopy.ts (Stage 5d P-4, F-14) — the words a decision verb produces.
 *
 * `toastFor` was a `switch` over the closed verb union inside `stores/today.ts`;
 * a table says the same thing in half the lines and makes a sixth verb a type
 * error here rather than a fall-through. Pure, so it is tested as a table.
 * P-5 brought `whyRuns()` (F-48) and `verbLabel()` (F-74) beside it: this file
 * is where a decision's copy is composed, and nowhere else.
 */
import type { ActionItem, ActionSource, PostActionBody } from "@/data/types";

/** mock v11 `answer()` lines 412-421 verbatim — "go" (approve) substitutes the
 * picked option into the card's own `toast` template; the other four are fixed
 * copy from design/handoff.md's Behaviour section */
const TOAST: Record<PostActionBody["verb"], (card: ActionItem, pick: 1 | 2 | 3) => string> = {
  approve: (card, pick) => card.toast.replace("{n}", String(pick)),
  revise: (card) => `Sent back to revise · ${card.title}`,
  later: (card) => `Later · returns Mon 8am · ${card.title}`,
  never: (card) => `Never · rule offered · ${card.title}`,
  teach: (card) => `Teach · one line to the EA · ${card.title}`,
};

export function toastFor(card: ActionItem, body: PostActionBody, pick: 1 | 2 | 3): string {
  return TOAST[body.verb](card, pick);
}

/** The primary verb's label: an options card names the pick ("Book 2"); every
 * other kind is its verb alone. `DecisionCard` and `WaitingRow` both said
 * this, each in its own line (F-74). */
export function verbLabel(card: ActionItem, pick: 1 | 2 | 3): string {
  return card.kind === "opts" ? `${card.verb} ${pick}` : card.verb;
}

type WhyRun = { text: string; source: ActionSource | null; sourceIndex: number };

/**
 * Split `why` so a source the sentence ALREADY names is linked in place, and
 * one it never names is appended once at the end (DC-09 / D27). Pure, and
 * out of the card's render (F-48): the runs rejoin to exactly the text plus
 * the appended sources, which is what the unit case holds it to.
 */
export function whyRuns(why: string, sources: ActionSource[]): WhyRun[] {
  const parts: WhyRun[] = [];
  let rest = why;
  sources.forEach((src, i) => {
    const at = rest.indexOf(src.label);
    if (at === -1) {
      parts.push({ text: rest, source: null, sourceIndex: -1 });
      rest = "";
      parts.push({ text: ` · ${src.label}`, source: src, sourceIndex: i });
      return;
    }
    // link from the label to the end of that ` · `-separated fragment
    const endRel = rest.slice(at).indexOf(" · ");
    const end = endRel === -1 ? rest.length : at + endRel;
    if (at > 0) parts.push({ text: rest.slice(0, at), source: null, sourceIndex: -1 });
    parts.push({ text: rest.slice(at, end), source: src, sourceIndex: i });
    rest = rest.slice(end);
  });
  if (rest !== "") parts.push({ text: rest, source: null, sourceIndex: -1 });
  return parts;
}
