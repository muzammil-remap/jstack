/**
 * Habits — Life's habit card (LF-02, LH-05).
 *
 * It was nine labelled chips that said whether you had done each thing TODAY,
 * which is the half of the question a habit tracker is not for. Josh: "Current
 * 'week' view is not great, doesn't show hits and misses clearly." So each
 * habit is now a row — its name, its last six days as cells, and today's cell
 * as the toggle — and "trends" opens the month, year and all-time views.
 *
 * The strip reads `habitStats`, not `habitLogs`: the logs the Life composite
 * carries are TODAY's only (`handlers/life.ts`), which is all the chips ever
 * needed and six days short of what this shows. `stores/life.ts` keeps both in
 * step on a toggle, because Today's Close-the-day chips still read the logs.
 *
 * The strip is SEVEN days at every width. It was briefly made responsive, and
 * `HabitWeek` records why that was withdrawn: this card lives in one of three
 * columns and is ~380px wide however big the screen is, so a longer strip ran
 * outside it and across two other sections.
 *
 * Toggling stays exactly as it was — optimistic, undoable, queued offline
 * (UN-03, OF-03) — and the queued line still says so.
 */
import React from "react";
import { View } from "react-native";
import { LINK_SLOP, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { HabitWeek } from "@/components/life/HabitWeek";
import { QUEUED_HABIT, QUEUED_META, queuedIdsIn } from "@/data/transport/outbox";
import { useLifeStore } from "@/stores/life";
import { useSyncStore } from "@/stores/sync";
import { useTodayStore } from "@/stores/today";
import { useSessionStore } from "@/stores/session";
import { todayKey } from "@/lib/time";
import { space } from "@/theme/tokens";

export function Habits() {
  const habits = useLifeStore((s) => s.habits);
  const habitStats = useLifeStore((s) => s.habitStats);
  const loadHabitStats = useLifeStore((s) => s.loadHabitStats);
  // stable subscription, derived outside it — see LatestIn.tsx
  const queuedEntries = useSyncStore((s) => s.entriesNow);
  const queuedHabits = React.useMemo(() => queuedIdsIn(queuedEntries, QUEUED_HABIT), [queuedEntries]);
  const logHabit = useLifeStore((s) => s.logHabit);
  const composite = useTodayStore((s) => s.composite);
  const openModal = useSessionStore((s) => s.openModal);

  // the server's own "today" (composite.todayDate) — the same key CloseDay.tsx
  // and Glance.tsx use, so a toggle here or there always agrees (A-22).
  const today = composite?.todayDate ?? todayKey();

  React.useEffect(() => {
    // the strip is seven days, and the Life composite carries one
    void loadHabitStats("week");
  }, [loadHabitStats]);

  return (
    <Section
      testID="life-habits-section"
      sectionId="habits"
      title={"Habits"}
      right={
        // the gap is `2 * LINK_SLOP` for the reason `SectionHeaderRight` sets
        // out at length (B-49): two `Txt onPress` links closer than that have
        // overlapping BOXES and the later one eats the earlier
        <View style={{ flexDirection: "row", gap: 2 * LINK_SLOP }}>
          <Txt testID="habits-edit" onPress={() => openModal("habit-edit")} kind="meta" tone="accentInk">
            edit
          </Txt>
          <Txt testID="habits-trends" onPress={() => openModal("trends")} kind="meta" tone="accentInk">
            trends
          </Txt>
        </View>
      }
    >
      {/* LH1-09 (P-9): `ListCard` rows with the card's own hairlines — every
          other card in this column separates its rows, and this one drew
          nine rows with none between them. */}
      <ListCard style={{ marginTop: 8 }}>
        {habits.map((h, i) => {
          const row = habitStats?.habits.find((r) => r.id === h.id);
          return (
            <Row key={h.id} testID={`life-habit-row-${h.id}`} last={i === habits.length - 1} style={{ alignItems: "center", gap: space[2] }}>
              <Txt style={{ flex: 1 }}>{h.name}</Txt>
              {row != null && <HabitWeek row={row} testID={`life-week-${h.id}`} onToggle={(next) => void logHabit(h.id, today, next)} />}
            </Row>
          );
        })}
        {/* O-2/OF-03: the cell already fills locally, which is right — the
            person did the thing. What was missing is that it has not reached
            the server yet, and silence about that is the failure the outbox
            exists to prevent. */}
        {queuedHabits.size > 0 && <Meta testID="habits-queued">{QUEUED_META}</Meta>}
      </ListCard>
    </Section>
  );
}
