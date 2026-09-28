/**
 * useDetail (Stage 5d P-3, F-68) — the ONE way a detail dialog fetches.
 *
 * Six detail dialogs each carried the same twelve-line effect: a `live` flag,
 * `getAdapter().getX(id)`, the record on success, MISSING on failure, and the
 * flag cleared on unmount so a dialog closed mid-flight cannot set state on a
 * component that is gone. Six copies were six places to forget the flag, and
 * CODEMAP's recipe told the seventh dialog to copy it again.
 *
 * It is also the one place under `components/` that reaches the provider for
 * a record (F-47): `tests/unit/boundaries.test.ts` allow-lists this file by
 * name, so the next dialog that fetches for itself is a red test rather than
 * a seventh copy.
 *
 * `fetch` is given the adapter and the id, so the hook knows no route; a
 * dialog with a fallback (FileDetail's offline cache) folds it into its fetch.
 * The effect keys on `id` alone, as every copy did, and reads the latest
 * `fetch` through a ref so the deps stay honest without a lint exemption. A
 * new id starts clean — the old record must not stand in for the new one
 * while its fetch is in flight — and `null` means there is nothing to show
 * and nothing to ask (the task card's goal chip, P-4). A response that lands
 * after the id has moved on, or after the dialog closed, is dropped: the flag
 * is per run.
 */
import { useEffect, useRef, useState } from "react";
import { getAdapter } from "@/data/provider";
import type { DataProvider } from "@/data/DataProvider";

export function useDetail<T>(id: string | null, fetch: (adapter: DataProvider, id: string) => Promise<T>): { item: T | null; missing: boolean } {
  const [item, setItem] = useState<T | null>(null);
  const [missing, setMissing] = useState(false);
  const fetchRef = useRef(fetch);
  fetchRef.current = fetch;

  useEffect(() => {
    setItem(null);
    setMissing(false);
    if (id == null) return;
    let live = true;
    void fetchRef
      .current(getAdapter(), id)
      .then((got) => live && setItem(got))
      .catch(() => live && setMissing(true));
    return () => {
      live = false;
    };
  }, [id]);

  return { item, missing };
}
