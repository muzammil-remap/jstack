/**
 * Small, scoped inline-markup support for `MemoryProposal.text` (BR-06/07)
 * — the only field in the app whose fixture data embeds `<b>...</b>`
 * emphasis (e.g. highlighting the corrected dollar amount). React Native
 * has no HTML renderer, so a bare `<Text>{text}</Text>` shows the tags
 * literally; this splits on `<b>` spans and renders them bold. Everything
 * else is printed exactly as it arrived (B-11) — `<b>` is the one tag with a
 * meaning here, and every other angle bracket is a character somebody typed.
 *
 * `stripTags` is still exported, for `ProposalEdit`: an editor opens on the
 * text a person will retype, and the markup markers are not part of it.
 *
 * `highlightRuns` is the other splitter (OP-01; P-1): the query a Brain
 * detail was found by, as hit/plain runs over the capture's text. Weight and
 * highlight stay two functions on purpose — `<b>` is a WEIGHT and a match is
 * a TONE, and one function carrying both would put a second meaning into a
 * primitive four surfaces share (`lib/taskMeta.ts` says the same of its runs).
 */
import React from "react";
import { Text, type TextStyle } from "react-native";
import { type as typeScale } from "@/theme/tokens";

export function stripTags(text: string): string {
  return text.replace(/<\/?[^>]+>/g, "");
}

const NBSP = "\u00A0";

/**
 * A spaced middle dot, bound to both neighbours (README Content: the dot goes
 * "between two things" on ONE line; hard rule 24).
 *
 * It was a closure inside `richRuns` until ux round A63-01, where Agents'
 * Security card ended two lines on a stranded dot at 1366 \u2014 a line built by
 * plain string concatenation, which cannot go through `richRuns` and so never
 * got the rule. A rule that only applies to the one caller that happened to
 * need it first is a rule half the app is missing, so it is a function now and
 * `richRuns` calls it.
 */
export function bindDots(text: string): string {
  return text.replace(/ \u00B7 /g, `${NBSP}\u00B7${NBSP}`);
}

/**
 * A meta line of VALUES, joined so that a wrap can only fall BETWEEN them
 * (ux rounds A63-01 and A64-01).
 *
 * `bindDots` holds a separator between both its neighbours, which is right for
 * a line that fits — but on a line that must wrap it removes the only honest
 * break points and forces the break INSIDE a value. Measured on the Security
 * card at 1366: the status column is 164px and `6 planted · none tripped ·
 * Yesterday 6:00am` is 205px, so it has to take two lines, and with every
 * separator bound it broke as "6 planted · none" / "tripped · Yesterday
 * 6:00am" — a line of a security card, on its own, saying something tripped
 * yesterday. Two more rows split "restored in 14 / min" and "vault /
 * brokered".
 *
 * So each value is bound whole and the separator is bound to the value BEFORE
 * it, with an ordinary space after: the only break points in the line are
 * between one value and the next. A wrapped line therefore ENDS on a
 * separator, which is the form the pack tolerates — it forbids a LEADING
 * middle dot by name, and `CARRIED_DEFECTS_v22.md` A62-01 carries that same
 * trade on the rail. A blemish at the end of a line is not a sentence that
 * says something different from the truth.
 */
export function valueLine(parts: string[]): string {
  return parts.map(unbroken).join(`${NBSP}· `);
}

/**
 * One VALUE, never broken across lines (ux round A63-01).
 *
 * A formatted instant is a single thing said in several words: "Sat 5 Sep,
 * 2:00am" wrapped after the 5 is two lines that each look like a date and
 * neither of which is one. Use it on a composed value \u2014 a date, a duration \u2014
 * and never on prose: `richRuns` already carries the warning that binding
 * every space turns a long meta line into one unbreakable string.
 */
export function unbroken(text: string): string {
  return text.replace(/ /g, NBSP);
}

/**
 * The runs a proposal renders, with two line-break bindings (ux-review
 * R3-04). Two of Brain's four proposals broke at every width: "under Work /
 * · jstack" opened a line with the separator, and "Saturday as / Personal"
 * left the emphasised value alone on its line. README Content puts the
 * middle dot "between two things" on one line, and checklist 5 forbids the
 * single-word orphan — so a middle dot is bound to both neighbours, and the
 * word before an emphasised run is bound to it. Pure, so it can be tested.
 */
