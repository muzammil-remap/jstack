/**
 * The eight block components (B-1, §4.10) — the things a configured section
 * can be made of, and nothing else.
 *
 * Each block is a small component over `theme/ui` primitives only: no
 * raw `fontSize`, no bespoke surface, no store import. That is what
 * makes a section safe to accept as a record — the EA chooses from this
 * list and supplies strings, and the worst config it can write is an
 * ugly one, never an unstyled or a dangerous one. `GET
 * /sections/catalogue` is generated from `CATALOGUE` below, and CB-09
 * asserts the server's copy equals it.
 *
 * `idPrefix` is the block's half of its `testID`s (see `Block` in
 * `data/types.ts`): `rows` emits `{p}-{id}` and `{p}-act-{id}`, `bars`
 * emits `{p}-row-{id}` and `{p}-amount-{id}`, and the rest emit
 * `{p}-{id}`. Those shapes are why B-2 can move Money, People and
 * Learning onto this renderer without touching one line of the LF specs.
 *
 * NO BLOCK DRAWS ITS OWN SURFACE (B-3, ux-review B3R1-03). Each declares
 * one in `SURFACE` below and `SectionRenderer` groups consecutive blocks
 * into it, because a surface is a property of the GROUP, not of a block:
 * Money's due lines belong inside the same card as its bars, and when
 * `BarsBlock` owned a `Card` of its own they could not be. The refactor
 * that made four Life sections generic quietly moved that line onto the
 * ground beside the card it had always been inside.
 */
import React from "react";
import { RichText } from "@/lib/richText";
import { Text, TextStyle, View } from "react-native";
import { BtnSm, Ghost, HabitChip, Meta, Row, Stat, TextLink, Track, Txt } from "@/theme/ui";
import { Sens } from "@/components/chrome/Sens";
import { radius, space, type as typeScale } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { BINDS, ENDPOINTS } from "@/layout/sources";
import type { Block, BlockBar, BlockChip, BlockLine, BlockLink, BlockRow, BlockStat, BlockTile, BlockVerbAction, SectionCatalogue } from "@/data/types";

export type BlockProps = {
  idPrefix: string;
  items: unknown[];
  act?: (id: string, action: BlockVerbAction) => void;
  /** the renderer's own `openModal("external-link", ...)`. Passed in rather
   * than imported so a block component keeps no store dependency at all —
   * `tests/native/sections.test.tsx` mounts all eight with a stub. */
  onLink?: (url: string, name: string) => void;
};

const emphasis = String(typeScale.weight.emphasis) as TextStyle["fontWeight"];

/** rows — name · item, meta under it, an optional verb button on the right. */
export function RowsBlock({ idPrefix, items, act }: BlockProps) {
  const rows = items as BlockRow[];
  return (
    <>
      {rows.map((r, i) => (
        <Row key={r.id} testID={`${idPrefix}-${r.id}`} last={i === rows.length - 1}>
          <View style={{ flex: 1 }}>
            <Txt>
              <Text style={{ fontWeight: emphasis }}>{r.name}</Text>
              {r.item ? ` · ${r.item}` : ""}
            </Txt>
            {r.meta ? <Meta>{r.meta}</Meta> : null}
          </View>
          {r.verb && act ? <BtnSm testID={`${idPrefix}-act-${r.id}`} label={r.verb.label} onPress={() => act(r.id, r.verb!.action)} /> : null}
        </Row>
      ))}
    </>
  );
}

/** stats — the big-number row; `sens` values blur with privacy on (GL-03). */
export function StatsBlock({ idPrefix, items }: BlockProps) {
  const stats = items as BlockStat[];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
        {stats.map((s) => (
          <View key={s.id} testID={`${idPrefix}-${s.id}`} style={{ minWidth: 72 }}>
            {s.sens ? <Sens kind="stat">{s.value}</Sens> : <Stat>{s.value}</Stat>}
            <Meta>{s.label}</Meta>
        </View>
      ))}
    </View>
  );
}

