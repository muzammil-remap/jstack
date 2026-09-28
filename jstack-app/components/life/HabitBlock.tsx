/**
 * HabitBlock (LH1-04) — one habit's block inside the Trends dialog, on a card.
 *
 * The first cut rendered the nine blocks straight onto the dialog sheet, and
 * the ux round measured what that costs: the accent step against a sheet is
 * 3.13:1 where against a card it is ~3.9:1, nothing bounds a habit so its count
 * caption floated 635px from the grid it counts, and the empty tail of a month
 * had no container to sit inside so it read as a rendering fault rather than as
 * space. Every other dialog in the app — Find, the task card — puts its content
 * on cards; this was the one that did not.
 *
 * The habit's NAME is the card's TITLE — `Txt kind="title"`, Source Serif 4 at
 * 500 — with the count as a muted hint beside it. It was a `Label` first, which
 * is the section-heading token: the pack's rule is "never place a section label
 * over a card", and it left twenty-seven cards with no serif in them (LH2-09).
 * It was neither a title nor a label before that (LH1-11).
 *
 * ONE OR MORE ACROSS (LH1-05). The grids are intrinsically sized — a month is
 * seven columns of 26px whatever the screen — so on a wide dialog they sat in a
 * 203px stripe inside 861px of sheet. `HabitBlockGrid` lays the cards out
 * instead of stretching them: the card fills, the grid does not stretch, and
 * 1920 stops reading as one phone column with a lot of margin.
 */
import React from "react";
import { View } from "react-native";
import { Card, Txt } from "@/theme/ui";
import { bp, space } from "@/theme/tokens";
import { useLayout } from "@/theme/useLayout";

export function HabitBlock({
  title,
  hint,
  testID,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  testID?: string;
  children: React.ReactNode;
}) {
  return (
    <Card testID={testID} style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space[2] }}>
        <Txt kind="title">{title}</Txt>
        {hint}
      </View>
      {children}
    </Card>
  );
}

/** How many blocks sit side by side. The same three tiers the strip uses, for
 * the same reason: a dialog on a desktop is not a phone with margins. */
export function HabitBlockGrid({ children }: { children: React.ReactNode }) {
  const { width } = useLayout();
  const columns = width >= 1180 ? 3 : width >= bp.tablet ? 2 : 1;
  const items = React.Children.toArray(children);

  if (columns === 1) return <View style={{ gap: space[3] }}>{items}</View>;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
      {items.map((child, i) => (
        // `flexBasis` rather than a measured width: the gap is the parent's and
        // the card should absorb whatever is left, which is what makes this
        // hold at 1024 and at 1920 without a second breakpoint
        // `flexGrow: 0`: a last card with no neighbour used to stretch across
        // both columns at 1024 — twice its siblings' width, which the pack
        // refuses ("do not stretch cards to match heights", and the same for
        // widths). It takes its share and leaves the gap.
        <View key={i} style={{ flexGrow: 0, flexBasis: `${100 / columns - 2}%`, minWidth: 260 }}>
          {child}
        </View>
      ))}
    </View>
  );
}
