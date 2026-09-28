/**
 * The block catalogue (B-1, §4.10) — the published contract for what a
 * section config may contain.
 *
 * The components themselves live in `layout/blocks.tsx`; this file is the
 * closed lists the app, the mock server and the configure dialog all read,
 * and `GET /sections/catalogue` is generated from them (CB-09 asserts the
 * server's copy equals the app's). Split from the components at B-3 when
 * SM-03's 250-line limit refused the combined file — and the split is the
 * right one: one file is React, the other is the contract, and only the
 * second is something a backend has to agree with.
 */
import React from "react";
import { BarsBlock, ChipsBlock, GhostBlock, GridBlock, LinksBlock, RowsBlock, StatsBlock, TextBlock, type BlockProps } from "@/layout/blocks";
import { BINDS, ENDPOINTS, SECTION_VERBS } from "@/layout/sources";
import type { Block, BlockVerbAction, SectionCatalogue, SectionVerbAction } from "@/data/types";

export { BarsBlock, ChipsBlock, GhostBlock, GridBlock, LinksBlock, RowsBlock, StatsBlock, TextBlock };
export type { BlockProps };

// ── the catalogue itself ───────────────────────────────────────────────
// `GET /sections/catalogue` is built from these four constants, and the
// validator reads the same ones. One list, three consumers: the mock
// server, the app's validator and the configure dialog can't disagree
// about what a section may contain (CB-09).

export const BLOCK_COMPONENTS: Record<Block["type"], React.ComponentType<BlockProps>> = {
  rows: RowsBlock,
  stats: StatsBlock,
  bars: BarsBlock,
  chips: ChipsBlock,
  grid: GridBlock,
  text: TextBlock,
  ghost: GhostBlock,
  links: LinksBlock,
};

export const BLOCK_TYPES = Object.keys(BLOCK_COMPONENTS) as Block["type"][];

/**
 * The surface a block opens. `none` means it joins whatever surface is
 * already open (or renders on the ground when none is). This table plus the
 * grouping in `SectionRenderer` reproduce exactly what the four hand-written
 * Life sections drew: bars and their due lines in one `Card`, rows in one
 * `ListCard`, a ghost on its own dashed panel, a footer line on the ground.
 */
export const SURFACE: Record<Block["type"], "card" | "list" | "none"> = {
  rows: "list",
  stats: "card",
  bars: "card",
  chips: "none",
  grid: "none",
  text: "none",
  ghost: "none",
  links: "none",
};

/** Types whose content may be written inline in the config. The other
 * four are data shapes: a `rows` block with fifty rows typed into it is a
 * config file pretending to be a database, so it must bind instead. */
export const LITERAL_BLOCKS: Block["type"][] = ["text", "ghost", "links", "stats", "chips"];

export const VERBS: BlockVerbAction[] = ["open", "draft", "nudge", "done", "toggle"];

/**
 * Capability flags a section may gate its ghost on. Written out rather
 * than derived from `Capabilities` because `keyof` is not a wire shape
 * (the OpenAPI walker refuses it, by design) — `tests/unit/sections.test.ts`
 * asserts this list against the real capability object, so a new flag that
 * belongs here fails a test rather than going quietly missing.
 */
export const FEEDS = ["liveRouting", "liveVoice", "speech", "fileStore", "calendarWrite", "moneyFeed", "healthFeed", "export", "calendarViews"];

export const LIMITS = { blocks: 12, string: 200, items: 50 };

export function catalogue(): SectionCatalogue {
  return {
    blocks: BLOCK_TYPES.map((type) => ({
      type,
      binds: Object.entries(BINDS)
        .filter(([, b]) => b.block === type)
        .map(([name]) => name)
        .sort(),
      literal: LITERAL_BLOCKS.includes(type),
    })),
    verbs: VERBS,
    // T-4: a different list from `verbs` — that one is what a ROW inside a
    // block may carry; this one is what the SECTION may carry beside its
    // heading. Sorted so the catalogue is stable to compare (CB-09).
    sectionVerbs: (Object.keys(SECTION_VERBS) as SectionVerbAction[]).sort(),
    endpoints: [...ENDPOINTS],
    feeds: FEEDS,
    limits: LIMITS,
  };
}
