/**
 * enumLabels.ts (Stage 5d P-5, F-56 + F-23) — the words for every wire enum
 * a row prints, in one place.
 *
 * Hard rule 21: a wire enum never reaches the screen. Each map is a
 * `Record<union, string>` with NO fallback — a new member of the union is a
 * type error here, and `tests/unit/enumLabels.test.ts` spells each union out
 * as literals so the map cannot drift from the type it claims to cover.
 *
 * Before this file `VIA_LABEL` lived in `agents/History.tsx` and was imported
 * by `HistoryDialog.tsx`, both writing `VIA_LABEL[x] ?? x` — a fallback the
 * Record type made unreachable and which would have printed the enum if it
 * ever fired; `RulesEditDialog` carried its own scope and mode words with
 * `?? rule.scope`; `FindDialog` its own `KIND_LABEL` with no completeness
 * test; `taskMeta.personLabel` a four-way ternary; and `DecisionDetail`
 * printed `via` and `verb` raw while `History` labelled the same fields.
 */
import type { ActionHistoryEntry, AutonomyRule, SearchKind, TaskOwner } from "@/data/types";
import type { ENDPOINTS } from "@/layout/sources";

/** README Content: sentence case everywhere except section labels and proper
 * nouns — so "Telegram" (ux-review R1-12), and the other two as they are. */
export const VIA_LABEL: Record<ActionHistoryEntry["via"], string> = { app: "app", telegram: "Telegram", expiry: "expiry" };

/** The verbs are already the words a person uses for them. The map exists so
 * a sixth verb is a type error here rather than a raw member on a row, and so
 * `DecisionDetail` and `History` cannot disagree about any of them. */
export const VERB_LABEL: Record<ActionHistoryEntry["verb"], string> = {
  approve: "approve",
  revise: "revise",
  later: "later",
  never: "never",
  teach: "teach",
  undone: "undone",
};

/** `all`, or one card kind — the same members `ActionKind` carries, in the
 * order the rule editor's chips show them (a Record keeps insertion order). */
export const SCOPE_LABEL: Record<AutonomyRule["scope"], string> = {
  all: "Everything",
  triage: "Filing things that arrive",
  opts: "Choices between options",
  quote: "Quotes",
  bill: "Bills",
  section: "Changes to a tab",
  parameter: "Changes to a setting",
  rule: "Rules like this one",
};

export const MODE_LABEL: Record<AutonomyRule["mode"], string> = { auto: "Do it — tell me after", ask: "Ask me first" };

/** §7's group order is the SERVER's; these are only the words for it. */
export const KIND_LABEL: Record<SearchKind, string> = {
  task: "Tasks",
  subtask: "Subtasks",
  brain: "Brain",
  reply: "Replies",
  file: "Files",
  decision: "Decisions",
  issue: "Issues",
  learning: "Learning",
  goal: "Goals",
  habit: "Habits",
  person: "People",
  rule: "Rules",
};

/** The four owners by name. The roster carries the same four; this copy is
 * accepted because it runs where no roster is loaded — file meta, usage lines,
 * search snippets (F-23). "ea" is a proper noun on screen (ux-review R6-02). */
export const PERSON_LABEL: Record<TaskOwner, string> = { josh: "Josh", joce: "Joce", ea: "EA", dev: "Dev" };

/**
 * The nouns a section's `source.endpoint` reads as on the proposal card (ux
 * S6-07): "reads Learning", never "reads /learning". Keyed by the catalogue's
 * closed list (`ENDPOINTS`, `layout/sources.ts`) through a type-only import,
 * so an endpoint added there is a type error here rather than a route on
 * screen.
 */
export const ENDPOINT_LABEL: Record<(typeof ENDPOINTS)[number], string> = {
  "/life": "Life",
  "/people": "People",
  "/money": "Money",
  "/learning": "Learning",
  "/health": "Health",
  "/goals": "Goals",
  "/habits": "Habits",
  "/usage": "Usage",
  "/brain/replies": "Replies",
  "/files": "Files",
};

/** `source.endpoint` is a string on the wire; one the catalogue does not know
 * is shown as it came, as `personLabel` does for a person. */
export function endpointLabel(endpoint: string): string {
  return (ENDPOINT_LABEL as Record<string, string>)[endpoint] ?? endpoint;
}
