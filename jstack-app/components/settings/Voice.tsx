/**
 * Voice — Settings' "Voice" card (SE-06): Style and Speed pickers, and
 * "Read the brief" switch. The mock's own Style/Speed controls are
 * non-functional placeholder buttons (`data-act="ext"` → a generic
 * toast) with no option set enumerated anywhere — SE-06 requires real
 * persistence, so this uses a small sourced-but-invented option set
 * (A-35) via the same `<Seg>` control Autonomy uses.
 *
 * V-2 adds the four ADR-24 settings, and each is here rather than
 * hard-coded because the alternative is the app deciding something about a
 * person's own conversation: the word that ends a turn, the phrases that
 * make the EA ASK whether to end, their optional turn timer (off, and off
 * by default), and car mode.
 */
import React from "react";
import { View } from "react-native";
import { Card, Field, Label, Meta, Seg, Switch, Txt } from "@/theme/ui";
import { useSettingsStore } from "@/stores/settings";

const STYLES = [
  { key: "warm", label: "Warm" },
  { key: "clear", label: "Clear" },
  { key: "brisk", label: "Brisk" },
];
/** "off" is the first option and the default: a timer that ends a turn
 * interrupts a person who paused, which is the one thing ADR-24 is about.
 *
 * ST-06 removed 5s. Five seconds is a pause for thought, not the end of a
 * sentence, so the option existed only to cut people off — and an option that
 * cannot be chosen well is one nobody should have to reason about. Off, ten
 * seconds, or a full minute. */
const SILENCE = [
  { key: "off", label: "Off" },
  { key: "10", label: "10s" },
  { key: "60", label: "60s" },
];

/** ST-05: six speeds. 1.75 and 2 are there because Josh said he will use Talk
 * a lot and a familiar voice at 2x is still legible — the two-thirds of a
 * reply you already know the shape of is the part worth hurrying. */
const SPEEDS = [
  { key: "0.8", label: "0.8x" },
  { key: "1", label: "1x" },
  { key: "1.2", label: "1.2x" },
  { key: "1.5", label: "1.5x" },
  { key: "1.75", label: "1.75x" },
  { key: "2", label: "2x" },
];

/** `06:30` is how the value is STORED; every other time in this sheet reads
 * `6:30 daily`, `2:00 nightly`, `Mon 8:00`. Rendering the canonical string
 * raw made this the one padded time on the screen (ux-review round 15, D4).
 * Display only — the stored value is untouched. */
function displayTime(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  return `${Number(h)}:${m}`;
}

export function Voice() {
  const voice = useSettingsStore((s) => s.voice);
  const putVoice = useSettingsStore((s) => s.putVoice);

  if (voice == null) return null;

  return (
    <View testID="settings-voice">
      <Label>Voice</Label>
      <Card style={{ marginTop: 8, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt>Style</Txt>
          <Seg testID="voice-style" options={STYLES} value={voice.style} onChange={(style) => void putVoice({ ...voice, style })} width={200} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt>Speed</Txt>
          {/* ST1-11: no fixed width — six segments in 200px is 33.3px each, under
              README's 36px phone floor. S6-54: dropping the width ALONE let the
              control size itself to its labels (119px, 19.8px a segment, the
              glyphs overprinting); `grow` gives it the row — 43px+ a segment at 393. */}
          <Seg testID="voice-speed" grow options={SPEEDS} value={String(voice.speed)} onChange={(speed) => void putVoice({ ...voice, speed: Number(speed) })} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Txt>Read the brief{voice.readBriefAt != null ? ` at ${displayTime(voice.readBriefAt)}` : ""}</Txt>
            <Meta>voice note in Telegram</Meta>
          </View>
          <Switch
            testID="voice-read-brief"
            accessibilityLabel="Read the brief"
            value={voice.readBriefAt != null}
            onValueChange={(on) => void putVoice({ ...voice, readBriefAt: on ? (voice.readBriefAt ?? "06:30") : null })}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Txt>Cue word</Txt>
            <Meta>say it to hand the turn back</Meta>
          </View>
          <Field
            testID="voice-cue-word"
            accessibilityLabel="Cue word"
            value={voice.cueWord ?? ""}
            onChangeText={(cueWord) => void putVoice({ ...voice, cueWord })}
            style={{ width: 120 }}
          />
        </View>

        <View style={{ gap: 4 }}>
          <Txt>End phrases</Txt>
          {/* they make the EA ASK, never end — so a phrase you use in
              conversation costs you a question, not a hang-up (ADR-24). */}
          <Meta>the EA asks before ending · one per line</Meta>
          <Field
            testID="voice-end-phrases"
            accessibilityLabel="End phrases"
            value={(voice.endPhrases ?? []).join("\n")}
            onChangeText={(text) => void putVoice({ ...voice, endPhrases: text.split("\n").map((p) => p.trim()).filter((p) => p !== "") })}
            multiline
            // ST1-12: NOT a capture box. `expands` defaults to `multiline &&
            // touch`, which gave this settings list E-1's grow-on-focus editor
            // and with it the `continue` affordance — an accent-ink word
            // rendering inside the field at 393 and 1024 and absent above,
            // because the whole behaviour is touch-only. `continue` exists so a
            // collapsed capture box can be reopened; a list of four phrases is
            // not one.
            expandOnFocus={false}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Txt>End my turn after a silence</Txt>
            <Meta>off by default · a pause is not an answer</Meta>
          </View>
          <Seg
            testID="voice-silence-turn"
            options={SILENCE}
            value={voice.silenceTurnSeconds == null ? "off" : String(voice.silenceTurnSeconds)}
            onChange={(v) => void putVoice({ ...voice, silenceTurnSeconds: v === "off" ? null : (Number(v) as 10 | 60) })}
            width={180}
          />
        </View>

        {/* TS-02: brief is the DEFAULT, so the switch reads as the thing you
            turn off. Josh will use Talk a lot and a paragraph read aloud is a
            paragraph you cannot skim. `brevity` travels with the style on
            `start`, and the mock answers shorter when it is set. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Txt>Brief replies in Talk</Txt>
            <Meta>the EA answers in a sentence or two, not a paragraph</Meta>
          </View>
          <Switch
            testID="voice-brevity"
            accessibilityLabel="Brief replies in Talk"
            value={(voice.brevity ?? "brief") === "brief"}
            onValueChange={(brief) => void putVoice({ ...voice, brevity: brief ? "brief" : "full" })}
          />
        </View>

        {/* TS-03 / resolution #10: aloud EVERYWHERE by default, not only in
            car mode — "assume most interaction will be audio". Off, the EA
            still replies in text and the session does not wait for silence. */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Txt>Read replies aloud</Txt>
            <Meta>the EA speaks its answers, in Talk and in Dictate</Meta>
          </View>
          <Switch
            testID="voice-read-aloud"
            accessibilityLabel="Read replies aloud"
            value={voice.readAloud !== false}
            onValueChange={(readAloud) => void putVoice({ ...voice, readAloud })}
          />
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Txt>Car mode</Txt>
            <Meta>64px controls, screen stays awake, no silence timer</Meta>
          </View>
          <Switch testID="voice-car-mode" accessibilityLabel="Car mode" value={voice.carMode === true} onValueChange={(carMode) => void putVoice({ ...voice, carMode })} />
        </View>
      </Card>
    </View>
  );
}
