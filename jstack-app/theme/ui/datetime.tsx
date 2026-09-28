/**
 * `DateTimeField` — a start or an end, picked in place (T-1, ADR-42, TK-03).
 *
 * The task card had no editing at all: a start and an end existed only as the
 * Gantt's read-only pair. This is the control that gives them to a person, and
 * it is built from parts that already exist — `lib/time.ts`'s month grid, the
 * pack's chips and rows — because a date picker is where a dependency usually
 * gets added, and the rule against new dependencies is the reason this build
 * has one design system rather than three.
 *
 * **In place, not in a dialog.** It expands under its own chip inside the card
 * it belongs to. A root-mounted Dialog (`layout/dialogs.tsx`) is for something
 * a person OPENED; a field that must send its answer back through the session
 * store to reach the row that asked for it is plumbing standing in for a
 * control. Nothing here traps focus or covers the screen, so nothing here is
 * a dialog.
 *
 * **Choosing a day fills a time.** A day with no time yet takes `defaultTime`
 * — 9:00am for a start, 5:00pm for an end — because "Thursday" almost always
 * means the working day, and a picker that demands two taps for the common
 * case is a picker people avoid. The time list is there for the other case.
 *
 * `min` greys the days before it: an end before its start is refused by the
 * server (`422`), and a control that can only produce legal values is kinder
 * than an error message.
 */
import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { addMonths, atTime, dayKey, formatShort, formatWhen, hourOfDay, monthCaption, monthGrid, todayKey } from "@/lib/time";
import { radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { Card } from "./surfaces";
import { Meta, Txt } from "./text";

const WEEKDAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];

/** 6:00am to 10:00pm in quarter hours — the window a working day fits in. */
function quarterHours(): { key: string; hour: number; minute: number }[] {
  const out: { key: string; hour: number; minute: number }[] = [];
  for (let hour = 6; hour <= 22; hour++) {
    for (const minute of [0, 15, 30, 45]) {
      if (hour === 22 && minute > 0) break;
      out.push({ key: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, hour, minute });
    }
  }
  return out;
}

const TIMES = quarterHours();

export function DateTimeField({
  value,
  onChange,
  defaultTime,
  min,
  label,
  testID,
  dateOnly = false,
}: {
  /** an ISO instant, or undefined for "not set" */
  value?: string;
  onChange: (iso: string | undefined) => void;
  defaultTime: "09:00" | "17:00";
  /** the earliest allowed instant — days before it cannot be chosen */
  min?: string;
  /** what the chip says when there is no value ("Add start") */
  label: string;
  testID: string;
  /** F-1: a RANGE bound is a day, not an instant. The time list and the
   * "a day on its own means 9:00am" hint go, and picking a day closes the
   * panel — there is nothing else to choose. */
  dateOnly?: boolean;
}) {
  const c = useTokens();
  const [open, setOpen] = useState(false);
  const chosenKey = value != null ? dayKey(new Date(value)) : undefined;
  const [anchor, setAnchor] = useState(() => chosenKey ?? todayKey());
  const minKey = min != null ? dayKey(new Date(min)) : undefined;
  const defaultHour = Number(defaultTime.slice(0, 2));

  const pickDay = (key: string) => {
    // keep the time already chosen; otherwise the working-day default
    const frac = value != null ? hourOfDay(value) : defaultHour;
    onChange(atTime(key, Math.floor(frac), Math.round((frac % 1) * 60)).toISOString());
    if (dateOnly) setOpen(false);
  };

  const pickTime = (hour: number, minute: number) => {
    onChange(atTime(chosenKey ?? todayKey(), hour, minute).toISOString());
    setOpen(false);
  };

  return (
    <View style={{ gap: space[2] }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={value != null ? `${label}: ${formatWhen(value)}` : label}
        onPress={() => setOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space[2],
          minHeight: 36,
          paddingHorizontal: space[3],
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: c.hairline,
        }}
      >
        {/* no icon: the pack's set has no calendar glyph, and a borrowed one
            ("edit", "explore") would say something the chip does not mean.
            The words carry it — "Add start" is unambiguous. */}
        <Txt kind="small" style={{ color: value != null ? c.ink : c.muted }}>{value != null ? (dateOnly ? formatShort(dayKey(new Date(value))) : formatWhen(value)) : label}</Txt>
      </Pressable>

      {open && (
        <Card testID={`${testID}-panel`} style={{ gap: space[2] }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Pressable testID={`${testID}-prev`} accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => setAnchor(addMonths(anchor, -1))} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <Icon name="chevron_left" size={16} color={c.muted} />
            </Pressable>
            <Txt kind="small">{monthCaption(anchor)}</Txt>
            <Pressable testID={`${testID}-next`} accessibilityRole="button" accessibilityLabel="Next month" onPress={() => setAnchor(addMonths(anchor, 1))} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
              <Icon name="chevron_right" size={16} color={c.muted} />
            </Pressable>
          </View>

          <View style={{ flexDirection: "row" }}>
            {WEEKDAY_HEADS.map((d, i) => (
              <Meta key={i} style={{ width: `${100 / 7}%`, textAlign: "center" }}>{d}</Meta>
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {monthGrid(anchor).map((key) => {
              const inMonth = key.slice(0, 7) === anchor.slice(0, 7);
              const tooEarly = minKey != null && key < minKey;
              const chosen = key === chosenKey;
              return (
                <Pressable
                  key={key}
                  testID={`${testID}-day-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={key}
                  aria-disabled={tooEarly}
                  onPress={tooEarly ? undefined : () => pickDay(key)}
                  style={{ width: `${100 / 7}%`, height: 36, alignItems: "center", justifyContent: "center" }}
                >
                  <Txt
                    kind="small"
                    style={{
                      color: tooEarly ? c.hairline : chosen ? c.accentInk : inMonth ? c.ink : c.muted,
                      // the chosen day is the only thing here that carries weight —
                      // at 500, not 600. "Nothing is 600 except the JSTACK
                      // wordmark" (README Type), and `tokens.ts` reserves
                      // `wordmark: 600` for it (A4R2-10). The chosen day is
                      // already carried by Accent ink and its fill; the weight
                      // is the second signal, not the only one.
                      fontWeight: chosen ? "500" : undefined,
                    }}
                  >
                    {Number(key.slice(8, 10))}
                  </Txt>
                </Pressable>
              );
            })}
          </View>

          {!dateOnly && <Meta>{value != null ? "Tap a time, or leave it as it is" : `A day on its own means ${defaultTime === "09:00" ? "9:00am" : "5:00pm"}`}</Meta>}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[1] }}>
            {(dateOnly ? [] : TIMES).map((t) => (
              <Pressable
                key={t.key}
                testID={`${testID}-time-${t.key}`}
                accessibilityRole="button"
                accessibilityLabel={t.key}
                onPress={() => pickTime(t.hour, t.minute)}
                style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: space[2], borderRadius: radius.control, borderWidth: 1, borderColor: c.hairline }}
              >
                <Txt kind="small">{t.key}</Txt>
              </Pressable>
            ))}
          </View>

          {value != null && (
            <Pressable testID={`${testID}-clear`} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => { onChange(undefined); setOpen(false); }} style={{ minHeight: 36, justifyContent: "center" }}>
              <Txt kind="small" tone="accentInk">Clear</Txt>
            </Pressable>
          )}
        </Card>
      )}
    </View>
  );
}
