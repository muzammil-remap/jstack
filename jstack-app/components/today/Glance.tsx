/**
 * Glance — Today's "At a glance" (TD-06): four cells (Habits, People,
 * Money, Goals); the habits count reads stores/life.ts directly (LF-02:
 * shares state with Life's own Habits card, no round-trip needed after a
 * Close-the-day toggle); each cell switches to the Life tab.
 */
import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Card, Meta, Section, Txt } from "@/theme/ui";
import { touchSlop } from "@/lib/webData";
import { useLifeStore } from "@/stores/life";
import { useTodayStore } from "@/stores/today";
import { space } from "@/theme/tokens";

export function Glance() {
  const router = useRouter();
  const composite = useTodayStore((s) => s.composite);
  const habits = useLifeStore((s) => s.habits);
  const habitLogs = useLifeStore((s) => s.habitLogs);
  const glance = composite?.glance;

  // the server's own "today" (composite.todayDate), not the browser's
  // clock — keeps this in step with the fixture's anchored day even if
  // the session spans real midnight (BUGLOG_v2.md A-22). NOT dateLabel:
  // that is the human-written subtitle, "4 September" (B-55).
  const today = composite?.todayDate;
  const doneToday = today == null ? 0 : habitLogs.filter((l) => l.date === today && l.done).length;
  // AUDIT_v2.md A-06 — every cell reads "—" until its own data is in, the way
  // Money already did. `?? 0` renders a NUMBER the app has not loaded: for the
  // first frame after a reload this card told the owner "Habits 0/0 · People 0
  // · Goals 0" — nobody needs a nudge, no goals, no habits to do — before
  // flipping to 4/9 · 4 · 1. That is B-63's rule ("a default that looks like
  // data is a lie the owner will believe") on the first card of the first tab.
  const EMPTY = "—";
  const cells: { label: string; value: string }[] = [
    { label: "Habits", value: habits.length === 0 ? EMPTY : `${doneToday}/${habits.length}` },
    { label: "People", value: glance == null ? EMPTY : String(glance.people) },
    { label: "Money", value: glance?.money ?? EMPTY },
    { label: "Goals", value: glance == null ? EMPTY : String(glance.goals) },
  ];

  return (
    <Section testID="glance" style={{ gap: 8 }} sectionId="glance" title={"At a glance"} labelTestID="glance-label">
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[3] }}>
          {cells.map((cell) => (
            <Pressable
              key={cell.label}
              testID={`glance-${cell.label.toLowerCase()}`}
              accessibilityRole="button"
              accessibilityLabel={`${cell.label}: ${cell.value}`}
              onPress={() => router.navigate("/life")}
              {...touchSlop(4, { glance: "1" })}
              // GL-05: a real 36px target, not a padded one — these cells have no
              // fixed height, so minHeight simply works (AUDIT_v2.md AAA-02)
              style={{ minHeight: 36, justifyContent: "center", flexBasis: "47%", flexGrow: 1, minWidth: 90 }}
            >
              <Meta>{cell.label}</Meta>
              <Txt kind="statSm">{cell.value}</Txt>
            </Pressable>
          ))}
        </View>
      </Card>
    </Section>
  );
}