/** bars — label · track · amount, the money shape (LF-05). */
export function BarsBlock({ idPrefix, items }: BlockProps) {
  const c = useTokens();
  const bars = items as BlockBar[];
  return (
    <View style={{ gap: 8 }}>
        {bars.map((b) => (
          <View key={b.id} testID={`${idPrefix}-row-${b.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Meta style={{ width: 44 }}>{b.label}</Meta>
            <Track value={b.max > 0 ? b.value / b.max : 0} over={b.over} style={{ flex: 1 }} />
            <Sens testID={`${idPrefix}-amount-${b.id}`} kind="meta" style={{ color: b.over ? c.alert : c.muted }}>
              {b.amount}
            </Sens>
        </View>
      ))}
    </View>
  );
}

/** chips — the habit strip; `act` receives the chip id and "toggle". */
export function ChipsBlock({ idPrefix, items, act }: BlockProps) {
  const chips = items as BlockChip[];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {chips.map((ch) => (
        <HabitChip key={ch.id} testID={`${idPrefix}-${ch.id}`} label={ch.label} done={ch.on} onPress={act ? () => act(ch.id, "toggle") : undefined} />
      ))}
    </View>
  );
}

/** grid — the portal tiles shape: a name, what it is for, an optional link. */
export function GridBlock({ idPrefix, items, onLink }: BlockProps) {
  const c = useTokens();
  const tiles = items as BlockTile[];
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
      {tiles.map((t) => (
        <View
          key={t.id}
          testID={`${idPrefix}-${t.id}`}
          style={{ minWidth: 128, flexGrow: 1, flexBasis: 128, borderWidth: 1, borderColor: c.hairline, borderRadius: radius.card, padding: space[3] }}
        >
          <Txt weight="emphasis">{t.name}</Txt>
          <Meta>{t.purpose}</Meta>
          {t.url ? <TextLink testID={`${idPrefix}-open-${t.id}`} label="open" onPress={() => onLink?.(t.url!, t.name)} /> : null}
        </View>
      ))}
    </View>
  );
}

/** text — one or more meta lines; a bound line may lead with an accented
 * span (the bill and its date) before its provenance (LF-06). */
export function TextBlock({ idPrefix, items }: BlockProps) {
  const c = useTokens();
  const lines = items as BlockLine[];
  return (
    <>
      {/* C-4 / UX-D: both halves go through `RichText`, so the middle dots bind
          to their neighbours and the last value cannot be left alone on its own
          line — Money's footer wrapped as "… feed: Redbark, / V2.1" at 1024 and
          1366 while reading fine at 393 and 1920. One primitive, not a second
          copy of the rule: `lib/richText.tsx` is where it lives. */}
      {lines.map((l) => (
        <Meta key={l.id} testID={`${idPrefix}-${l.id}`} style={{ marginTop: space[3] }}>
          {l.accent ? <RichText text={l.accent} style={{ color: c.accentInk }} /> : null}
          <RichText text={l.text} />
        </Meta>
      ))}
    </>
  );
}

/** ghost — the dashed "not gated in yet" card (LF-07).
 *
 * No `marginTop` here, nor on chips, grid or links: the GROUP that wraps
 * them supplies it (`Blocks` in `layout/SectionRenderer.tsx`). Both applying
 * it put Health's ghost 8px lower than the component it replaced and pushed
 * Learning 14px down the column — a refactor promised to change nothing
 * (ux-review B3R2-03). */
export function GhostBlock({ idPrefix, items }: BlockProps) {
  const lines = items as BlockLine[];
  return (
    <>
      {lines.map((l) => (
        <Ghost key={l.id} testID={`${idPrefix}-ghost`}>
          <Txt tone="muted">{l.text}</Txt>
        </Ghost>
      ))}
    </>
  );
}

/** links — external links, always through the host's `onLink`, so the
 * leaving-the-app confirmation applies to a configured link too. */
export function LinksBlock({ idPrefix, items, onLink }: BlockProps) {
  const links = items as BlockLink[];
  return (
    <View style={{ gap: 4 }}>
      {links.map((l) => (
        <TextLink key={l.id} testID={`${idPrefix}-${l.id}`} label={l.label} onPress={() => onLink?.(l.url, l.label)} />
      ))}
    </View>
  );
}

