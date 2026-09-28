/**
 * search.ts (K-1, §4.19) — the global Find.
 *
 * Its own store, and not a slice of anything: Find is opened from the rail,
 * from Cmd/Ctrl+K, from a glyph in every phone header, and its results reach
 * into ten other tabs' records. There is no tab it belongs to.
 *
 * THE FILTERS ARE SENT, NOT APPLIED HERE. `focus` and `sensitivity` go to the
 * server on every query, because the silo gate and the clearance gate are the
 * server's and a client that filtered a full result set would be showing the
 * filter while the network carried the rows (MU-02). The same call therefore
 * runs again when a chip changes — which is the point, not a cost.
 *
 * `run` is guarded against an out-of-order answer. Two keystrokes in flight
 * and the slower one landing second would put the earlier query's results
 * under the later query's text, which is the one failure a search must not
 * have: it looks exactly like a wrong answer.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import type { SearchResponse } from "@/data/types";

type SearchState = {
  q: string;
  focus: string;
  sensitivity: "all" | "normal" | "sens";
  response: SearchResponse | null;
  loading: boolean;
  /** which sensitive rows the person has chosen to reveal, by `kind:id`
   * (GS-07). Per session and per row: revealing one is not a decision about
   * the rest, and it is never persisted. */
  revealed: string[];

  setQuery: (q: string) => void;
  setFocus: (focus: string) => void;
  setSensitivity: (s: "all" | "normal" | "sens") => void;
  reveal: (key: string) => void;
  run: () => Promise<void>;
  clear: () => void;
};

let inFlight = 0;

export const useSearchStore = create<SearchState>((set, get) => ({
  q: "",
  focus: "all",
  sensitivity: "all",
  response: null,
  loading: false,
  revealed: [],

  setQuery: (q) => set({ q }),
  setFocus: (focus) => {
    set({ focus });
    void get().run();
  },
  setSensitivity: (sensitivity) => {
    set({ sensitivity });
    void get().run();
  },
  reveal: (key) => set((s) => (s.revealed.includes(key) ? s : { revealed: [...s.revealed, key] })),

  run: async () => {
    const { q, focus, sensitivity } = get();
    if (q.trim() === "") {
      set({ response: null, loading: false });
      return;
    }
    const ticket = ++inFlight;
    set({ loading: true });
    try {
      const response = await getAdapter().getSearch({ q, focus, sensitivity });
      // a slower earlier query must not land on a later one's text
      if (ticket !== inFlight) return;
      set({ response, loading: false });
    } catch {
      if (ticket !== inFlight) return;
      set({ loading: false });
    }
  },

  clear: () => {
    // the ticket moves so an answer already in flight cannot repopulate a
    // Find the person has just emptied
    inFlight++;
    set({ q: "", response: null, loading: false, revealed: [] });
  },
}));

/** The total across every group — what the cap line counts, and what "no
 * results" means. Derived rather than stored: two numbers for one fact drift. */
export function shownCount(response: SearchResponse | null): number {
  return (response?.groups ?? []).reduce((n, g) => n + g.items.length, 0);
}
