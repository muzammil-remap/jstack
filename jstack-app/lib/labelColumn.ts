/**
 * The waiting row's type column, sized to the widest type it must actually
 * hold (R-18, rule 20: "a fixed column is sized to the widest word it must
 * hold, measured"; UX-H, row C-5).
 *
 * The pack draws a fixed 48. V2.1 found that "SECTION" — the widest type the
 * section catalogue can put in a waiting row — broke to "SECTIO / N" at 48 at
 * every width, and pinned the column to 60 instead (`design/DISCREPANCIES.md`
 * row 20). That fixed 60 then cost the phone twelve pixels of title on every
 * row whose type is "Bill".
 *
 * So the column follows its content, with 48 as the floor the pack specifies.
 * The per-character advance is not a guess: it is calibrated against the one
 * real measurement this project has, which is exactly that SECTION-at-60
 * finding. If a future type needs a different face or scale, re-measure and
 * move the constant — do not add a second one.
 */

/** the pack's fixed width, and the floor a shorter type still gets */
export const LABEL_COL_MIN = 48;

/**
 * The task row's owner-mark slot (ux round S6-14), sized the same way: to the
 * widest mark it must hold, measured. The mark had no column at all — a row
 * with "EA" or "JM" started its title 37px further right than a row with
 * none, four times down one list, and the meta lines rippled with it. The
 * pack's answer to exactly that is one component away: "Type label at 48px
 * fixed width so titles align." "EA" and "JM", the widest two-letter marks
 * the roster carries, render 26px in the Tag; 30 leaves them breathing room
 * and the row's own gap does the rest. The slot renders EMPTY on a row with
 * no mark — that is the whole point of a slot. Shared by `TaskRow` and
 * `BoardCard`, which is why it is here beside the analogous constant rather
 * than in either.
 */
export const OWNER_COL = 30;

/**
 * Arrange's name column (ux round 2, S6-43): B-156 put the ↑↓ pair beside the
 * name, and the pair then started wherever the name ended — 26 px of travel
 * down one card, the ragged column S6-14 had just closed on the task list.
 * Sized to the widest title the registry carries ("Rules for my EA", "Close
 * the day" — fifteen characters, about 110 px at the body scale) with room
 * for the pinned row's "cannot be hidden" beneath it and the pair's gap.
 */
export const ARRANGE_NAME_COL = 160;

/** 60px held the seven characters of "SECTION" at the label scale (R-18). */
const PER_CHARACTER = 60 / 7;

export function labelColumnFor(types: readonly string[]): number {
  const longest = types.reduce((n, type) => Math.max(n, type.length), 0);
  return Math.max(LABEL_COL_MIN, Math.ceil(longest * PER_CHARACTER));
}
