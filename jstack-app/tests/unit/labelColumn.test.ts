/**
 * CD-05 / UX-H — the waiting row's type column follows its content.
 *
 * The pack draws a fixed 48. V2.1 measured "SECTION" breaking to "SECTIO / N"
 * at 48 and pinned the column to 60 (`design/DISCREPANCIES.md` row 20), which
 * then cost the phone twelve pixels of title on every row whose type is
 * "Bill" — and a phone title had about ninety pixels to begin with.
 *
 * So the column is sized to the widest type actually present, with the pack's
 * 48 as the floor. The per-character constant is calibrated against that one
 * real measurement rather than guessed, and the first case here is what pins
 * it: if somebody re-tunes the constant and SECTION stops fitting, this fails.
 */
import { ARRANGE_NAME_COL, LABEL_COL_MIN, OWNER_COL, labelColumnFor } from "@/lib/labelColumn";

describe("CD-05 · the type column is sized to the widest type present", () => {
  it("still holds SECTION — the measurement the constant comes from (R-18)", () => {
    expect(labelColumnFor(["SECTION"])).toBeGreaterThanOrEqual(60);
  });

  it("gives short types the pack's floor rather than shrinking below it", () => {
    expect(labelColumnFor(["Bill"])).toBe(LABEL_COL_MIN);
    expect(labelColumnFor(["Bill", "Email", "Clash"])).toBe(LABEL_COL_MIN);
    expect(LABEL_COL_MIN).toBe(48);
  });

  it("an empty list is the floor, not zero — a column with no rows still has a width", () => {
    expect(labelColumnFor([])).toBe(LABEL_COL_MIN);
  });

  it("the widest type wins, not the first or the last", () => {
    expect(labelColumnFor(["Bill", "SECTION", "Email"])).toBe(labelColumnFor(["SECTION"]));
    expect(labelColumnFor(["SECTION", "Bill"])).toBe(labelColumnFor(["Bill", "SECTION"]));
  });

  it("grows with the content — otherwise it is just the fixed width again", () => {
    expect(labelColumnFor(["SECTION"])).toBeGreaterThan(labelColumnFor(["Bill"]));
  });

  /**
   * S6-14 (ux round, Stage 6): the task row's owner mark had no column at all.
   * A row with a mark started its title 37px further right than a row without
   * one, four times down one list — the ragged edge the waiting row's fixed
   * column was written to prevent, one component away. The slot is one
   * number here, beside the analogous one, and it is sized the same way: to
   * the widest mark it must hold, measured. "EA" and "JM" — the widest
   * two-letter marks the roster carries — render 26px in the Tag.
   */
  it("the owner mark's slot is one number, wide enough for the widest two-letter mark measured (S6-14)", () => {
    expect(OWNER_COL).toBe(30);
    expect(OWNER_COL).toBeGreaterThanOrEqual(26 + 4);
  });

  it("Arrange's name column is one number, wide enough for the widest section title the registry carries (S6-43)", () => {
    // "Rules for my EA" and "Close the day" are the longest; at the body scale
    // fifteen characters need about 110 px, and the column leaves the pair its gap
    expect(ARRANGE_NAME_COL).toBe(160);
    expect(ARRANGE_NAME_COL).toBeGreaterThanOrEqual(Math.ceil(15 * 7.5));
  });

  it("the fixture's own types need 52, not the fixed 60 — which is the room the phone gains", () => {
    // Clash, Email, Bill, Report are the types the waiting list actually shows.
    // "Report" is the widest at six characters, so the column is 52: eight
    // pixels back on every phone row, against a title that had about ninety.
    expect(labelColumnFor(["Clash", "Email", "Bill", "Report"])).toBe(52);
    expect(labelColumnFor(["Clash", "Email", "Bill", "Report"])).toBeLessThan(60);
  });
});
