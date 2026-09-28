/**
 * NeedsYou — Today's "Needs you" section (DC-01, DC-10): exactly one
 * decision card open (the first undecided, or the one tapped), the rest
 * as waiting rows, an end line, and a "history" link opening the history
 * dialog (mock v11 `today()` lines 451-457).
 *
 * WPS-1 (v2.3.2): outside the windows Settings › Schedules gives Needs you,
 * the cards wait — the label keeps the count, and one line says how many
 * wait and when they come, in place of the card, the rows and the end line.
 */
import { touchSlop, webHitArea } from "@/lib/webData";
import { NEEDS_YOU_SECTION } from "@/lib/cardVerbs";
import React, { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { DecisionCard } from "@/components/today/DecisionCard";
import { WaitingRow } from "@/components/today/WaitingRow";
import { labelColumnFor } from "@/lib/labelColumn";
import { needsYouHold } from "@/lib/needsYouSchedule";
import { formatTime12, now } from "@/lib/time";
import { LINK_SLOP, ListCard, Section, Txt } from "@/theme/ui";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useTodayStore } from "@/stores/today";
import { space } from "@/theme/tokens";

export function NeedsYou() {
  const composite = useTodayStore((s) => s.composite);
  const openDecisionId = useTodayStore((s) => s.openDecisionId);
  const openModal = useSessionStore((s) => s.openModal);
  const quietHours = useSettingsStore((s) => s.quietHours);
  // WPS-1: the schedule is read at render and again at its next edge, so a
  // Today left open raises the cards when a window opens and holds them when
  // it closes (`lib/needsYouSchedule.ts`)
  const [, setEdge] = useState(0);
  const hold = needsYouHold(quietHours, now());
  const changesAt = hold.changesAt?.getTime() ?? null;
  useEffect(() => {
    if (changesAt == null) return;
    const timer = setTimeout(() => setEdge((n) => n + 1), Math.max(changesAt - now().getTime(), 0) + 1000);
    return () => clearTimeout(timer);
  }, [changesAt]);

  const open = composite?.needsYou ?? [];
  const nextAt = hold.held && open.length > 0 ? hold.nextAt : null;
  const current = open.find((card) => card.id === openDecisionId) ?? open[0];
  const waiting = open.filter((card) => card.id !== current?.id);
  // UX-H / C-5: one column for the rows that are actually here, rather than a
  // fixed width sized for the longest type the catalogue could ever produce.
  // The list owns it because a column is a property of the LIST — sized per
  // row it would be a ragged edge, which is what the pack's fixed width avoids.
  const labelWidth = labelColumnFor(waiting.map((card) => card.type));

  return (
    /* R6-03: `right`, not `hint`. Nine section-label links in this app
       sit flush at the column edge in Accent ink; these two were the
       only ones using the `hint` slot, which is Muted and hugs the
       label — the word "all" appeared twice at 11px doing the same job,
       in two different colours and two different places. Accent ink is
       the pack's own rule: "Colour means you can act." */
    <Section
      testID="needs-you"
      style={{ gap: space[3] }}
      sectionId={NEEDS_YOU_SECTION}
      title="Needs you"
      labelTestID="needs-you-label"
      badge={open.length}
      right={
        <Pressable testID="needs-you-history" accessibilityRole="link" accessibilityLabel="Decision history" {...touchSlop(LINK_SLOP)} style={webHitArea(LINK_SLOP)} onPress={() => openModal("history")}>
          <Txt kind="small" tone="accentInk">history</Txt>
        </Pressable>
      }
    >
      {nextAt != null ? (
        <Txt testID="needs-you-held" kind="small" style={{ paddingHorizontal: 2 }}>
          {`${open.length} waiting · next at ${formatTime12(nextAt)}`}
        </Txt>
      ) : (
        <>
          {current != null && <DecisionCard card={current} />}

          {waiting.length > 0 && (
            <ListCard testID="needs-you-waiting">
              {waiting.map((card, i) => (
                <WaitingRow key={card.id} card={card} last={i === waiting.length - 1} labelWidth={labelWidth} />
              ))}
            </ListCard>
          )}

          <Txt testID="needs-you-endline" kind="small" style={{ paddingHorizontal: 2 }}>
            {composite?.endLine ?? ""}
          </Txt>
        </>
      )}
    </Section>
  );
}
