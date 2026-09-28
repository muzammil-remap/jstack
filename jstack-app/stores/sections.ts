/**
 * §4.10 configured sections (B-2, B-3).
 *
 * Its own store, and the reason is the one SM-03's line limit forced into
 * the open: a section is not a setting. `stores/settings.ts` holds what
 * Josh has chosen — notification groups, quiet hours, autonomy, theme,
 * layout — and a section config is a piece of the app's SHAPE that the EA
 * proposes and Josh accepts. They are merged into the registry, previewed
 * on decision cards and arranged like components; none of that is a
 * preference.
 *
 * A PROPOSAL is deliberately not held here. `GET /sections` returns active
 * configs only, because a proposal is not a section yet — it lives on the
 * decision card that carries it until a verb decides its fate (B-3).
 */
import { create } from "zustand";
import { ContractError } from "@/data/ApiAdapter";
import { getAdapter } from "@/data/provider";
import { recordLoad } from "@/lib/loadError";
import type { SectionConfig } from "@/data/types";

type SectionsState = {
  sections: SectionConfig[];
  /** A-2: why the last load failed, or null once one gets through (`lib/loadError.ts`, WPF-6) */
  loadError: string | null;
  load: () => Promise<void>;
  save: (id: string, patch: Partial<SectionConfig>) => Promise<void>;
  revert: (id: string) => Promise<void>;
  propose: (config: SectionConfig, reason: string) => Promise<void>;
};

export const useSectionsStore = create<SectionsState>((set) => ({
  sections: [],
  loadError: null,

  load: () => recordLoad(set, async () => {
    // a backend without §4.10 yet (a 404) is a backend with no configured
    // sections, not a broken tab: the static registry still renders either way.
    // WPF-6: any other failure keeps the sections already here — a blip is not
    // a layout with nothing configured — and is recorded as every load's is (A-2)
    try {
      set({ sections: await getAdapter().getSections() });
    } catch (error) {
      if (!(error instanceof ContractError && error.status === 404)) throw error;
      set({ sections: [] });
    }
  }),

  save: async (id, patch) => {
    const next = await getAdapter().putSection(id, patch);
    set((s) => ({ sections: s.sections.map((x) => (x.id === id ? next : x)) }));
  },

  revert: async (id) => {
    const next = await getAdapter().revertSection(id);
    set((s) => ({ sections: s.sections.map((x) => (x.id === id ? next : x)) }));
  },

  /** re-proposing a revised config. The list is NOT updated — a proposal is
   * not a section, and `GET /sections` is right to leave it out until it is
   * approved. */
  propose: async (config, reason) => {
    await getAdapter().proposeSection(config, reason);
  },
}));
