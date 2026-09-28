/**
 * RangeDialog — the presets behind the range chip (F-1, TF-02, ADR-44).
 *
 * The range is the one filter that is always on, so it is the one that must be
 * changeable from where it is shown: the chip is the control and this is what
 * it opens. Root-mounted like every other overlay (`layout/dialogs.tsx`,
 * B-14) — never rendered inline inside the scrolled section it belongs to.
 *
 * Done offers a different set, and that is not a special case bolted on: a
 * forward window over COMPLETIONS is a window over things that have not
 * happened, so "Next 90 days" on Done would always be empty (resolution #3).
 * It offers All, This week, Last N and Custom.
 *
 * Choosing a preset applies it and closes. Custom stays open, because two
 * dates are two decisions and closing after the first would lose the second.
 */
import React, { useState } from "react";
import { View } from "react-native";
import { Btn, Chip, DateTimeField, Label, Meta } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { currentParameter } from "@/stores/parameters";
import { dayKey, todayKey } from "@/lib/time";
import { rangeLabel, type RangePreset, type TaskRange } from "@/data/taskFilters";
import { space } from "@/theme/tokens";
import { useTasksStore } from "@/stores/tasks";

/** the presets each view class offers, in the order they are shown. `default`
 * is not one of them: it is what the range IS until somebody chooses, and a
 * chip labelled "Default" would say nothing about what is on the screen. */
const OPEN_PRESETS: RangePreset[] = ["thisWeek", "next", "last", "all", "custom"];
const DONE_PRESETS: RangePreset[] = ["all", "thisWeek", "last", "custom"];

export function RangeDialog({ onClose }: { onClose: () => void }) {
  const view = useTasksStore((s) => s.view);
  const range = useTasksStore((s) => s.filters.range);
  const setRange = useTasksStore((s) => s.setRange);
  const days = currentParameter("tasks.rangeDays") as number;
  const [draft, setDraft] = useState<TaskRange>(range);

  const presets = view === "done" ? DONE_PRESETS : OPEN_PRESETS;
  const custom = draft.preset === "custom";
  // an ISO instant is what `DateTimeField` speaks; a range bound is a day key
  const asIso = (key: string | undefined) => (key == null ? undefined : `${key}T09:00:00.000Z`);

  const choose = (preset: RangePreset) => {
    if (preset === "custom") {
      setDraft({ preset: "custom", from: draft.from, to: draft.to });
      return;
    }
    void setRange({ preset });
    onClose();
  };

  return (
    <Dialog testID="range-dialog" title="Range" onClose={onClose}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
        {presets.map((preset) => (
          <Chip
            key={preset}
            testID={`range-preset-${preset}`}
            label={rangeLabel({ preset }, view, days, todayKey())}
            selected={draft.preset === preset}
            onPress={() => choose(preset)}
          />
        ))}
      </View>

      {custom && (
        <View testID="range-custom" style={{ gap: space[3], marginTop: space[5] }}>
          <Label>From and to</Label>
          <DateTimeField
            testID="range-from"
            label="From"
            dateOnly
            defaultTime="09:00"
            value={asIso(draft.from)}
            onChange={(iso) => setDraft((d) => ({ ...d, from: iso == null ? undefined : dayKey(new Date(iso)) }))}
          />
          <DateTimeField
            testID="range-to"
            label="To"
            dateOnly
            defaultTime="17:00"
            min={asIso(draft.from)}
            value={asIso(draft.to)}
            onChange={(iso) => setDraft((d) => ({ ...d, to: iso == null ? undefined : dayKey(new Date(iso)) }))}
          />
          <Meta>Either end on its own is a half-open window: everything from a date, or everything until one.</Meta>
          <Btn
            testID="range-apply"
            label="Apply"
            onPress={() => {
              void setRange(draft);
              onClose();
            }}
          />
        </View>
      )}
    </Dialog>
  );
}
