/**
 * SectionRenderer (B-1, §4.10) — the one component that turns a
 * `SectionConfig` record into a rendered section: Label, then blocks
 * from `layout/catalogue.tsx`, in order.
 *
 * TWO RULES hold this file down.
 *
 * 1. It never calls `ApiAdapter`. `source.endpoint` names an endpoint, and
 *    the data comes from the STORE that owns it (`layout/sources.ts`), so a
 *    configured section inherits focus filtering, silo gating, optimistic
 *    outbox rows and the server-event refetch for free. A renderer with its
 *    own fetch would have none of those and would drift from the built-in
 *    section beside it the first time one of them changed.
 *
 * 2. Every bind hook is called from its own child component, keyed by the
 *    bind name. `BINDS[name].use()` is a different hook body per name, so
 *    calling it from a loop in this component would change hook order the
 *    moment a config was edited. Keying the child means React remounts it
 *    instead — the legal way to swap one hook for another.
 *
 * `testID`s are derived, never authored: `{tab}-{id}-section` for the
 * section, `{id}-configure` for the link, `{idPrefix}-…` inside each
 * block. B-2 moves Money, People and Learning onto this renderer without
 * editing one line of the LF specs, which is the proof that the shapes
 * above are the ones the app already had.
 */
import React, { useEffect } from "react";
import { useDeviceStore } from "@/stores/device";
import { View } from "react-native";
import { Card, Inset, Label, ListCard, Meta, Txt } from "@/theme/ui";
import { sectionHeaderRight } from "@/layout/SectionHeaderRight";
import { ContractError } from "@/data/ApiAdapter";
import { BLOCK_COMPONENTS, SURFACE, VERBS } from "@/layout/catalogue";
import { BINDS, LOADERS, SECTION_VERBS } from "@/layout/sources";
import { packPayload } from "@/layout/dialogKit";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { space } from "@/theme/tokens";
import type { Block, BlockLine, BlockVerbAction, Capabilities, SectionConfig } from "@/data/types";

/** People's toasts, and the reason they are not one string: only "draft"
 * has copy the acceptance test mandates ("Drafted · never sends itself"),
 * and reusing that line for a nudge would be a lie about what happened. */
/**
 * What a verb says when it worked. `open` is deliberately null (O-1): it used
 * to toast "Opened" over a screen where nothing had opened, which is the
 * shape ADR-52 is about — a control that reports success instead of doing the
 * thing. The dialog IS the feedback now.
 */
const TOAST: Record<BlockVerbAction, string | null> = {
  draft: "Drafted · never sends itself",
  nudge: "Nudged",
  done: "Done",
  toggle: "Updated",
  open: null,
};

/** one load per endpoint per session; several configured sections on a tab
 * must not each refetch the composite their tab already loaded. */
const loaded = new Set<string>();

function literalItems(block: Block): unknown[] {
  if (block.type === "text") return block.text != null ? ([{ id: "t", text: block.text }] as BlockLine[]) : [];
  if (block.type === "ghost") return [{ id: "g", text: block.text }] as BlockLine[];
  if (block.type === "rows") return block.rows ?? [];
  if (block.type === "grid") return block.tiles ?? [];
  return block.items ?? [];
}

function useAct(): (act: ((id: string, action: BlockVerbAction) => Promise<void>) | undefined) => (id: string, action: BlockVerbAction) => void {
  const showToast = useSessionStore((s) => s.showToast);
  return (act) => (id, action) => {
    if (!act) return;
    void act(id, action).then(
      () => {
        const said = TOAST[action];
        if (said != null) showToast(said);
      },
      (e: unknown) => {
        const reason = e instanceof ContractError ? e.reason : undefined;
        showToast(reason ? `Couldn't · ${reason}` : "Couldn't · try again");
      },
    );
  };
}

/** SH-06: a bound row's verb comes from the SERVER, and only the five verbs
 * the catalogue publishes may become a button. Anything else is dropped at
 * render — the row stays, the verb goes — because a backend that sent `zap`
 * must not put a live control on the screen that posts `zap` back. */
function knownVerbsOnly(items: unknown[]): unknown[] {
  return items.map((it) => {
    const r = it as { verb?: { action?: string } };
    if (r.verb == null || VERBS.includes(r.verb.action as BlockVerbAction)) return it;
    return { ...r, verb: undefined };
  });
}

function BoundBlock({ block, bindName, onLink, max }: { block: Block; bindName: string; onLink?: (url: string, name: string) => void; max?: number }) {
  const Comp = BLOCK_COMPONENTS[block.type];
  const { items, act } = BINDS[bindName].use();
  const wrap = useAct();
  const rows = knownVerbsOnly(max == null ? items : items.slice(0, max));
  // no `act` means no verb button (RowsBlock draws one only when it has a
  // handler) — which is how a preview renders the same block without
  // offering an action on a section that does not exist yet.
  return <Comp idPrefix={block.idPrefix ?? ""} items={rows} act={act && onLink ? wrap(act) : undefined} onLink={onLink} />;
}

function LiteralBlock({ block, onLink, max }: { block: Block; onLink?: (url: string, name: string) => void; max?: number }) {
  const Comp = BLOCK_COMPONENTS[block.type];
  const items = literalItems(block);
  return <Comp idPrefix={block.idPrefix ?? ""} items={max == null ? items : items.slice(0, max)} onLink={onLink} />;
}

