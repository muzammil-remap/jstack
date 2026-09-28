/**
 * Section-level verbs (T-4) — the same closed-list rule as `BINDS` in
 * `layout/sources.ts`, one level up. A configured section had no verb slot
 * at all until "Copy as CSV" needed one, and the temptation at that point is
 * a field carrying a URL or a snippet. This is a NAME: the config picks from
 * what exists, and what the name does is written here in TypeScript like
 * everything else.
 *
 * Split out of `sources.ts` (SM-03: that file sits at its own 250-line
 * limit) the way `sourcesBrain.ts`'s `BRAIN_BINDS` already is — re-exported
 * there so every caller keeps importing `@/layout/sources`.
 */
import { useSessionStore } from "@/stores/session";
import { useUsageStore } from "@/stores/usage";
import type { SectionVerbAction } from "@/data/types";

export const SECTION_VERBS: Record<SectionVerbAction, { label: string; use: () => () => void }> = {
  "copy-csv": {
    label: "Copy the section's rows as CSV",
    use: () => useUsageStore((s) => s.copyCsv),
  },
  /** X-1 (FL-03): Brain › Files "all" — the whole archive, with its filters.
   * A section verb rather than a row verb because it is about the LIST, not
   * about any one file in it. */
  "open-files-archive": {
    label: "all",
    use: () => {
      const openModal = useSessionStore((s) => s.openModal);
      return () => openModal("files-archive");
    },
  },
  /** LL-03: Life › Learning "all" — the same shape as `open-files-archive`. */
  "open-learning-archive": {
    label: "all",
    use: () => {
      const openModal = useSessionStore((s) => s.openModal);
      return () => openModal("learning-archive");
    },
  },
};
