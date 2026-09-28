/**
 * CD-18 — a fixture that names a weekday must MEAN a weekday (row D-1).
 *
 * LV-06's fixture half (T2-1's self-check): no literal weekday or date, long or
 * short, outside the recurring-cadence exemptions. Its rendered half — no ISO
 * instant, no bare HH:MM off the calendar grid, no "in N days" at four widths —
 * is `e2e/matrix/theme.spec.ts` "GL-07 dates and times are written for a person".
 *
 * The defect this exists to prevent is the one the demo actually had: the
 * clash card read "Dev call Thursday overlaps school pickup" and expired
 * "Wed 5pm", while both dates were computed from offsets against whatever day
 * the demo was opened. On roughly five days in seven the card named a day it
 * did not mean, and on two of them the school pickup was scheduled for a
 * weekend.
 *
 * Prose that names a day and a timestamp that means a day are two statements
 * about one fact. `{{WEEKDAY:<field>}}` makes the sentence read the day off
 * the field it is describing, so the two cannot disagree; `{{WEEKDAY±n}}`
 * does the same for prose about a known offset, and `{{SCHOOLDAY±n;HH:MM}}`
 * refuses to put a school run on a Saturday.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { get as dbGet, reset } from "@/data/mock/db";
import type { CalEvent } from "@/data/types";

const FIXTURES = join(__dirname, "..", "..", "data", "mock", "fixtures");
const DAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * FX-A (carried from V2.1, row C-3): the SHORT forms too.
 *
 * The long-name guard was written, passed, and left six short-name literals
 * standing — "dueLabel": "Fri" three times over, beside a `due` computed from
 * an offset. Same defect, three characters shorter: on four days in seven the
 * task list stated a due day the task did not have. A guard that refuses
 * "Friday" and permits "Fri" is not a weaker guard, it is a guard with a hole
 * in the shape of the thing that was actually in the fixtures.
 */
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Recurring cadences are exempt BY PATTERN, not by file (FX-A).
 *
 * A cadence has no date to agree with: "every Mon 8am" is a statement about
 * every Monday, and shifting it daily would make it less true. Exempting by
 * filename would have exempted every other literal in the same file — which is
 * how the short names survived the first pass.
 */
const CADENCES: { re: RegExp; why: string }[] = [
  { re: /\bevery (Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\b/, why: 'a repeat rule — "every Mon 8am" names every Monday' },
  { re: /"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]* \d{1,2}:\d{2}"/, why: 'a cadence value — "Mon 8:00" is a schedule, not a date' },
  { re: /\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days\b/, why: 'a plural day — "reminder · Sundays" names every one of them' },
];

/** `\bMon\b` so "Monitor" and "Sunset" are not weekdays (and "Sun" inside
 * "Sunday" is caught by the long list anyway). */
const dayIn = (line: string) =>
  DAYS_LONG.find((d) => new RegExp(`\\b${d}\\b`).test(line)) ?? DAYS_SHORT.find((d) => new RegExp(`\\b${d}\\b`).test(line));

describe("CD-18 / FX-A · no fixture states a weekday it does not mean", () => {
  it("no literal weekday survives, long or short, outside the cadence patterns", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(FIXTURES).sort()) {
      if (!file.endsWith(".json")) continue;
      const text = readFileSync(join(FIXTURES, file), "utf8");
      for (const line of text.split("\n")) {
        if (dayIn(line) == null) continue;
        if (CADENCES.some(({ re }) => re.test(line))) continue;
        offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every cadence pattern still matches something — a stale one silently widens the rule", () => {
    const all = readdirSync(FIXTURES)
      .filter((f) => f.endsWith(".json"))
      .map((f) => readFileSync(join(FIXTURES, f), "utf8"))
      .join("\n");
    for (const { re, why } of CADENCES) {
      expect({ pattern: String(re), why, matches: re.test(all) }).toEqual({ pattern: String(re), why, matches: true });
    }
  });

  it("the scan can catch a planted literal — otherwise its silence proves nothing", () => {
    expect(dayIn('"dueLabel": "Fri",')).toBe("Fri");
    expect(dayIn('"expires Thursday 5pm"')).toBe("Thursday");
    // and does not fire on a word that merely contains a day
    expect(dayIn('"meta": "Monitor the Sunset run"')).toBeUndefined();
    // a cadence line is a weekday, and is let through by the patterns, not by the scan
    expect(dayIn('"cadence": "Mon 8:00"')).toBe("Mon");
    expect(CADENCES.some(({ re }) => re.test('"cadence": "Mon 8:00"'))).toBe(true);
  });
});

describe("CD-18 · the resolved fixtures say the right day", () => {
  beforeEach(() => reset());

  const dayNameOf = (iso: string) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(iso).getUTCDay()];

  it("every card's expiry is a time or a date — never a duration (ux-review R3-03)", () => {
    // README Content: "Expiry is stated as a time and a consequence: `expires
    // Wed 5pm · then proposes 1`"; "Dates: `19 Sep` in tight spaces". Two
    // cards said "expires in 2 days" / "in 5 days" — a duration, the one form
    // that does not tell the owner WHEN — beside rows that said the time.
    // The fixture must use the two sanctioned shapes, and the day and date
    // must come from tokens (CD-18), never literals.
    // Two more cards wrote the day as a LITERAL short form ("expires Fri
    // 5pm", "expires Sat 7am") — right one day in seven, the CD-18 class,
    // past the long-name guard above because it looked for "Friday".
    const cards = JSON.parse(readFileSync(join(FIXTURES, "actions.json"), "utf8")) as { id: string; state: string; thenWhat: string }[];
    const open = cards.filter((c) => c.state === "open");
    expect(open.length).toBeGreaterThan(3);
    const shape = /^expires (\{\{WEEKDAY:expiresAt\}\} \d{1,2}(am|pm)|\{\{DATESHORT[+-]\d+\}\}) · then /;
    expect(open.filter((c) => !shape.test(c.thenWhat)).map((c) => `${c.id}: ${c.thenWhat}`)).toEqual([]);
  });

  it("the clash card's title names the day it actually expires", () => {
    const card = dbGet().actions.find((a) => a.id === "c1");
    expect(card).toBeDefined();
    const day = dayNameOf(card!.expiresAt);
    expect(card!.title).toBe(`Dev call ${day} overlaps school pickup`);
    expect(card!.thenWhat).toContain(`expires ${day} 5pm`);
  });

  it("the school pickup is never on a weekend", () => {
    const pickup = dbGet().calendarEvents.find((e: CalEvent) => e.title === "School pickup");
    expect(pickup).toBeDefined();
    const weekday = new Date(pickup!.startsAt).getUTCDay();
    expect(weekday).toBeGreaterThanOrEqual(1);
    expect(weekday).toBeLessThanOrEqual(5);
  });

  it("no resolved record still carries an unresolved token", () => {
    // a token nobody implemented is worse than a literal: it reaches a screen
    const text = JSON.stringify(dbGet());
    expect(text).not.toContain("{{");
  });
});

