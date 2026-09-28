/**
 * The parameter registry (ADR-41, L-1) — six tunables, in one typed table.
 *
 * Each of these was a constant inside the file that read it: two minutes in
 * `lib/autoLock.ts`, ninety days in the task filters, sixty seconds in the
 * microphone. A constant is fine until somebody needs it changed, and then it
 * is a code change, a build and a deploy for a number that was always meant
 * to be a preference.
 *
 * The table is the SHAPE; the values are a server record (`GET /parameters`).
 * That split is the whole design: Josh changes a value in Settings › Security,
 * the EA can only PROPOSE one through the decision card it already knows how
 * to raise, and `PARAMETERS.md` — generated from this file by
 * `tools/gen-parameters.mjs` on every `pnpm codemap` — tells either of them
 * what exists without reading the source.
 *
 * `usedBy` is checked, not decorative: `tests/unit/parameters.test.ts` opens
 * every file named here and fails if it does not mention the key. All six are
 * read now — F-1 took `tasks.rangeDays`, V-1 `mic.autoStopSeconds`, K-1
 * `search.maxResults` and X-1 the last one, `files.recentDays` — so no row
 * carries `plannedFor` any more. A parameter nothing reads is a switch wired
 * to nothing, and the field existed to make that state visible while it
 * lasted rather than comfortable.
 *
 * To add one: a row here, a range the handler enforces
 * (`data/mock/handlers/parameters.ts`), and nothing else — the control in
 * Settings and the row in `PARAMETERS.md` are both generated from the table
 * (CODEMAP.md §5, "add a parameter").
 */
import type { Parameter, ParameterDef, ParameterKey } from "@/data/types";

const TABLE = [
  {
    key: "lock.afterMinutes",
    label: "Lock after",
    help: "How long JSTACK waits with no interaction before locking again. The timer keeps counting while the tab is in the background.",
    unit: "minutes",
    default: 10,
    min: 1,
    max: 60,
    // the five worth one tap (defaults table #7); the field beside them takes
    // anything else inside the range
    choices: [5, 10, 15, 30, 60],
    usedBy: ["lib/autoLock.ts"],
    changeable: "josh-or-ea-proposal",
  },
  {
    key: "lock.lockOnHideTouch",
    label: "Lock a phone the moment it is put down",
    help: "On a phone or tablet, leaving the app or locking the screen locks JSTACK at once rather than waiting for the timer. Desktops never lock on a tab switch.",
    unit: "boolean",
    default: true,
    usedBy: ["lib/autoLock.ts"],
    changeable: "josh-or-ea-proposal",
  },
  {
    key: "tasks.rangeDays",
    label: "Task window",
    help: "How many days the Next and Last presets span on List, Board and Gantt. The chip reads the number back to you.",
    unit: "days",
    default: 90,
    min: 7,
    max: 365,
    usedBy: ["components/tasks/RangeChip.tsx", "components/tasks/RangeDialog.tsx", "data/mock/handlers/tasks.ts"],
    changeable: "josh-or-ea-proposal",
  },
  {
    key: "files.recentDays",
    label: "Keep recent files for",
    help: "How long this device keeps the details of a file you opened — its name, where it lives and a preview — so Find can answer without the network. Never the file itself.",
    unit: "days",
    default: 14,
    min: 1,
    max: 90,
    // X-1 reads it: `lib/recentFiles.ts` drops a cached file older than this
    // on every read, so the window shrinks the cache by being used. The last
    // of the six to find its reader.
    usedBy: ["lib/recentFiles.ts"],
    changeable: "josh-or-ea-proposal",
  },
  {
    key: "mic.autoStopSeconds",
    label: "Stop listening after",
    help: "How long the microphone stays open with nothing said before it closes itself.",
    unit: "seconds",
    default: 60,
    min: 15,
    max: 300,
    // V-1 reads it: `useDictation` passes it to `startMic`, and the notice a
    // person sees composes FROM it — "nothing heard for a minute" at 60,
    // "for 30 seconds" at 30 (resolution #9, MC-06).
    usedBy: ["stores/mic.ts"],
    changeable: "josh-or-ea-proposal",
  },
  {
    key: "search.maxResults",
    label: "Search results",
    help: "How many matches Find asks for at a time.",
    unit: "count",
    default: 50,
    min: 10,
    max: 200,
    // K-1 reads it SERVER-SIDE: `data/mock/search.ts` caps the total across
    // every group from its own parameter table, and the app renders the line
    // that says so. A cap the client applied would be a cap the client could
    // raise, which is not what a limit is for.
    usedBy: ["data/mock/search.ts"],
    changeable: "josh-or-ea-proposal",
  },
] as const satisfies readonly ParameterDef[];

/**
 * Every `ParameterKey` has a row. A real compile-time check, not a comment —
 * which is why `PARAMETERS` is `as const satisfies` above rather than typed as
 * `ParameterDef[]`: with the wider type this line would compare `ParameterKey`
 * to itself and pass whatever the table held. Adding a key to the union without
 * a row here is now a `pnpm check` error, and that is the only kind of reminder
 * that still works in six months.
 */
type MissingRow = Exclude<ParameterKey, (typeof TABLE)[number]["key"]>;
const _everyKeyHasARow: MissingRow[] = [];
void _everyKeyHasARow;

/** The same table, widened: `as const` above is for the check, and every
 *  consumer wants a `ParameterDef` rather than six singleton literal types. */
export const PARAMETERS: readonly ParameterDef[] = TABLE;

export function parameterDef(key: string): ParameterDef | undefined {
  return PARAMETERS.find((p) => p.key === key);
}

/** the six as a server would first hold them: the table, valued at its defaults */
export function defaultParameters(): Parameter[] {
  return PARAMETERS.map((p) => ({ ...p, value: p.default }));
}

/**
 * Read a value with the table's default as the floor. Every caller is code
 * that runs before or without a loaded store — the lock timer arms at boot —
 * and a parameter that has not loaded yet must behave as the documented
 * default rather than as `undefined` (which, for a timeout, is an app that
 * never locks).
 */
export function parameterValue(list: readonly Parameter[] | undefined, key: ParameterKey): number | boolean {
  const found = list?.find((p) => p.key === key);
  if (found != null) return found.value;
  return parameterDef(key)!.default;
}
