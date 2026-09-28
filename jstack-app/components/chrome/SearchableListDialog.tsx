/**
 * Search over a list, in one place (S-4).
 *
 * Three surfaces were doing this independently: Agents' decision history,
 * Today's decision history, and Tasks' Done segment. All three had their own
 * search `Field` with its own magnifier, their own "No matches.", and their own
 * decision about whether an empty list is a `Meta` or a missing `ListCard`.
 * Three copies of one pattern is three chances for them to drift apart, and
 * OP-08 is about to add a fourth.
 *
 * TWO exports, because the three surfaces are not the same shape and pretending
 * they were would be worse than the duplication:
 *
 *   `SearchableList`       the search field and the list. Controlled — the
 *                          caller owns the query, because Done's lives in
 *                          `stores/tasks.ts` and the two histories' are local.
 *   `SearchableListDialog` that, inside a `Dialog`, owning the query and —
 *                          for an archive — the rows. What the "all" dialogs
 *                          actually are.
 *
 * Where a dialog's rows come from is one of two shapes, and which one a caller
 * uses says what kind of list it is (Stage 5d P-4, F-55):
 *
 *   `fetch` + `rows`     the QUERY GOES TO THE SERVER through a store action
 *                        the caller owns, and the store holds the rows (the
 *                        two decision histories: `?q=` is the backend's index).
 *   `source` + `text`    an ARCHIVE: fetched whole, once, on open; the needle
 *                        is applied here over the text each row gives, and a
 *                        fetch that fails is an empty list. Three "all"
 *                        dialogs wrote that fetch-filter-catch by hand, and
 *                        refetched the whole archive on every keystroke.
 *
 * `source` is handed the adapter: this file is the one archive fetch under
 * `components/` (`tests/unit/boundaries.test.ts` names it), so an archive
 * never imports the provider for itself. A row that opens a detail calls
 * `openModal(name, id)` and NOTHING ELSE — there is one modal slot, so the
 * detail replaces this dialog; an `onClose()` after it closed the detail that
 * had just opened (the O-1 defect), and one before it was a second way of
 * doing the same thing (rule 16).
 *
 * Every testID is passed in rather than derived: these three were named before
 * this component existed (`agents-history-search`, `history-rows`,
 * `done-search-input`), the specs pin them, and renaming a shipped testID to
 * suit a refactor is the refactor changing behaviour.
 */
import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { Field, ListCard, Meta } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { Icon } from "@/components/chrome/Icon";
import { getAdapter } from "@/data/provider";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { DataProvider } from "@/data/DataProvider";
import type { StyleProp, ViewStyle } from "react-native";

export function SearchableList<T>({
  searchTestID,
  listTestID,
  emptyTestID,
  placeholder,
  query,
  onQuery,
  rows,
  renderRow,
  emptyText = "No matches.",
  fieldStyle,
}: {
  searchTestID: string;
  listTestID: string;
  /** defaults to `listTestID` — both histories put the same id on the empty
   * line, so a spec can ask for the rows and get an answer either way. `null`
   * means no testID at all, which is what Done has always had. */
  emptyTestID?: string | null;
  placeholder: string;
  query: string;
  onQuery: (q: string) => void;
  rows: T[];
  renderRow: (row: T, index: number, last: boolean) => ReactNode;
  emptyText?: string;
  fieldStyle?: StyleProp<ViewStyle>;
}) {
  const c = useTokens();
  return (
    <>
      <Field
        testID={searchTestID}
        value={query}
        onChangeText={onQuery}
        placeholder={placeholder}
        right={<Icon name="search" size={16} color={c.muted} />}
        style={fieldStyle}
      />
      {rows.length === 0 ? (
        <Meta testID={emptyTestID === null ? undefined : (emptyTestID ?? listTestID)}>{emptyText}</Meta>
      ) : (
        <ListCard testID={listTestID}>{rows.map((row, i) => renderRow(row, i, i === rows.length - 1))}</ListCard>
      )}
    </>
  );
}

/** the two shapes rows come from — see the header */
type RowsFrom<T> =
  | { fetch: (q: string | undefined) => void; rows: T[]; source?: undefined; text?: undefined }
  | { source: (adapter: DataProvider) => Promise<T[]>; text: (row: T) => string; fetch?: undefined; rows?: undefined };

export function SearchableListDialog<T>({
  testID,
  title,
  placeholder,
  renderRow,
  emptyText,
  onClose,
  ...from
}: {
  /** the prefix the three ids come from: `${testID}-dialog`, `-search`, `-rows` */
  testID: string;
  title: string;
  placeholder: string;
  renderRow: (row: T, index: number, last: boolean) => ReactNode;
  emptyText?: string;
  onClose: () => void;
} & RowsFrom<T>) {
  const [q, setQ] = useState("");
  const [fetched, setFetched] = useState<T[]>([]);
  // the latest callbacks, read inside the effects so each keys on what it is
  // really about — every caller re-makes them on each render
  const latest = useRef(from);
  latest.current = from;
  const archive = from.source != null;

  // an archive: one fetch, on open; a failure is an empty list
  useEffect(() => {
    const f = latest.current;
    if (f.source == null) return;
    let live = true;
    void f
      .source(getAdapter())
      .then((all) => live && setFetched(all))
      .catch(() => live && setFetched([]));
    return () => {
      live = false;
    };
  }, [archive]);

  // a store-backed list: the caller's fetch on every query change, including once with "" on open
  useEffect(() => {
    const f = latest.current;
    if (f.fetch != null) f.fetch(q.trim() || undefined);
  }, [q, archive]);

  const needle = q.trim().toLowerCase();
  const rows = from.source != null ? (needle === "" ? fetched : fetched.filter((row) => from.text(row).toLowerCase().includes(needle))) : from.rows;

  return (
    <Dialog testID={`${testID}-dialog`} title={title} onClose={onClose}>
      <SearchableList<T>
        searchTestID={`${testID}-search`}
        listTestID={`${testID}-rows`}
        placeholder={placeholder}
        query={q}
        onQuery={setQ}
        rows={rows}
        renderRow={renderRow}
        emptyText={emptyText}
        fieldStyle={{ marginBottom: space[4] }}
      />
    </Dialog>
  );
}