/**
 * FX-A / CD-03 — the label agrees with the date on every day of the week.
 *
 * The literal it replaces was correct on one day in seven. A test that runs on
 * one base date would be too: it would have caught "Fri" only if the suite
 * happened to run on a Friday, which is the same coin toss one layer up. So
 * the clock is stepped through a whole week and the claim is checked on each.
 */
describe("FX-A · a resolved weekday label means the date beside it", () => {
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // The fixture base is `toBrisbane(new Date())` — the real clock — so
  // `reset(offsetMs)` moves what the mock thinks the TIME is without moving
  // the day the fixtures resolve against. Stepping the system clock is what
  // actually re-anchors them, and re-anchoring is the whole point here.
  afterEach(() => jest.useRealTimers());

  it("dueLabel names the day of `due`, on each of the seven days the demo could be opened", () => {
    const mismatches: string[] = [];
    let checked = 0;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
      jest.setSystemTime(new Date(Date.UTC(2026, 8, 7 + dayOffset, 9, 0, 0)));
      reset();

      for (const task of dbGet().tasks) {
        // "today" and "next week" are relative forms with no day to agree
        // with; this rule is about labels that NAME a day
        if (task.due == null || task.dueLabel == null) continue;
        if (!SHORT.includes(task.dueLabel)) continue;
        checked++;
        const expected = SHORT[new Date(task.due).getUTCDay()];
        if (task.dueLabel !== expected) {
          mismatches.push(`base +${dayOffset}d: ${task.id} due ${task.due} labelled "${task.dueLabel}", expected "${expected}"`);
        }
      }
    }

    expect(mismatches).toEqual([]);
    // three tokenised tasks across seven bases. Without this the whole loop
    // could quietly check nothing — which is exactly how "Fri" survived.
    expect(checked).toBe(21);
  });

  it("the labels really do move with the base — otherwise the loop above proves nothing", () => {
    const seen = new Set<string>();
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
      jest.setSystemTime(new Date(Date.UTC(2026, 8, 7 + dayOffset, 9, 0, 0)));
      reset();
      for (const task of dbGet().tasks) {
        if (task.dueLabel != null && SHORT.includes(task.dueLabel)) seen.add(task.dueLabel);
      }
    }
    // a literal would have produced exactly one distinct label all week
    expect(seen.size).toBe(7);
  });

  it("no resolved label is still a bare literal — the token has to have fired", () => {
    reset();
    const labels = dbGet()
      .tasks.map((t) => t.dueLabel)
      .filter((l): l is string => l != null);
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toContain("{{");
  });
});
