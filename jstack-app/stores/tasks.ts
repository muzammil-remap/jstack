/**
 * tasks.ts (ADR-04) — the LIST: the rows, the active view/slicer/filters/range
 * (the `taskFilters` slice), the slicer set, waiting-on rows, the board's
 * columns, the delegatee roster, the header's open count and the project names.
 *
 * F-1: there is ONE list. The Gantt used to fetch its own payload from
 * `GET /tasks/gantt` — a different shape, unfiltered, ignoring the slicer and
 * the focus — so "Personal, then Waiting" showed one set of tasks on List and
 * another on the Gantt. `load()` no longer short-circuits: every view asks
 * `GET /tasks?view=` with the same slicer, filters and range, which is what
 * makes TF-08 ("the same task set on every view") a thing that can be true.
 *
 * Stage 5d P-2 (F-13): the CARD — which task is open, its fresh copy,
 * completion, accept, the report, delegation — is `stores/taskCard.ts`. This
 * file was both, at its 200-line cap, and `taskEdits.ts` had said since T-3
 * that the seam was only half cut. `INITIAL` is exported so a test resets
 * from the one declaration rather than from a hand-typed copy that drifts as
 * the store gains fields (F-84).
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { recordLoad, recordLoadAs } from "@/lib/loadError";
import { attempt, REFUSED } from "@/lib/optimistic";
import { offlineCopy, rememberLastSeen } from "@/lib/lastSeen";
import { useSessionStore } from "@/stores/session";
import { EMPTY_FILTERS, serializeFilters, type TaskFilters } from "@/data/taskFilters";
import { createTaskFilterSlice, FILTER_INITIAL, type TaskFilterSlice } from "@/stores/taskFilters";
import type { AgentRosterEntry, Column, Task, WaitingRow } from "@/data/types";

/** S-2: declared once in `data/taskFilters.ts`, which the mock imports too.
 * Re-exported here so every existing importer's line is unchanged. */
export { EMPTY_FILTERS };
export type { TaskFilters, TaskRange, TaskSegment } from "@/data/taskFilters";

type TasksState = TaskFilterSlice & {
  list: Task[];
  waiting: WaitingRow[];
  /** B-1, ADR-45: Twenty's kanban columns, in Twenty's order. The board renders
   * what it is given — there is no client-side bucketing left. */
  columns: Column[];
  /** §4.15: who a task can be handed to. Loaded once, at boot. */
  roster: AgentRosterEntry[];
  /** "N open" for the tab's header (B-12): the plain list — every open task in
   * focus, whatever the active segment, slicer or filter narrowed `list` to —
   * so it cannot be read off `list` (0 while viewing Done). P-4, F-47. */
  openCount: number;
  /** every project name a task carries, for the filter panel (TK-14; P-4) */
  projects: string[];
  /** A-2: why the last load failed, or null once one gets through (`lib/loadError.ts`) */
  loadError: string | null;
  /** A-3: when the offline copy on screen was saved, or null once a load gets through (`lib/lastSeen.ts`) */
  staleAt: string | null;
  /** A-2b: why the waiting rows, or the open count, last failed to load — each its own key, so neither speaks for `loadError` */
  waitingError: string | null;
  openCountError: string | null;

  load: (focus?: string, opts?: { since?: string }) => Promise<void>;
  loadWaiting: (focus?: string) => Promise<void>;
  loadColumns: () => Promise<void>;
  loadRoster: () => Promise<void>;
  loadOpenCount: (focus?: string) => Promise<void>;
  loadProjects: () => Promise<void>;
  nudge: (id: string) => Promise<void>;
};

/** the data half, once — the filter slice's and this file's (F-84) */
export const INITIAL = { ...FILTER_INITIAL, list: [] as Task[], waiting: [] as WaitingRow[], columns: [] as Column[], roster: [] as AgentRosterEntry[], openCount: 0, projects: [] as string[], loadError: null as string | null, staleAt: null as string | null, waitingError: null as string | null, openCountError: null as string | null };

/** whether the current query IS the plain list — the request the header count
 * is defined by — so `load()` can answer it without a second round trip */
const plainList = (s: TaskFilterSlice): boolean => s.view === "list" && s.q === "" && !s.isNarrowed();

/** A-3: what a copy of the list was loaded UNDER — a copy is never shown for a filter it did not come from */
const listScope = (focus: string | undefined, s: TaskFilterSlice): string => JSON.stringify({ focus: focus ?? "", view: s.view, slicer: s.slicer, q: s.q, filters: serializeFilters(s.filters) });

export const useTasksStore = create<TasksState>((set, get) => ({
  ...createTaskFilterSlice(set, get),
  ...INITIAL,

  load: (focus, opts) => recordLoad(set, async () => {
    const s = get();
    // JQ-4: every row draws its owner's abbreviation from the roster, so the
    // list cannot render correctly without it. Fire-and-forget beside the
    // fetch rather than awaited in front of it — the tasks are what the person
    // is waiting for, and `loadRoster` returns immediately once it has run.
    void s.loadRoster();
    const list = await getAdapter().getTasks({
      focus,
      slice: s.slicer ?? undefined,
      view: s.view,
      q: s.q || undefined,
      filters: serializeFilters(s.filters),
    }, opts?.since);
    set(plainList(s) ? { list, openCount: list.length, staleAt: null } : { list, staleAt: null });
    void rememberLastSeen("tasks", listScope(focus, s), list);
  }, async () => {
    const copy = await offlineCopy<Task[]>("tasks", listScope(focus, get()));
    if (copy != null) set({ list: copy.payload, staleAt: copy.savedAt });
  }),
  // A-2b: recorded under its own key, never thrown — the tab fires it beside the list, fire-and-forget
  loadWaiting: (focus) => recordLoadAs("waitingError", set, async () => {
    set({ waiting: await getAdapter().getTasksWaiting(focus) });
  }),
  loadColumns: async () => {
    // a backend without §4.5's column route is a backend with no board, not a
    // broken tab — the same shape `loadSlicers` and `stores/sections.ts` use
    const columns = await getAdapter().getColumns().catch(() => []);
    set({ columns });
  },
  /**
   * Loaded once and then left alone (JQ-4).
   *
   * It used to be fetched only by the open task card, because the only thing
   * that needed it was the delegate verb. JQ-4 moved every person's two-letter
   * abbreviation onto these records, so the LIST needs it too — and a row that
   * renders before the fetch lands has no letters to draw, which is exactly
   * what happened: the owner tag disappeared from every row the moment the
   * hand-written map went. `load()` ensures it, and the early return keeps that
   * to one request rather than one per list refresh.
   */
  loadRoster: async () => {
    if (get().roster.length > 0) return;
    const roster = await getAdapter().getAgents().catch(() => []);
    set({ roster });
  },
  loadOpenCount: (focus) => recordLoadAs("openCountError", set, async () => {
    // the tab opens on the plain list far more often than not, and `load()`
    // answers the count from that same response — four requests, not five
    if (plainList(get())) return;
    const rows = await getAdapter().getTasks({ focus, view: "list" });
    set({ openCount: rows.length });
  }),
  loadProjects: async () => {
    const all = await getAdapter().getTasks({ view: "board" }).catch(() => null); // unreadable: the filter keeps its list
    if (all == null) return;
    set({ projects: [...new Set(all.map((t) => t.project).filter((p): p is string => p != null))].sort() });
  },
  nudge: async (id) => {
    if ((await attempt(() => getAdapter().postTaskNudge(id))) === REFUSED) return;
    useSessionStore.getState().showToast("Nudge drafted · in Gmail Drafts · never sends itself");
  },
}));
