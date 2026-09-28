/**
 * CloseDay — Today's "Close the day" (TD-07): nine compact habit chips
 * sharing stores/life.ts with Life's own Habits card (LF-02); a journal
 * field that posts to `/journal` directly (empty submissions blocked).
 * The mic button is every other voice entry point's mic (VO-01): it
 * opens the SAME global listening bar and always files to Brain, not
 * into this field — dictating a journal thought still lands as its own
 * Brain capture rather than this task's own `/journal` post.
 */
import { stopMicFor } from "@/lib/mic";
import { todayKey } from "@/lib/time";
import React, { useRef } from "react";
import { TextInput, View } from "react-native";
import { Card, Field, FieldButton, HabitChip, Section } from "@/theme/ui";
import { useLifeStore } from "@/stores/life";
import { micIsOpen, micStateLabel, useDictation } from "@/stores/mic";
import { useTodayStore } from "@/stores/today";
import { space } from "@/theme/tokens";

export function CloseDay() {
  const journalRef = useRef<TextInput | null>(null);
  const habits = useLifeStore((s) => s.habits);
  const habitLogs = useLifeStore((s) => s.habitLogs);
  const logHabit = useLifeStore((s) => s.logHabit);
  const composite = useTodayStore((s) => s.composite);
  const journalDraft = useTodayStore((s) => s.journalDraft);
  const setJournalDraft = useTodayStore((s) => s.setJournalDraft);
  const submitJournal = useTodayStore((s) => s.submitJournal);
  // V-1: the journal dictates through the one owner, with its own purpose so
  // the banner says "listening for your journal" rather than "for Brain".
  const [journalInterim, setJournalInterim] = React.useState(false);
  const mic = useDictation({
    purpose: "journal",
    onInterim: (text) => {
      setJournalInterim(true);
      setJournalDraft(text);
    },
    onFinal: (text) => {
      setJournalInterim(false);
      setJournalDraft(text);
    },
  });

  // the server's own "today" (composite.todayDate) — see Glance.tsx,
  // BUGLOG_v2.md A-22; falls back to the browser's clock only for the
  // brief window before the composite has ever loaded.
  const today = composite?.todayDate ?? todayKey();
  const doneFor = (habitId: string) => habitLogs.some((l) => l.habitId === habitId && l.date === today && l.done);

  return (
    <Section testID="close-day" style={{ gap: 8 }} sectionId="close-day" title={"Close the day"} labelTestID="close-day-label">
      <Card style={{ gap: space[4] }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
          {habits.map((h) => (
            <HabitChip
              key={h.id}
              testID={`close-habit-${h.id}`}
              label={h.name}
              done={doneFor(h.id)}
              compact
              onPress={() => void logHabit(h.id, today, !doneFor(h.id))}
            />
          ))}
        </View>
        <Field
          testID="close-journal"
          inputRef={journalRef}
          value={journalDraft}
          onChangeText={setJournalDraft}
          placeholder="How was today?"
          multiline
          interim={journalInterim}
          right={
            <>
              <FieldButton
                icon="mic"
                testID="journal-mic"
                accessibilityLabel={micIsOpen({ state: mic.state }) ? "Stop dictating" : "Dictate"}
                state={mic.state}
                label={micStateLabel(mic.state)}
                onPress={mic.toggle}
              />
              {/* D21: a bare, filled glyph with no button between two icon
                  buttons read as a rendering fault. handoff.md Today Column 3
                  names "mic and keyboard icons" as a pair; the mock makes both
                  buttons. Pressing it puts the caret in the field — the typed
                  counterpart to Dictate. */}
              <FieldButton icon="keyboard" accessibilityLabel="Type" onPress={() => journalRef.current?.focus()} />
              <FieldButton
                icon="arrow_upward"
                primary
                accessibilityLabel="Send"
                {...(journalDraft.trim() === ""
                  ? { disabledReason: "Write something first" }
                  : {
                      onPress: () => {
                        stopMicFor("journal"); // MC-07: send is an exit path (A4R11-02)
                        void submitJournal("typed");
                      },
                    })}
              />
            </>
          }
        />
      </Card>
    </Section>
  );
}
