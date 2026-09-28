/**
 * `<Columns>` (ADR-01, ADR-07) — the three breakpoint rules, straight from
 * the pack's `.cols` CSS (design/tokens/components.css lines 100-104):
 * under 768 one column, sections in full registry order (not grouped by
 * column); 768–1179 two columns (`1.3fr 1fr`) where column 3's sections
 * stack directly under column 1 (its own `.col:nth-child(3){grid-column:1;
 * grid-row:2}`) and column 2 stands alone beside them; 1180+ three columns
 * (`1.3fr 1fr .95fr`, gap 18), content max-width 1500 (RL-04).
 *
 * React Native has no CSS grid — the 2-column case is reproduced with
 * Flexbox by concatenating column 1's sections then column 3's sections
 * into one left-hand flex column, exactly matching the grid's visual
 * effect (column 2 stands beside them, ending wherever its own content
 * ends, never stretched to match).
 */
import React from "react";
import { View } from "react-native";
import { webData } from "@/lib/webData";
import { useLayout } from "@/theme/useLayout";
import { grid, misc, space } from "@/theme/tokens";
import type { SectionDef } from "@/layout/registry";

/** the pack's `grid-template-columns` strings as flex ratios, parsed once at
 * module scope rather than on every render (F-46): `1.3fr 1fr` and
 * `1.3fr 1fr .95fr` */
const fr = (track: string) => Number(track.replace("fr", ""));
const TWO = grid.two.split(" ").map(fr);
const THREE = grid.three.split(" ").map(fr);

export function Columns({ columns }: { columns: SectionDef[][] }) {
  const { columns: count } = useLayout();

  if (count === 1) {
    // phone: full registry order, not grouped by column — flatten in the
    // order the three columns were declared (1, 2, 3), sections within
    // each column keep their own relative order
    const flat = [...columns[0], ...columns[1], ...columns[2]];
    return (
      <View testID="columns" {...webData({ columns: "1" })} style={{ gap: space[6] }}>
        {flat.map((s) => (
          <View key={s.id}>{s.render()}</View>
        ))}
      </View>
    );
  }

  if (count === 2) {
    // The pack's rule is "column 3 sits directly under column 1 and column 2
    // spans both rows" — which only describes a tab that HAS a column 2. On a
    // tab whose column 2 is empty (Tasks, whose list spans 1+2 at 1180+),
    // stacking column 3 under column 1 would leave the whole right half blank,
    // so column 3 takes the right-hand slot instead.
    const hasMiddle = columns[1].length > 0;
    const left = hasMiddle ? [...columns[0], ...columns[2]] : columns[0];
    const right = hasMiddle ? columns[1] : columns[2];
    return (
      <View testID="columns" {...webData({ columns: "2" })} style={{ flexDirection: "row", gap: space[8], alignItems: "flex-start" }}>
        <View style={{ flex: TWO[0], gap: space[3] }}>
          {left.map((s) => (
            <View key={s.id}>{s.render()}</View>
          ))}
        </View>
        <View style={{ flex: 1, gap: space[3] }}>
          {right.map((s) => (
            <View key={s.id}>{s.render()}</View>
          ))}
        </View>
      </View>
    );
  }

  // A column-1 section marked `span: 2` occupies columns 1 AND 2 (handoff.md,
  // Tasks). Only meaningful when column 2 is empty, which is the only shape the
  // registry uses it in; the merged column then carries 1.3 + 1 + the 18px gap
  // between them, so column 3 keeps exactly the width it has on every other tab.
  // The ratios come from the `grid` token, which is the pack's own
  // `grid-template-columns` string — they used to be the literals 1.3 / 1 /
  // .95 / 2.3 typed ten lines above a re-export of that very token, so a pack
  // value could change, regenerate, and move nothing (AUDIT_v2.md A-08).
  const spans = columns[0].some((s) => s.span === 2) && columns[1].length === 0;
  const tracks: { flex: number; sections: SectionDef[] }[] = spans
    ? [{ flex: THREE[0] + THREE[1], sections: columns[0] }, { flex: THREE[2], sections: columns[2] }]
    : [{ flex: THREE[0], sections: columns[0] }, { flex: THREE[1], sections: columns[1] }, { flex: THREE[2], sections: columns[2] }];

  return (
    <View testID="columns" {...webData({ columns: "3" })} style={{ flexDirection: "row", gap: space[8], alignItems: "flex-start", maxWidth: misc.contentMax, width: "100%" }}>
      {tracks.map((t, i) => (
        <View key={i} style={{ flex: t.flex, gap: space[3] }}>
          {t.sections.map((s) => (
            <View key={s.id}>{s.render()}</View>
          ))}
        </View>
      ))}
    </View>
  );
}