export function richRuns(text: string): { text: string; bold: boolean }[] {
  const parts = text.split(/(<b>.*?<\/b>)/g).filter((part) => part !== "");
  // a spaced middle dot becomes NBSP-dot-NBSP in EVERY run: the fixture writes
  // the dot inside the emphasised run (`<b>Work \u00B7 jstack</b>`), and a first
  // cut that bound plain runs only still broke a line after the dot
  const runs = parts.map((part, i) => {
    const m = /^<b>(.*)<\/b>$/.exec(part);
    if (m != null) return { text: bindDots(m[1]), bold: true };
    // B-11: NOT `stripTags` here. A plain run is printed as it stands, angle
    // brackets and all — SH-06's rule is "printed, never interpreted", and
    // deleting the characters is a third thing that satisfies neither. This
    // ran through `stripTags` while proposals were the only caller and their
    // fixture text is prose; C-4 pointed `TextBlock` at the same function and
    // an EA-proposed section's text started losing characters.
    let plain = bindDots(part);
    const nextBold = i + 1 < parts.length && /^<b>/.test(parts[i + 1]);
    if (nextBold) plain = plain.replace(/ $/, NBSP);
    return { text: plain, bold: false };
  });

  // C-4 / UX-D: the LAST value never sits alone on a line of its own. Money's
  // footer wrapped as "\u2026 feed: Redbark, / V2.1" at 1024 and 1366 and read fine
  // at 393 and 1920, which is how it survived three review rounds. The orphan
  // rule had only ever been applied to the word before an emphasised span,
  // because that is where somebody noticed it first \u2014 but the rule is about the
  // end of the LINE, so it belongs at the end of the run. Only the last run:
  // binding every space would make a long meta line one unbreakable string.
  const last = runs[runs.length - 1];
  if (last != null) last.text = last.text.replace(/ (\S+)$/, `${NBSP}$1`);
  return runs;
}

/**
 * The runs a capture's text is drawn in when a query brought it up (OP-01):
 * every case-insensitive occurrence of `query` is a hit, everything else is
 * plain, and the runs rejoin to exactly `text` — a renderer that dropped a
 * run would otherwise lose characters silently. A blank query is one plain
 * run, so no caller branches on it.
 */
/**
 * A title never leaves its last word alone on a line (hard rule 24; P-9,
 * N1-04b and N1-05): the final space becomes NBSP, so a break falls before
 * the last two words. The rule `richRuns` applies to a meta line's last
 * value, for a plain string that is not a run.
 */
export function noOrphan(text: string): string {
  return text.replace(/ (\S+)$/, `${NBSP}$1`);
}

/**
 * A provenance line is a sentence FRAGMENT (README Content: "both calendars ·
 * Alex, 7:02am · silence proposes 1"), and the EA may hand a card a why that
 * ends in a full stop — "…where you look first." before the separator was a
 * terminator and a dot in a row (ux S6-49). One trailing full stop goes.
 */
export function fragment(text: string): string {
  return text.endsWith(".") ? text.slice(0, -1) : text;
}

export function highlightRuns(text: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let i = 0;
  for (;;) {
    const at = lower.indexOf(needle, i);
    if (at === -1) break;
    if (at > i) out.push({ text: text.slice(i, at), hit: false });
    out.push({ text: text.slice(at, at + needle.length), hit: true });
    i = at + needle.length;
  }
  if (i < text.length) out.push({ text: text.slice(i), hit: false });
  return out.length > 0 ? out : [{ text, hit: false }];
}

export function RichText({ text, style }: { text: string; style?: TextStyle }) {
  return (
    <>
      {richRuns(text).map((run, i) => (
        <Text key={i} style={run.bold ? [style, { fontWeight: String(typeScale.weight.emphasis) as TextStyle["fontWeight"] }] : style}>
          {run.text}
        </Text>
      ))}
    </>
  );
}
