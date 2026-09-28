/**
 * One shape for "change it now, ask the server, be honest if the answer is
 * no" (T-1/T-2, TK-02..TK-09).
 *
 * Every editable field on the task card wants the same four things and gets
 * them wrong in the same four ways if each writes them itself:
 *
 *  1. **Move first.** A control that waits for a round trip before it moves
 *     feels broken on a train.
 *  2. **A queued write is not an answer.** Offline the adapter returns
 *     `202 { queued }` rather than throwing, and a store that reloads after it
 *     fetches the server's UNCHANGED record straight back over what was just
 *     typed (B-22 — this happened).
 *  3. **A refusal is returned, not toasted.** The honest line belongs under
 *     the control that produced it, and only the caller knows which that is.
 *  4. **Undo restores what THIS write changed**, not the whole record: two
 *     edits inside the same ten seconds must undo independently.
 *
 * It lives in `lib/` rather than in `stores/tasks.ts` because the store was at
 * its 200-line cap and because the second caller (subtasks) arrived one row
 * after the first.
 */
import { isQueued } from "@/data/transport/outbox";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";

/** the server's `422 { field, reason }`, as a control can use it */
export type Refusal = { field?: string; reason: string };

export async function optimisticWrite<T extends object>(opts: {
  /** the record as it stands, to read the overwritten fields off */
  before: T;
  /** what is changing */
  patch: Partial<T>;
  /** put these values on screen now (and again, if the server refuses) */
  apply: (values: Partial<T>) => void;
  /** the adapter call */
  send: () => Promise<unknown>;
  /** re-send the previous values — the undo path */
  sendUndo: (previous: Partial<T>) => Promise<void>;
  /** the record as the server holds it NOW, read when the undo runs: the undo puts
   *  back only the fields that still hold what THIS write wrote (A4R8-01's class) */
  current?: () => Promise<T | undefined>;
  /** the record as the server's answer to THIS write has it — the baseline `current`
   *  is compared with, so a server that normalises a value is not read as a change */
  wroteOf?: (result: unknown) => T | undefined;
  /** the toast's word: "Changed", "Deleted" */
  undoLabel: string;
  /** reload whatever the write moved, once it has actually landed */
  after: () => Promise<void>;
}): Promise<Refusal | null> {
  const previous = Object.fromEntries(
    Object.keys(opts.patch).map((k) => [k, (opts.before as unknown as Record<string, unknown>)[k]]),
  ) as Partial<T>;

  opts.apply(opts.patch);

  let result: unknown;
  try {
    result = await opts.send();
  } catch (e) {
    opts.apply(previous); // the server said no: put it back as it was
    const err = e as { status?: number; field?: string; reason?: string };
    return { field: err.status === 422 ? err.field : undefined, reason: err.reason ?? "that could not be saved" };
  }

  // Offline: the outbox owns it now. No reload (it would undo the optimistic
  // value) and no undo entry (there is nothing on a server to undo yet).
  if (isQueued(result)) {
    await useSyncStore.getState().refresh();
    return null;
  }

  const wrote = (opts.wroteOf?.(result) ?? opts.patch) as Record<string, unknown>;
  useSessionStore.getState().pushUndo(opts.undoLabel, async () => {
    // a field written since this edit — by another device, or a verb with no undo
    // of its own — is not this undo's to take back (A4R8-01's class)
    // A4R9-07: a record that cannot be read (offline) is no reason to take back
    // nothing — the undo sends what this write overwrote, and the outbox carries it
    const now = opts.current == null ? undefined : ((await opts.current().catch(() => undefined)) as Record<string, unknown> | undefined);
    const same = (k: string) => now != null && JSON.stringify(now[k]) === JSON.stringify(wrote[k]);
    const stillMine = now == null ? previous : (Object.fromEntries(Object.entries(previous).filter(([k]) => same(k))) as Partial<T>);
    if (Object.keys(stillMine).length > 0) await opts.sendUndo(stillMine);
    await opts.after();
  });
  await opts.after();
  return null;
}
