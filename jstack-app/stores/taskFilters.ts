/**
 * How the task list is narrowed (F-1, ADR-44) — a slice of `stores/tasks.ts`,
 * not a store of its own.
 *
 * One state object, two files. Every one of these setters ends in the same
 * `load()`, and a second store holding half the query would mean two sources
 * deciding what one request asks — the shape B-3 already paid for once. So this
 * is a zustand SLICE: `stores/tasks.ts` spreads it into its own creator and
 * every reader still writes `useTasksStore((s) => s.slicer)`.
 *
 * What it holds is one idea: the four ways a person narrows the same list —
 * which view, which slicer, which filters, and over what range — plus the
 * slicer set itself, which F-1 turned from a closed enum into records Josh
 * edits. `tasks.ts` keeps the list, the open card and completion.
 */
import { EMPTY_FILTERS, activeFilterCount, isDefaultRange, type TaskFilters, type TaskRange, type TaskSegment } from "@/data/taskFilters";
import { ContractError } from "@/data/ApiAdapter";
import { getAdapter } from "@/data/provider";
import { recordLoad } from "@/lib/loadError";
import type { Slicer } from "@/data/types";

/** the slice's data half, once — `stores/tasks.ts` spreads it into `INITIAL`, so
 * a test resets from the one declaration rather than a hand-typed copy (F-84, P-2) */
export const FILTER_INITIAL = { view: "list" as TaskSegment, slicer: null as string | null, filters: EMPTY_FILTERS, q: "", slicers: [] as Slicer[], slicersLoaded: false, slicersLoadError: null as string | null };

export type TaskFilterSlice = {
  view: TaskSegment;
  /** the id of the selected slicer, or none. A STRING now, not `TaskSlice`:
   * a slicer Josh adds has an id of its own and the union could not name it. */
  slicer: string | null;
  filters: TaskFilters;
  q: string;
  /** the chips themselves (TF-06), from `GET /slicers` */
  slicers: Slicer[];
  /** WPF-6: a load has landed. The editor saves the WHOLE set, and a list that
   * has not arrived is no set at all (A4R5-03's rule, as the rules editor has it) */
  slicersLoaded: boolean;
  /** A-2 (WPF-6): why the last slicer load failed, or null once one gets through. Its own slot, not the
   * list's `loadError`: `recordLoad` clears the slot a load gets through on, and a slicer load landing
   * after a failed list load would have wiped the list's failure (`lib/loadError.ts`) */
  slicersLoadError: string | null;

  setView: (view: TaskSegment, focus?: string) => Promise<void>;
  setSlicer: (slicer: string | null, focus?: string) => Promise<void>;
  setQuery: (q: string, focus?: string) => Promise<void>;
  setFilters: (filters: TaskFilters, focus?: string) => Promise<void>;
  clearFilters: (focus?: string) => Promise<void>;
  setRange: (range: TaskRange, focus?: string) => Promise<void>;
  loadSlicers: () => Promise<void>;
  putSlicers: (next: Slicer[]) => Promise<void>;
  /** TF-07: the slicer, the filters and the range all back to their defaults in
   * one tap — one control for the three things a person can narrow by, because
   * three Clears would leave two of them on. */
  clearAll: (focus?: string) => Promise<void>;
  /** TF-07: whether that control has anything to do. The QUERY is not one of
   * the three: Done's search box clears itself and is visible where it applies. */
  isNarrowed: () => boolean;
};

/** what the slice needs from the rest of the store: the fetch every setter ends in. */
type Deps = { load: (focus?: string) => Promise<void> };

export function createTaskFilterSlice(
  set: (partial: Partial<TaskFilterSlice>) => void,
  get: () => TaskFilterSlice & Deps,
): TaskFilterSlice {
  return {
    ...FILTER_INITIAL,

    setView: async (view, focus) => {
      set({ view });
      await get().load(focus);
    },
    setSlicer: async (slicer, focus) => {
      set({ slicer });
      await get().load(focus);
    },
    setQuery: async (q, focus) => {
      set({ q });
      await get().load(focus);
    },
    setFilters: async (filters, focus) => {
      set({ filters });
      await get().load(focus);
    },
    clearFilters: async (focus) => {
      // the RANGE survives a "Clear all" inside the filter panel: it is not one
      // of the panel's groups, it has its own always-visible chip, and clearing
      // something the person cannot see from that dialog is a surprise.
      set({ filters: { ...EMPTY_FILTERS, range: get().filters.range } });
      await get().load(focus);
    },
    setRange: async (range, focus) => {
      set({ filters: { ...get().filters, range } });
      await get().load(focus);
    },

    loadSlicers: () => recordLoad((p) => set({ slicersLoadError: p.loadError }), async () => {
      // a backend without §4.5's slicer routes (a 404) is a backend with no
      // slicers, not a broken tab — the same shape `stores/sections.ts` uses.
      // WPF-6: any other failure is not an empty list: the chips already on
      // screen stay, the editor waits for a list that loaded, and the reason is
      // recorded as every load's is (A-2)
      try {
        set({ slicers: await getAdapter().getSlicers(), slicersLoaded: true });
      } catch (error) {
        if (!(error instanceof ContractError && error.status === 404)) throw error;
        set({ slicers: [], slicersLoaded: true });
      }
    }),
    putSlicers: async (next) => {
      const slicers = await getAdapter().putSlicers(next);
      // a slicer that was selected and has just been removed cannot stay
      // selected: the chip is gone and the list would go on filtering by it
      set({ slicers, slicersLoaded: true, slicer: slicers.some((x) => x.id === get().slicer) ? get().slicer : null });
      await get().load();
    },

    clearAll: async (focus) => {
      set({ slicer: null, filters: EMPTY_FILTERS });
      await get().load(focus);
    },
    isNarrowed: () => {
      const s = get();
      return s.slicer != null || activeFilterCount(s.filters) > 0 || !isDefaultRange(s.filters.range);
    },
  };
}
