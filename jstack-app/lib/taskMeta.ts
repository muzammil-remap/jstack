/**
 * The one composer for a task's meta line (D-1, ADR-47, TD-04).
 *
 * `Task.meta` used to be a sentence the SERVER wrote — "JSTACK · today ·
 * high", "EA · 2:14am · 1,387 rows · $0.03 · report attached". Four surfaces
 * printed it verbatim, so the app had no say in how a task described itself
 * and no way to render the time in the reader's own zone. Worse, the parts it
 * mixed are not all facts about the same thing: the source and the cost are
 * the server's, while the due date and the priority are fields the app already
 * has and renders elsewhere in its own words.
 *
 * So the server now sends `metaParts` — the pieces only it knows — and this
 * composes the line. One function, four callers, and the order is fixed here
 * rather than argued about per surface: **source · due · high · note · cost**.
 *
 * `formatDate`, never `formatWhen`: `due` is a day key with no clock in it,
 * and formatting it as an instant would invent a midnight the task never had
 * (resolution #6).
 */
import { dayKey, formatAgo, formatDate, formatTime12, formatWhen, now } from "@/lib/time";
import type { AgentRoster, Task, TaskOwner, Work } from "@/data/types";
import { PERSON_LABEL } from "@/lib/enumLabels";
import { TASK_PRIORITY_KNOWN } from "@/data/config";

/**
 * The one map from a wire id to the name a person reads (T-4).
 *
 * "ea" is a proper noun on screen (README Content), and printing the raw key
 * put `ea` twenty pixels under three `EA`s on the same card (ux-review R6-02).
 * There were three copies of this by the time usage lines needed a fourth —
 * `Activity.tsx`'s `actorLabel`, `TaskDetail.tsx`'s completed-by chain and
 * `TaskRow.tsx`'s owner tag — each covering a different subset of the four
 * owners. The names are `PERSON_LABEL`'s (F-23); an unknown id comes back
 * unchanged rather than becoming "Josh": inventing a name for a value nobody
 * recognised is worse than showing it.
 */
export function personLabel(id: string): string {
  return isOwner(id) ? PERSON_LABEL[id] : id;
}

function isOwner(id: string): id is TaskOwner {
  return Object.prototype.hasOwnProperty.call(PERSON_LABEL, id);
}

/**
 * The priority, in words (JQ-3, Josh 8 Sep).
 *
 * It used to print the bare word "high" and print NOTHING for the other two —
 * marking the exception rather than labelling the rule, which is a real design
 * position and is not what a person scanning a list for what to do next wants.
 * Josh: "some task cards missing their priority in the subtext… make it
 * readable, 'high priority'". So all three say so, and the pop colour does the
 * work the omission used to do.
 *
 * REMAP (Phase 4): only where the priority is a fact. The contract requires the
 * field, so a source with none — Twenty on the n8n build, until Josh adds the
 * field — still sends one, and printing it would put "medium priority" on
 * every task. `!== false`, so a build that does not say keeps the line as it was.
 */
function priorityPhrase(task: Task): string {
  return TASK_PRIORITY_KNOWN !== false ? `${task.priority} priority` : "";
}

/**
 * `marks` (P-9, B2-07): the two suffixes a LIST ROW carries — TK-13's repeat
 * rule, unless the server's own parts already say it (fixture t4's meta is
 * "EA · recurring · every Mon 8am · $0.05", and appending said the rule twice,
 * wrapping to say it — ux-review R2-06), and TK-06's "delegated N ago", which
 * reads off `delegatedAt` because the WHEN is what makes the line worth a
 * person's attention. Composed here so the list row and the board card cannot
 * describe one task differently; the card's own "repeat: …" is TK-08's pin.
 */
export function taskMetaLine(task: Task, nowDate?: Date, opts?: { marks?: boolean; repeatLabel?: string; completed?: boolean }): string {
  const parts = task.metaParts ?? {};
  const line = [
    parts.source,
    task.due != null ? formatDate(task.due, nowDate) : undefined,
    priorityPhrase(task),
    parts.note,
    parts.cost,
  ]
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .join(" · ");
  if (!opts?.marks) return line;
  // the card labels the rule (TK-08's "repeat: every Mon 8am") and says it even
  // when the line already names it as "recurring · …"; the rows add the bare
  // rule only when the line does not (P-13, F-53)
  const saysRule = task.repeat != null && (opts.repeatLabel != null || !line.includes(task.repeat.rule));
  const withRepeat = saysRule ? `${line} · ${opts.repeatLabel ?? ""}${task.repeat!.rule}` : line;
  const withDelegated = task.delegatedAt != null ? `${withRepeat} · delegated ${formatAgo(task.delegatedAt, nowDate)}` : withRepeat;
  // TK-12's other half (ux round S6-10): a finished task's row says when and
  // by whom. The Done tab, the board's Done lane and the card's meta all
  // described a finished task as if it were still running, with a
  // strikethrough for the only clue. `completed: false` is the CARD's — it
  // has carried the same phrase on a line of its own since T-3
  // (`task-completed-line`), and one sentence twice on one card is worse than
  // once. The phrase is composed once, below, so the two cannot drift.
  const done = completedLine(task, nowDate);
  return done != null && opts.completed !== false ? `${withDelegated} · ${done}` : withDelegated;
}

