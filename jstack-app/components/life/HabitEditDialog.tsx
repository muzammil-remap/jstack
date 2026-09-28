/**
 * HabitEditDialog — the habits are a set Josh edits (LH-2, LH-06, LH-07).
 *
 * A config over `ChipSetEditDialog`, the fourth after focuses, slicers and
 * goals. What it adds to that component is general and stays there: a removal
 * that is not a deletion, reordering, and a slot at the top of the add form.
 *
 * ARCHIVE, NOT DELETE, AND THE SERVER ENFORCES IT. Josh's words: "when I delete
 * a habit from my current tracking list, the data must be retained. Adding in a
 * new habit, the deleted ones should show up as an option to give me the
 * ability to restore with it's data if I want it back." So the destructive link
 * says "archive", it sets a field rather than shortening the list, and
 * `PUT /habits` refuses a list with a habit missing from it — the promise is
 * kept by the route and not by the dialog remembering to.
 *
 * "ADD HABIT" OFFERS THE ARCHIVED ONES FIRST, each with how much history is
 * waiting for it. The number is the days that habit has ever been logged, read
 * off `GET /habits/stats?period=all` — the same figure the all-time view shows,
 * so the promise and the page cannot disagree.
 */
import React, { useEffect } from "react";
import { View } from "react-native";
import { ChipSetEditDialog, type ChipSetField } from "@/components/settings/ChipSetEditDialog";
import { ListCard, Meta, Row, Txt } from "@/theme/ui";
import { useLifeStore } from "@/stores/life";
import { useLifeEditsStore } from "@/stores/lifeEdits";
import { useSessionStore } from "@/stores/session";
import { space } from "@/theme/tokens";
import type { Habit } from "@/data/types";

const FIELDS: ChipSetField<Habit>[] = [
  {
    id: "name",
    kind: "text",
    placeholder: "Name, e.g. Stretch",
    read: (h) => h.name ?? "",
    write: (h, value) => ({ ...h, name: value as string }),
    requiredReason: "Give it a name first",
  },
];

export function HabitEditDialog({ payload, onClose }: { payload?: string; onClose: () => void }) {
  const habits = useLifeStore((s) => s.habits);
  const archived = useLifeStore((s) => s.archivedHabits);
  const habitStats = useLifeStore((s) => s.habitStats);
  const saveHabits = useLifeEditsStore((s) => s.saveHabits);
  const loadArchivedHabits = useLifeStore((s) => s.loadArchivedHabits);
  const loadHabitStats = useLifeStore((s) => s.loadHabitStats);
  const showToast = useSessionStore((s) => s.showToast);

  useEffect(() => {
    void loadArchivedHabits();
    // `all` is what carries the days-of-history number the restore line promises
    void loadHabitStats("all");
  }, [loadArchivedHabits, loadHabitStats]);

  /** how many days of history are waiting for this habit. `possible` over the
   * `all` period IS the count of days it has ever been logged. */
  const daysOf = (id: string) => habitStats?.habits.find((h) => h.id === id)?.possible ?? 0;

  // A4R5-07: the listed habits as the editor left them; `saveHabits` puts the
  // archived ones back beside them, so a second archive is not refused for
  // missing the first. A refusal is said, never dropped on the page.
  const save = (next: Habit[], said: string, then?: () => void) => {
    void saveHabits(next).then((refusal) => {
      showToast(refusal?.reason ?? said);
      if (refusal == null) then?.();
    });
  };

  return (
    <ChipSetEditDialog<Habit>
      prefix="habit"
      copy={{
        title: "Habits",
        add: "Add a habit",
        formTitle: { edit: "Edit habit", add: "Add a habit" },
        saved: { edit: "Habit saved", add: "Habit added" },
      }}
      items={habits}
      fields={FIELDS}
      payload={payload}
      removeLabel="archive"
      onRemove={(habit) => save(habits.map((h) => (h.id === habit.id ? { ...h, archived: true } : h)), `${habit.name} archived · its history is kept`)}
      onReorder={(next) => save(next, "Order saved")}
      formExtra={
        archived.length === 0 ? undefined : (
          <View style={{ marginBottom: space[4], gap: 8 }}>
            <Meta>Or bring one back</Meta>
            <ListCard testID="habit-archived">
              {archived.map((habit, i) => (
                <Row
                  key={habit.id}
                  testID={`habit-restore-${habit.id}`}
                  last={i === archived.length - 1}
                  onPress={() => {
                    save([...habits, { ...habit, archived: false }], `${habit.name} restored`);
                    onClose();
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Txt>{habit.name}</Txt>
                    <Meta testID={`habit-restore-meta-${habit.id}`}>Restore · keeps {daysOf(habit.id)} days of history</Meta>
                  </View>
                </Row>
              ))}
            </ListCard>
          </View>
        )
      }
      onClose={onClose}
      makeItem={(draft) => ({ id: `habit-${Date.now()}`, name: draft.name ?? "", sort: habits.length + 1 })}
      onSave={(next, view) => save(next, view === "edit" ? "Habit saved" : "Habit added", onClose)}
    />
  );
}
