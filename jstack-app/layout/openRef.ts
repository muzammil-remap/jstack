/**
 * openRef.ts (O-1, resolution #31) — open any record from a `"<kind>:<id>"`.
 *
 * Split out of `layout/dialogs.tsx`, which is a registry at its 250-line cap
 * (hard rule 3). This is a resolver rather than a registration, and it has
 * more callers than the registry does: Find's results, a Reply's sources
 * (R-1), a search row and a triage card all point at records the same way.
 * The alternative is each of them growing its own switch, and four switches
 * that disagree about what `file:` means is exactly the drift hard rule 16
 * exists to stop.
 */

/**
 * O-1 / resolution #31 — open any record from a `"<kind>:<id>"` ref.
 *
 * One resolver, because the alternative is every surface that holds a ref
 * growing its own switch: Find's sources, a Reply's sources (R-1), a search
 * result and a triage card all point at records the same way. The kind is the
 * part before the FIRST colon and the id is everything after it — ids in this
 * app contain colons (`personal:josh`), and splitting on all of them was the
 * obvious bug to write here.
 *
 * Returns false for a kind nothing can open yet, so a caller can say so
 * instead of opening an empty dialog.
 */
import { useTaskCardStore } from "@/stores/taskCard";
import { tabPath } from "@/layout/tabRoutes";

const REF_DIALOGS: Record<string, string> = {
  brain: "brain-item",
  item: "brain-item",
  decision: "decision",
  action: "decision",
  issue: "issue",
  learning: "learning",
  goal: "goal",
  file: "file",
  task: "task",
};

/**
 * R-1: `task` is the one entry here whose dialog is NOT driven by
 * `openModal`. `DialogHost` reads `useTaskCardStore.openTaskId` for it
 * (`layout/dialogs.tsx` gives it `source: "task"`), so handing its name to the
 * `open` callback resolved a ref, returned true, and opened nothing — a listed
 * thing that does not open, which is the exact defect O-1 exists to remove. It
 * was latent until a Reply's sources became the first caller to hold a task
 * ref. The store call lives HERE rather than in each caller for the same
 * reason the map does.
 */
export function openRef(ref: string, open: (name: string, payload: string) => void): boolean {
  const at = ref.indexOf(":");
  if (at === -1) return false;
  const name = REF_DIALOGS[ref.slice(0, at)];
  if (name == null) return false;
  const id = ref.slice(at + 1);
  if (name === "task") useTaskCardStore.getState().openTask(id);
  else open(name, id);
  return true;
}

/**
 * K-1 / GS-04 — open a SEARCH result, which carries `{ tab, dialog, id }`
 * rather than a `"<kind>:<id>"` string.
 *
 * Here rather than in `FindDialog`, beside the string resolver, because the
 * two answer the same question and a second switch over record kinds is the
 * thing this file exists to prevent. A result names its TAB as well as its
 * dialog: a task card opened from Find while Life is on screen would leave the
 * person one Close away from a tab they never chose.
 *
 * `people` has no dialog of its own — Life › People is the surface, and the
 * navigation IS the answer (GS-04). It is spelled out rather than left to fall
 * through, so the next person reading this knows it was decided.
 */
export function openSearchResult(ref: { tab: string; dialog: string; id: string }, navigate: (path: string) => void, open: (name: string, payload: string) => void): void {
  navigate(tabPath(ref.tab));
  if (ref.dialog === "people") return;
  if (ref.dialog === "task") useTaskCardStore.getState().openTask(ref.id);
  else open(ref.dialog, ref.id);
}
