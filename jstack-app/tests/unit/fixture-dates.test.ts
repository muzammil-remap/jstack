/**
 * R23-01 — one bill, one due date.
 *
 * `life.json`'s money footer computed its date from `{{TODAY+14}}` and
 * `actions.json`'s decision card carried the literal `due 19 Sep`, for the same
 * RACQ bill. The two agreed on exactly one day of the year — the day the
 * fixtures were written — and nine consecutive device passes were photographed
 * on that day. The tenth crossed midnight and the demo told its owner that one
 * bill was due on two different dates, in two places, in the same capture run.
 *
 * Mock v11 pins both to 19 Sep, so this was never a disagreement about the
 * data. It was a literal sitting next to a token, which is a defect with a
 * fuse in it rather than a defect you can see.
 *
 * Two rules, both cheap:
 *
 *   1. No fixture may hard-code a date that MOVES. A "due", "expires" or
 *      "returns" date is a fact about the future and must be a token; a
 *      provenance date ("Steve's email, 2 Sep", "paused since 28 Aug") is a
 *      fact about the past, is fixed, and is fine.
 *   2. Every relative date rendered for the same record must come from the same
 *      offset — checked here for the RACQ bill specifically, because that is
 *      the one this defect was found in and the one a reviewer will look at.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as db from "@/data/mock/db";
import { dayKey, todayKey } from "@/lib/time";

const fixtures = join(__dirname, "..", "..", "data", "mock", "fixtures");

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
/** A forward-looking date: the words that mean "this has not happened yet". */
const FORWARD = new RegExp(`(due|expires?|returns?|renews?|by)\\b[^"]{0,12}?[0-9]{1,2} (${MONTHS})`, "i");

function fixtureFiles(): string[] {
  return readdirSync(fixtures).filter((f) => f.endsWith(".json"));
}

describe("R23-01 / TZ-04 fixture dates, under the foreign TZ", () => {
  it("no fixture hard-codes a date that moves", () => {
    const offenders: string[] = [];
    for (const name of fixtureFiles()) {
      const text = readFileSync(join(fixtures, name), "utf8");
      text.split("\n").forEach((line, i) => {
        const m = FORWARD.exec(line);
        if (m != null) offenders.push(`${name}:${i + 1} — ${m[0]}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("the RACQ bill states one due date, from one offset", () => {
    const actions = readFileSync(join(fixtures, "actions.json"), "utf8");
    const life = readFileSync(join(fixtures, "life.json"), "utf8");

    const cardOffset = /RACQ[^"]*due \{\{DATESHORT([+-][0-9]+)\}\}/.exec(actions)?.[1];
    const footerOffset = /"text": "RACQ[^"]*",\s*"date": "\{\{TODAY([+-][0-9]+)\}\}"/.exec(life)?.[1];

    expect({ cardOffset, footerOffset }).toEqual({ cardOffset: "+14", footerOffset: "+14" });
  });
});

describe("TZ-04 · the mock's clock is the DEVICE's, whatever the process zone (D-1, ADR-47)", () => {
  it("db.now() is a real instant, and its day is the day `lib/time.ts` names", () => {
    // This used to assert the opposite — that `db.now()`'s UTC fields read as
    // the BRISBANE wall clock — because the mock shifted every instant onto a
    // fixed +10:00 basis. ADR-47 removed the shift: the mock runs in-process,
    // in the same zone as the app, so its "now" is simply now and its "today"
    // is the device's today (resolution #42). The claim worth keeping is that
    // the mock and the library agree, because the fixtures are date-shifted by
    // one and read by the other.
    const mock = db.now();
    expect(Math.abs(mock.getTime() - Date.now())).toBeLessThan(5_000);
    expect(dayKey(mock)).toBe(todayKey());
  });

  it("and the suite is somewhere the difference would show", () => {
    // If this ran in UTC, a mock that had kept the old shift would still pass
    // the case above for fourteen hours a day.
    expect(["America/New_York", "Australia/Brisbane"]).toContain(process.env.TZ);
  });
});
