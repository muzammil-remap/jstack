/**
 * rules.ts (ADR-04, ST-1) — the standing instructions Josh has given his EA.
 *
 * Its own store rather than a slice of `stores/settings.ts`, which was at 211
 * of its 200 lines with it. The split is a real one: everything else in that
 * store is a SETTING — a switch, a schedule, a level — read once and written
 * back, while these are a LIST the person edits, that the mock obeys, and that
 * grows on its own when a card is answered or something is taught. It also
 * arrives from three places (the editor, Teach, and an approved `rule` card),
 * which is the shape a store is for.
 *
 * `POST /rules` and V2.1's `Rule` were retired here. A rule taught from a card
 * and a rule written in Settings were different kinds of thing, stored in
 * different lists, and only one of them was ever read by the mock.
 */
import { create } from "zustand";
import { getAdapter } from "@/data/provider";
import { saveWith } from "@/lib/optimistic";
import type { AutonomyRule } from "@/data/types";

type RulesState = {
  rules: AutonomyRule[];
  /** A4R5-03: whether `rules` has ever been loaded. An empty list and a list
   *  nobody has asked for are different things to a whole-set write. */
  loaded: boolean;
  load: () => Promise<void>;
  /** `false` when refused — said in a toast, nothing changed */
  put: (next: AutonomyRule[]) => Promise<boolean>;
  add: (text: string, from?: string) => Promise<void>;
};

export const useRulesStore = create<RulesState>((set, get) => ({
  rules: [],
  loaded: false,

  /**
   * The panel asks when it mounts, and so does the editor (A4R5-03: Find opens
   * the editor with nothing else having asked), and that is deliberate rather
   * than lazy: a rule can arrive while the app is open — answering a `rule`
   * card writes one SERVER-SIDE — and `lib/serverEvents.ts` has no `settings`
   * kind to carry it back. Cheap, and correct whether the rule came from a
   * card, from Teach, or from another device.
   */
  load: async () => {
    const { rules } = await getAdapter().getAutonomyRules();
    set({ rules, loaded: true });
  },

  /**
   * The whole set at once, as `/slicers`, `/focuses`, `/goals` and `/habits`
   * are saved. The response is what the SERVER kept — it refuses a rule with
   * no text and a scope it has never heard of, and a store that set its own
   * array would show a rule the server rejected.
   */
  put: (next) => saveWith(() => getAdapter().putAutonomyRules(next), (saved) => set({ rules: saved.rules })),

  /**
   * ST-04: teach, from anywhere. One line becomes a standing rule, appended
   * through the same route the editor saves through rather than through a
   * second write path — `POST /rules` used to be that second path.
   *
   * `addedBy: "josh"` because he typed it. `from` is the card it came off,
   * kept in the id so a rule can be traced back to the decision that made it.
   */
  add: async (text, from) => {
    // READ, then append. `get().rules` is empty until something has loaded
    // them, and Teach is reached from Today — where nothing has. Appending to
    // an empty array and PUTting the result replaced the whole list with one
    // rule, which is the worst possible outcome for a write whose entire
    // purpose is that nothing is ever lost. Found by `decisions.spec.ts`
    // counting eight rules and getting one.
    await get().load();
    const now = new Date();
    const rule: AutonomyRule = {
      // A4R4-04: a card can produce TWO rules — the one `applyTriageVerb`
      // mints server-side when the card is answered `teach` (`ar-${card.id}`,
      // which the card's undo removes by that derived id) and the one the
      // person then types in the Teach sheet. Deriving both from the card id
      // gave them one id: `Rules.tsx` keys by it, so one of the pair could not
      // be edited or deleted, and undoing the card deleted the typed sentence.
      // The card keeps the derived id; the person's rule gets its own.
      id: from != null && from !== "" ? `ar-${from}-taught-${now.getTime()}` : `ar-${now.getTime()}`,
      text: text.trim(),
      scope: "all",
      mode: "ask",
      on: true,
      addedBy: "josh",
      addedAt: now.toISOString(),
    };
    await get().put([...get().rules, rule]);
  },
}));
