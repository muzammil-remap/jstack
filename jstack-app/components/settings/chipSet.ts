/**
 * The types `ChipSetEditDialog` and `ChipSetForm` share (S-3, split at LG-1).
 *
 * Their own module rather than one importing the other's: the dialog renders
 * the form and the form does not know the dialog exists, so a type declared in
 * either would make the pair import each other. `layout/find.ts` is the
 * cautionary tale — a cycle there passed `tsc` and Jest and killed every
 * browser case with "Cannot access 'c' before initialization" (K-1).
 */

/** the minimum a member of an editable set has to be. `name` is optional
 * because not every set has one: a goal is an area and a sentence, and adding
 * a `name` field to the record to satisfy an editor would be the editor
 * deciding the shape of the data. `nameOf` on the dialog says what to show. */
export type ChipSetItem = { id: string; name?: string; fixed?: boolean };

/**
 * One field of the form. `read`/`write` rather than a key, because the value a
 * field edits is not always a top-level property — a focus keeps its silos at
 * `filter.silos` and a goal its target at `kpis[0].target`, and flattening the
 * record to suit the editor would be the editor deciding the shape of the
 * data.
 */
export type ChipSetField<T> = {
  /** the testID suffix: `name` → `focus-name`, `silo` → `focus-silo-work` */
  id: string;
  kind: "text" | "checklist" | "date";
  /** the line above a checklist or a date; a text field carries a placeholder
   * instead */
  label?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** a `date` field reads and writes a DAY KEY ("2026-09-17"), not an instant */
  read: (item: Partial<T>) => string | string[];
  write: (draft: Partial<T>, value: string | string[]) => Partial<T>;
  /** an empty value blocks Save, with this as the reason shown */
  requiredReason?: string;
};

export type ChipSetCopy = {
  /** the list dialog's title */
  title: string;
  /** the button under the list */
  add: string;
  /** the form's title, editing an existing member or adding one */
  formTitle: { edit: string; add: string };
  /** the toast after a save */
  saved: { edit: string; add: string };
};
