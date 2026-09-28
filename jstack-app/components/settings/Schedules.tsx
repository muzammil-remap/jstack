/**
 * Schedules — Settings' "Schedules" card (SE-04): the seven routines and EA tasks, cadence in accent ink,
 * pause/resume flips the row (state-driven, unlike the mock's always-"pause" static link), run posts and
 * toasts. Then Needs you (WPS-1, v2.3.2): the same row — its times in accent ink, pause/resume — with its
 * windows and quiet hours under it, saved with quiet hours' record as each control changes.
 */
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { BtnSm, Card, Field, Label, Meta, Switch, Txt } from "@/theme/ui";
import { parseWindows, PAUSED_SCHEDULE, raiseTimesText, windowsText } from "@/lib/needsYouSchedule";
import { useAgentsStore } from "@/stores/agents";
import { useSettingsStore } from "@/stores/settings";
import type { QuietHours } from "@/data/types";

/**
 * WPS-1 · Needs you's entry. The row is the seven's; under it, Settings' own controls — a field for the windows,
 * as Voice's cue word is one, and a switch for quiet hours. The schedule is a field of quiet hours' record, so each
 * change saves the whole record through `putQuietHours`. The field keeps what is typed until it reads as windows,
 * so a half-typed time is never saved and never snatched back; leaving the field shows the saved ones.
 */
function NeedsYouEntry() {
  const quietHours = useSettingsStore((s) => s.quietHours);
  const putQuietHours = useSettingsStore((s) => s.putQuietHours);
  const [draft, setDraft] = useState<string | null>(null);
  if (quietHours == null) return null;
  const schedule = quietHours.needsYou ?? PAUSED_SCHEDULE;
  const save = (change: Partial<NonNullable<QuietHours["needsYou"]>>) => void putQuietHours({ ...quietHours, needsYou: { ...schedule, ...change } });

  const onWindows = (text: string) => {
    setDraft(text);
    const windows = parseWindows(text);
    if (windows != null) save({ windows });
  };

  return (
    <View testID="schedule-needs-you" style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Txt>Needs you</Txt>
          <Meta>{schedule.paused ? "the EA's cards, as they come" : "the EA's cards, at these times"}</Meta>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt kind="meta" tone="accentInk">{raiseTimesText(schedule.windows)}</Txt>
          <Txt testID="schedule-toggle-needs-you" onPress={() => save({ paused: !schedule.paused })} kind="meta" tone="accentInk">
            {schedule.paused ? "resume" : "pause"}
          </Txt>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Meta>Windows</Meta>
        <Field
          testID="needs-you-windows"
          accessibilityLabel="Needs you windows"
          value={draft ?? windowsText(schedule.windows)}
          onChangeText={onWindows}
          onBlur={() => setDraft(null)}
          style={{ flex: 1 }}
        />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Meta>Respect quiet hours</Meta>
        <Switch
          testID="needs-you-quiet-hours"
          accessibilityLabel="Needs you respects quiet hours"
          value={schedule.respectsQuietHours}
          onValueChange={(respectsQuietHours) => save({ respectsQuietHours })}
        />
      </View>
    </View>
  );
}

export function Schedules() {
  const schedules = useAgentsStore((s) => s.schedules);
  const loadSchedules = useAgentsStore((s) => s.loadSchedules);
  const pauseSchedule = useAgentsStore((s) => s.pauseSchedule);
  const resumeSchedule = useAgentsStore((s) => s.resumeSchedule);
  const runSchedule = useAgentsStore((s) => s.runSchedule);

  // the store short-circuits once it has them (F-65, P-10)
  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  return (
    <View testID="settings-schedules">
      <Label>Schedules</Label>
      <Card style={{ marginTop: 8, gap: 8 }}>
        {schedules.map((sc) => (
          <View key={sc.id} testID={`schedule-${sc.id}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Txt>{sc.name}</Txt>
              <Meta>{sc.meta}</Meta>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Txt kind="meta" tone="accentInk">{sc.cadence}</Txt>
              <Txt testID={`schedule-toggle-${sc.id}`} onPress={() => void (sc.paused ? resumeSchedule(sc.id) : pauseSchedule(sc.id))} kind="meta" tone="accentInk">
                {sc.paused ? "resume" : "pause"}
              </Txt>
              <BtnSm testID={`schedule-run-${sc.id}`} label="run" onPress={() => void runSchedule(sc.id)} />
            </View>
          </View>
        ))}
        <NeedsYouEntry />
      </Card>
    </View>
  );
}
