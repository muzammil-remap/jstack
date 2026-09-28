/**
 * R15-01 — one date basis, everywhere that touches the data.
 *
 * The defect this ID records is real and worth reading: the Gantt's axis
 * labels read the machine's LOCAL fields while every other surface read UTC
 * ones, so for the ten hours between Brisbane midnight and UTC midnight the
 * app named a different day than Today did, in the same session, about the
 * same instant. The ux review caught it in round 15 because that regenerate
 * was the first capture in the whole build to run after local midnight: the
 * Gantt read `30 Aug │ today │ 27 Sep` while `today-*.png` from the same run
 * read `Saturday 5 September`.
 *
 * ## What changed, and why this file is now short
 *
 * This suite used to enforce "no local field read anywhere", because the one
 * basis was UTC-with-a-Brisbane-offset. **D-1 (ADR-47) inverted that**: the
 * basis is now the device's own zone, so the correct implementation reads
 * local fields — and a guard forbidding them would have to be deleted or
 * lied to. It is neither: it is REPLACED by a strictly stronger one.
 *
 * `tests/unit/time.test.ts`'s TD-05 sweep forbids EVERY date-field access —
 * local and UTC alike, getters and setters — anywhere but `lib/time.ts`.
 * Everything this file could catch, that one catches, and it also catches the
 * UTC reads this one always allowed. The expectation change is recorded in
 * `02_ACCEPTANCE_TESTS_v22.md` §4.
 *
 * What did NOT invert is below: the three files S-5 replaced are gone rather
 * than merely unused, which is what stops a second basis growing back.
 */
import { statSync } from "node:fs";
import { join } from "node:path";

const app = join(__dirname, "..", "..");

describe("R15-01 one date basis (amended by ADR-47 — the sweep now lives in time.test.ts)", () => {
  it("the three files S-5 replaced are gone, not merely unused", () => {
    for (const rel of ["lib/date-utils.ts", "lib/calendarMath.ts", "lib/clock.ts"]) {
      expect(() => statSync(join(app, rel))).toThrow();
    }
  });

  it("and the successor guard is really there — this file points at it, so it must exist", () => {
    // A pointer to a test that has been deleted or renamed is worse than no
    // pointer: it reads as coverage. Cheap to check, so checked.
    const time = statSync(join(app, "tests", "unit", "time.test.ts"));
    expect(time.isFile()).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- reading the file's TEXT, not importing it
    const text = require("node:fs").readFileSync(join(app, "tests", "unit", "time.test.ts"), "utf8") as string;
    expect(text).toContain("TD-05 · nothing outside lib/time.ts touches a Date field");
  });
});
