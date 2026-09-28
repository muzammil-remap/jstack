/**
 * Goals — Life's "Goals" card (LF-01): area at 500 weight, the status line
 * under it, "behind" rendered in accent ink. Filtered by focus server-side
 * (`load(focus)`, already wired).
 *
 * LG-1 gave the heading its two controls and the row its composed line. The
 * line used to be a sentence the SERVER wrote and this printed verbatim —
 * "behind · 2 this week" — which meant the card could not say what 2 was out
 * of, could not render its date in the reader's zone, and could not differ
 * from the search snippet even where it should. `lib/goalMeta.ts` composes it
 * now, from the enum and the KPI the wire carries (hard rules 16, 19, 21).
 *
 * TWO LINKS IN THE HEADING, and the gap between them is `2 * LINK_SLOP` for
 * the reason `layout/SectionHeaderRight.tsx` sets out at length (B-49): a
 * `Txt onPress` carries 14px of padding with -14px of margin, so two links
 * eight pixels apart have BOXES that overlap by twenty and the later one in
 * the DOM eats the earlier. Written as the expression rather than as 28 so a
 * change to `LINK_SLOP` cannot put it back.
 */
import React from "react";
import { View } from "react-native";
import { LINK_SLOP, ListCard, Meta, Row, Section, Strong, Txt } from "@/theme/ui";
import { useLifeStore } from "@/stores/life";
import { goalMetaLine, goalStatusTone } from "@/lib/goalMeta";
import { useTokens } from "@/theme/ThemeProvider";
import { useSessionStore } from "@/stores/session";

export function Goals() {
  const c = useTokens();
  const goals = useLifeStore((s) => s.goals);
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <Section
      testID="life-goals-section"
      sectionId="goals"
      title={"Goals"}
      right={
        <View style={{ flexDirection: "row", gap: 2 * LINK_SLOP }}>
          <Txt testID="goals-edit" onPress={() => openModal("goal-edit")} kind="meta" tone="accentInk">
            edit
          </Txt>
          <Txt testID="goals-all" onPress={() => openModal("goals-all")} kind="meta" tone="accentInk">
            all
          </Txt>
        </View>
      }
    >
      <ListCard style={{ marginTop: 8 }}>
        {goals.map((g, i) => (
          <Row key={g.id} testID={`goal-${g.id}`} last={i === goals.length - 1} onPress={() => openModal("goal", g.id)}>
            <View style={{ flex: 1 }}>
              <Txt>
                <Strong>{g.area}: </Strong>
                {g.text}
              </Txt>
              <Meta testID={`goal-meta-${g.id}`} style={goalStatusTone(g.status) === "behind" ? { color: c.accentInk } : undefined}>
                {goalMetaLine(g)}
              </Meta>
            </View>
          </Row>
        ))}
      </ListCard>
    </Section>
  );
}