/**
 * "Completed · EA · Yesterday 2:14am" — who finished it, then when (TK-11,
 * TK-12), from `completedBy`/`completedAt` and never from prose. `null` while
 * the task is open or was finished before the stamp existed (a task done
 * before T-3 carries no `completedAt`; `Activity.tsx` says the same). Josh is
 * the default completer the card has always assumed. One composer for the
 * card's own line, the Done row and the board's Done lane (rule 16).
 */
export function completedLine(task: Task, nowDate?: Date): string | null {
  if (task.status !== "done" || task.completedAt == null) return null;
  return `Completed · ${personLabel(task.completedBy ?? "josh")} · ${formatWhen(task.completedAt, nowDate)}`;
}

/**
 * The same line, split so the high-priority phrase can be drawn in the accent
 * tone and the rest in meta (JQ-3).
 *
 * A split rather than markup: `lib/richText.tsx`'s runs carry WEIGHT, and what
 * this needs is a TONE. Adding a colour to `richRuns` would put a second
 * meaning into a primitive four other surfaces share, to serve one phrase on
 * one line. The runs always rejoin to exactly `taskMetaLine`, which is the
 * property the test pins — a renderer that drops a run would otherwise lose
 * text silently.
 */
export function taskMetaRuns(task: Task, nowDate?: Date, opts?: { marks?: boolean; repeatLabel?: string; completed?: boolean }): { text: string; accent: boolean }[] {
  const line = taskMetaLine(task, nowDate, opts);
  const phrase = priorityPhrase(task);
  if (task.priority !== "high" || phrase === "") return [{ text: line, accent: false }];
  const at = line.indexOf(phrase);
  if (at === -1) return [{ text: line, accent: false }];
  return [
    { text: line.slice(0, at), accent: false },
    { text: phrase, accent: true },
    { text: line.slice(at + phrase.length), accent: false },
  ].filter((r) => r.text !== "");
}

/**
 * The agent working marker's line (T-5, WK-02) — here rather than in the
 * component because four surfaces draw it (the list row, the card, the board
 * card and the Gantt bar) and a marker that reads differently on two of them
 * is worse than no marker.
 *
 *   running   "EA working · since 2:14am"
 *   queued    "EA · queued"
 *   blocked   "EA · blocked · waiting on Dropbox"
 *   done      nothing
 *
 * `since` is a TIME while the run started today and a full `formatWhen`
 * otherwise. "since 2:14am" on a run that began on Tuesday is a sentence that
 * reads as this morning and is off by two days — and a marker exists to say
 * how long something has been going.
 *
 * `done` returns null. A finished run belongs in the activity list with its
 * usage line (WK-04); a marker that says "done" is a marker that has stopped
 * being about now.
 */
export function workLine(work: Work, nowDate: Date = now()): string | null {
  if (work.state === "done") return null;
  const who = personLabel(work.agentId);
  if (work.state === "queued") return `${who} · queued`;
  if (work.state === "blocked") return work.step ? `${who} · blocked · ${work.step}` : `${who} · blocked`;
  const started = new Date(work.since);
  const since = dayKey(started) === dayKey(nowDate) ? formatTime12(started) : formatWhen(started, nowDate);
  return `${who} working · since ${since}`;
}

/** The letter a task carries when its owner is not the person looking. Shared
 * by the list row and the board card: the board grew its own marker idiom at
 * B-1 — an initial in a circle, drawn for EVERYONE including the viewer — and
 * a review counted ten identical "J"s on a board where the list beside it
 * marked two rows (ux round 2, B2-04). One rule, one place. */
/**
 * The two letters a person's circle or chip shows (JQ-4).
 *
 * It was `OWNER_INITIAL`, a hand-written map, and it gave `josh` and `joce` the
 * same "J" — Josh's complaint word for word. The abbreviation now travels on the
 * roster record with the person, so this is a LOOKUP and not a derivation:
 * `null` for somebody the roster does not know, because inventing a letter for
 * an unrecognised id is how the collision happened in the first place.
 */
export function ownerShort(owner: TaskOwner, roster: AgentRoster): string | null {
  return roster.find((r) => r.id === owner)?.short ?? null;
}