/**
 * Blocks grouped into the surfaces they share (B-3, ux-review B3R1-03).
 *
 * A surface belongs to a GROUP, not to a block: Money's due lines are part
 * of the same card as its bars, and while `BarsBlock` drew its own `Card`
 * they could not be. A block whose `SURFACE` is `none` joins whatever
 * surface is open; one that names a surface opens a new one.
 */
type Group = { surface: "card" | "list" | "none"; blocks: { block: Block; i: number }[] };

function groupBlocks(blocks: Block[]): Group[] {
  const groups: Group[] = [];
  blocks.forEach((block, i) => {
    const surface = SURFACE[block.type];
    const open = groups[groups.length - 1];
    if (surface === "none" && open != null && open.surface !== "none") open.blocks.push({ block, i });
    else if (surface === "none" && open != null && open.surface === "none") open.blocks.push({ block, i });
    else groups.push({ surface, blocks: [{ block, i }] });
  });
  return groups;
}

/** exported for `layout/SectionPreview.tsx` (S-7): the preview draws the same
 * blocks the renderer does, which is the whole point of it. */
export function Blocks({ blocks, onLink, max, flat = false }: { blocks: Block[]; onLink?: (url: string, name: string) => void; max?: number; flat?: boolean }) {
  return (
    <>
      {groupBlocks(blocks).map((group, gi) => {
        const inner = group.blocks.map(({ block, i }) =>
          "bind" in block && block.bind != null ? (
            <BoundBlock key={`${i}-${block.type}-${block.bind}`} block={block} bindName={block.bind} onLink={onLink} max={max} />
          ) : (
            <LiteralBlock key={`${i}-${block.type}`} block={block} onLink={onLink} max={max} />
          ),
        );
        // `flat` is the preview's mode: same blocks, no surface. Stacking a
        // card inside an inset inside a card is legible in light and is not
        // in dark — three alpha layers put the innermost fill at .25 and its
        // meta text at 1.65:1 against the pack's 4.6 (ux-review B3R1-02).
        if (flat || group.surface === "none") return <View key={gi} style={{ marginTop: 8, gap: 8 }}>{inner}</View>;
        const Surface = group.surface === "list" ? ListCard : Card;
        return (
          <Surface key={gi} style={{ marginTop: 8 }}>
            {inner}
          </Surface>
        );
      })}
    </>
  );
}

/** the Label when `badge: "count"` — the count is the bound block's real
 * row count, not a number typed into the config (LF-08's badge was a
 * hardcoded "4" over two rows in the mock; a config could repeat that
 * mistake permanently, so the config cannot carry the number at all). */
function CountedLabel({ bindName, sectionId, title, hint, right }: { bindName: string; sectionId: string; title: string; hint?: string; right?: React.ReactNode }) {
  const { items, total } = BINDS[bindName].use();
  return (
    <Label sectionId={sectionId} badge={total ?? items.length} hint={hint} right={right}>
      {title}
    </Label>
  );
}

export function SectionRenderer({ config }: { config: SectionConfig }) {
  const openModal = useSessionStore((s) => s.openModal);
  const capabilities = useSettingsStore((s) => s.capabilities);
  const collapsed = useDeviceStore((s) => s.collapsed[config.id] === true);
  const endpoint = config.source.endpoint;

  useEffect(() => {
    if (loaded.has(endpoint)) return;
    loaded.add(endpoint);
    void LOADERS[endpoint]?.().catch(() => loaded.delete(endpoint));
  }, [endpoint]);

  // `feed` is validated against the live capability names before a config is
  // ever stored (`layout/validateSectionConfig.ts`), which is what makes this
  // one cast safe; the type cannot say so because `keyof` is not a wire shape.
  const gated = config.feed == null ? true : capabilities[config.feed as keyof Capabilities] === true;
  const onLink = (url: string, name: string) => openModal("external-link", packPayload(url, name));

  // a ghost block is what the section shows INSTEAD of its content while the
  // source is not gated in (LF-07) — so the two halves are mutually exclusive.
  const blocks = config.blocks.filter((b) => (b.type === "ghost" ? !gated : gated));
  const firstBound = config.blocks.find((b) => "bind" in b && b.bind != null);
  const countBind = config.badge === "count" && firstBound && "bind" in firstBound ? firstBound.bind : undefined;

  // T-4/X-1: up to two controls beside the heading — the section's verb and
  // `configure`. `layout/SectionHeaderRight.tsx` owns them, and owns the gap
  // rule they need (B-49): two `Txt onPress` links closer than `2 * LINK_SLOP`
  // have OVERLAPPING boxes, and the later one wins every click.
  const right = sectionHeaderRight(config);

  return (
    <View testID={`${config.tab}-${config.id}-section`}>
      {countBind ? (
        // keyed for the same reason BoundBlock is: a different bind is a
        // different hook body, so React must remount rather than reorder.
        <CountedLabel key={countBind} bindName={countBind} sectionId={config.id} title={config.title} hint={config.hint} right={right} />
      ) : (
        <Label sectionId={config.id} hint={config.hint} right={right}>
          {config.title}
        </Label>
      )}
      {/* H-1: the heading always shows, the body does not. A configured
          section's id is its own `config.id`, so a section that is renamed
          keeps its collapsed state and one that is replaced does not
          inherit somebody else's. */}
      {collapsed ? null : <Blocks blocks={blocks} onLink={onLink} />}
    </View>
  );
}
