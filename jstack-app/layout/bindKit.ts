/**
 * bindKit.ts (R-1) — the TYPES a published data binding is written against,
 * split out of `layout/sources.ts` when that file reached its 250-line cap
 * (hard rule 3: split before you exceed).
 *
 * Same shape as O-1's `layout/dialogKit.tsx` and for the same reason: a file
 * that CONTRIBUTES binds must import the type without importing the registry,
 * because importing the registry from something the registry imports is a
 * cycle evaluated while `BINDS` is still being built.
 */
export type BindResult = {
  items: unknown[];
  /** how many there are when `items` is a capped slice (X1-12, P-9): the
   * count badge says the total, so a section that shows four of ten does
   * not read as a section with four. Absent means `items.length`. */
  total?: number;
  /** wired for `rows` blocks whose rows carry a verb (CB-10): the same call
   * the hand-written section makes, so a configured People row and the
   * built-in one hit one endpoint, not two. */
  act?: (id: string, action: import("@/data/types").BlockVerbAction) => Promise<void>;
};

export type BindDef = {
  endpoint: string;
  block: import("@/data/types").Block["type"];
  /** one sentence, shown in the catalogue and the configure dialog. */
  label: string;
  use: () => BindResult;
};
