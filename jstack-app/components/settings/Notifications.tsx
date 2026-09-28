/**
 * Notifications — Settings' notification matrix (SE-02/SE-03, RP-04): ten groups
 * × 4 devices, each cell a `<Switch>`; the Security group is locked
 * server-side (423) and toasts instead of flipping; the quiet-hours
 * footer line is built from `GET /settings/quiet-hours`, not a fixed
 * string (LF-06-style, this row's own equivalent of A-28).
 */
import React from "react";
import { Text, View } from "react-native";
import { Card, Label, Meta, Switch, Txt } from "@/theme/ui";
import { pushState, subscribePush, unsubscribePush, updatePushGroups, type PushState } from "@/lib/push";
import { useSettingsStore } from "@/stores/settings";
import { bp, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { useLayout } from "@/theme/useLayout";
import type { NotificationGroup } from "@/data/types";

/** wider than the 40px switch itself: at exactly 40 the four toggles butted
 * into each other and the device columns read as one continuous grey bar at
 * 393 (ux-review R2-01). handoff.md's own grid is `repeat(4, 42px)`.
 *
 * ST-01 widened it to hold "Telegram" without clipping — the grid only renders
 * at tablet and up now, where there is room for it. The first cut at 62 was
 * still four pixels short of the word in caps, which is how it came to break
 * mid-word; the heading is sentence case now AND the column is wider, because
 * a column sized to exactly its longest word is a column that breaks the day
 * somebody adds a device. */
const COL_WIDTH = 68;

/**
 * ST-01: the devices, by their names. They were "iPh" and "TG" — abbreviations
 * that saved four characters and cost the reader the answer to "which of my
 * things is this?". A column heading nobody can expand is a column heading
 * nobody trusts, and this is the panel where getting it wrong means a
 * notification arriving somewhere Josh is not.
 *
 * The full names do not fit four 46px columns, which is why they were
 * abbreviated in the first place — so under `bp.tablet` the grid becomes one
 * labelled row per group with four NAMED switches, and above it the columns
 * widen to hold the longest word.
 */
const COLUMNS: { key: keyof NotificationGroup["devices"]; label: string }[] = [
  { key: "iphone", label: "iPhone" },
  { key: "ipad", label: "iPad" },
  { key: "pc", label: "PC" },
  { key: "telegram", label: "Telegram" },
];

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

/** Every state the switch can be in, as a sentence. */
const PUSH_COPY: Record<PushState, string> = {
  unsupported: "this browser cannot do push notifications",
  unavailable: "push needs the backend — no push service is configured yet",
  denied: "blocked in your browser settings — JSTACK cannot ask again",
  off: "off · turn on to be told about the things you asked for",
  on: "on · the groups ticked above",
};

export function Notifications() {
  const c = useTokens();
  // ST-01: the four-column grid needs room for the longest device name; below
  // the tablet breakpoint each group becomes a labelled row instead
  const { width } = useLayout();
  const wide = width >= bp.tablet;
  const groups = useSettingsStore((s) => s.notificationGroups);
  const capabilities = useSettingsStore((s) => s.capabilities);
  // the id the server knows this device by (R-07): revoke and DELETE match on it
  const thisDevice = useSettingsStore((s) => s.devices.find((d) => d.current)?.id ?? "this-device");
  const [push, setPush] = React.useState<PushState>("off");

  React.useEffect(() => {
    void pushState(capabilities?.pushPublicKey).then(setPush);
  }, [capabilities?.pushPublicKey]);

  /** the groups with any device ticked — what this device's subscription carries */
  const wantedGroups = (list: NotificationGroup[]) => list.filter((g) => Object.values(g.devices).some(Boolean)).map((g) => g.id);

  const togglePush = async (next: boolean) => {
    if (!next) {
      setPush(await unsubscribePush(thisDevice));
      return;
    }
    setPush(await subscribePush(capabilities?.pushPublicKey, wantedGroups(groups), thisDevice));
  };
  const quietHours = useSettingsStore((s) => s.quietHours);
  const putNotificationGroup = useSettingsStore((s) => s.putNotificationGroup);
  /** PU-03: a group toggled while push is on re-posts the subscription with the new list */
  const toggleGroup = async (g: NotificationGroup, devices: NotificationGroup["devices"]) => {
    // a refused save (A4R6-11) changed nothing, so there is nothing to re-post
    if (!(await putNotificationGroup(g.id, devices)) || push !== "on") return;
    await updatePushGroups(wantedGroups(useSettingsStore.getState().notificationGroups), thisDevice).catch(() => undefined);
  };

  return (
    <View testID="settings-notifications">
      <Label>Notifications</Label>
      <Card testID="settings-notifications-card" style={{ marginTop: 8 }}>
        {/* ST-01: a grid needs a heading row, and a heading row needs room for
            the longest word in it. Above `bp.tablet` there is room; below it
            each group becomes a labelled row of four NAMED switches, which is
            more vertical space and the only arrangement in which a person can
            tell which switch is the iPad's. */}
        {wide && (
          <View style={{ flexDirection: "row", paddingVertical: 4 }}>
            <Text style={{ flex: 1 }} />
            {COLUMNS.map((col) => (
              // `Meta`, not `Txt kind="label"`. Three faults in one token: the
              // label kind UPPERCASES, so the same four words read `iPhone` at
              // 393 and `IPHONE` at every desktop width — one control, two
              // casings (ST1-03); the caps are what pushed `TELEGRAM` past the
              // column and broke it mid-word to `TELEGRA / M` in six frames
              // (ST1-02); and the label kind is Accent ink, which in this app
              // means "you can tap this" and these are headings (ST1-04).
              <Meta key={col.key} style={{ width: COL_WIDTH, textAlign: "center" }}>
                {col.label}
              </Meta>
            ))}
          </View>
        )}
        {groups.map((g, i) => (
          <View
            key={g.id}
            testID={`notif-row-${g.id}`}
            style={{
              flexDirection: wide ? "row" : "column",
              alignItems: wide ? "center" : "stretch",
              gap: wide ? 0 : 6,
              paddingVertical: 9,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: c.hairline,
            }}
          >
            <View style={{ flex: wide ? 1 : undefined }}>
              <Txt>{g.name}</Txt>
              <Meta>{g.meta}</Meta>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: wide ? 0 : space[3] }}>
              {COLUMNS.map((col) => (
                <View
                  key={col.key}
                  style={wide ? { width: COL_WIDTH, alignItems: "center" } : { flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {!wide && <Meta>{col.label}</Meta>}
                  <Switch
                    testID={`notif-${g.id}-${col.key}`}
                    accessibilityLabel={`${g.name} · ${col.label}`}
                    value={g.devices[col.key]}
                    onValueChange={(v) => void toggleGroup(g, { ...g.devices, [col.key]: v })}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

      {/* U-1 / SE-02: the ONE place the permission prompt is asked, and only
          when the person turns it on. A prompt that arrives unprompted gets
          denied, and a denied notification permission is close to permanent —
          the browser stops asking and the way back is through settings nobody
          finds. Every state below is a sentence, because a switch that flips
          back with no explanation is worse than one that does not move.
          A row OF the card, under the ten groups with the same hairline
          (README Components, Settings sheet: "section label above each card,
          rows … with hairlines"): loose on the sheet ground it read as a row
          that had fallen out of the card above it (ux-review R3-05). */}
      <View testID="push-row" style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: c.hairline }}>
        <View style={{ flex: 1 }}>
          <Txt>Push to this device</Txt>
          <Meta testID="push-state">{PUSH_COPY[push]}</Meta>
        </View>
        {/* No switch at all when it cannot work. A control that moves and
            changes nothing is worse than its absence, and the NC-01 sweep
            counts one as a dead control — the sentence beside it is the
            honest answer. */}
        {push === "off" || push === "on" ? (
          <Switch
            testID="push-switch"
            accessibilityLabel="Push to this device"
            value={push === "on"}
            onValueChange={(next: boolean) => void togglePush(next)}
          />
        ) : null}
      </View>
      </Card>
      {quietHours != null && (
        <Meta style={{ marginTop: space[2] }}>
          Quiet hours, {to12h(quietHours.start)} to {to12h(quietHours.end)}, apply to all but security.
        </Meta>
      )}
    </View>
  );
}
