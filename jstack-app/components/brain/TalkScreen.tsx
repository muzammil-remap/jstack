/**
 * TalkScreen — "Talk with EA" as a full-screen surface (V-2, VP-04..VP-07).
 *
 * The V2 sheet was a placeholder: an orb and the word "Listening…". This is
 * the conversation. It is a `screen`-kind dialog, so the tab bar and the
 * rail are replaced while it runs (`layout/dialogs.tsx`) — a conversation is
 * not a thing you have in a corner of a tab.
 *
 * The state line is the design decision worth defending: **no timer, and no
 * pressure.** While held it says "held · take your time", not "0:42". A
 * number counting up while someone thinks is the interface telling them to
 * hurry, and ADR-24's whole position is that it must not.
 *
 * The typed field is always there, whatever the microphone is doing. That is
 * VP-05 and VP-06 in one: a browser with no permission, no `getUserMedia`,
 * or a voice service that just errored, still leaves a way to finish the
 * sentence you were in the middle of.
 */
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { Btn, BtnPrimary, Field, Meta, Txt } from "@/theme/ui";
import { Icon } from "@/components/chrome/Icon";
import { LiveMicOrb } from "@/components/chrome/LiveMicOrb";
import { WATERMARK_CLEARANCE } from "@/components/chrome/watermarkText";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useMicStore } from "@/stores/mic";
import { useVoiceStore } from "@/stores/voice";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { misc, pagePadDesktop, pagePadPhone, radius, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { useLayout } from "@/theme/useLayout";
import type { MicState } from "@/lib/mic";
import type { VoiceState } from "@/lib/voice";

/** what the app SAYS it is doing. One line, four words, no countdown. */
const STATE_LINE: Record<VoiceState, string> = {
  idle: "ready",
  starting: "connecting…",
  listening: "listening",
  held: "held · take your time",
  replying: "thinking…",
  speaking: "speaking",
  ended: "ended",
  error: "stopped",
};

/**
 * A4R11-06, and D-6's lesson: "listening" is a claim about the MICROPHONE, so
 * it is made only while the mic owner has Talk's microphone open. A lock that
 * took it, Mute, and a microphone that is not there each say so instead.
 */
function stateLine(v: { state: VoiceState; error: string | null; paused: "locked" | "away" | null; muted: boolean; mic: MicState | null }): string {
  if (v.error != null) return "stopped";
  if (v.paused === "locked") return "Paused — locked";
  // WPJ-3: the device locked or the app switched away, and JSTACK itself did not lock
  if (v.paused === "away") return "Paused";
  if (v.state !== "listening" || v.mic === "listening") return STATE_LINE[v.state];
  if (v.muted) return "muted";
  return v.mic === "requesting" ? "opening the mic…" : "mic off";
}

export function TalkScreen({ onClose }: { onClose: () => void }) {
  const c = useTokens();
  // The surface under this is `ScreenSurface` (R1-01): it paints the ground
  // edge to edge, and the body takes a tab's own page padding (handoff: 32
  // desktop, 12 phone + the safe area). The bottom is `WATERMARK_CLEARANCE`,
  // not a tab's 80/120: there is no tab bar or orb to clear here, only the
  // demo watermark's line at `space[3]` (R1-02, R2-02, `DemoWatermark.tsx`).
  const { phone } = useLayout();
  const insets = useSafeAreaInsets();
  // The content cap is the page's (RL-04, `TabScreen.tsx`), and a `screen`
  // is a page: at 1920 the composer ran the full 1856px between the page
  // paddings while every tab stopped at 1500 (ux-review R2-04). Border-box,
  // so the cap carries the padding, as TabScreen's does.
  const sides = phone ? pagePadPhone.sides : pagePadDesktop.sides;
  const pad = {
    paddingTop: phone ? insets.top + pagePadPhone.topBase : pagePadDesktop.top,
    paddingHorizontal: sides,
    paddingBottom: WATERMARK_CLEARANCE,
    maxWidth: misc.contentMax + 2 * sides,
    width: "100%" as const,
  };
  const liveVoice = useSettingsStore((s) => s.capabilities.liveVoice);
  const carMode = useSettingsStore((s) => s.voice?.carMode ?? false);
  const closeSheet = useSessionStore((s) => s.closeSheet);

  const state = useVoiceStore((s) => s.state);
  const running = useVoiceStore((s) => s.running);
  const transcript = useVoiceStore((s) => s.transcript);
  const interim = useVoiceStore((s) => s.interim);
  const filed = useVoiceStore((s) => s.filed);
  const error = useVoiceStore((s) => s.error);
  const micError = useMicStore((s) => s.error);
  const muted = useVoiceStore((s) => s.muted);
  const start = useVoiceStore((s) => s.start);
  const end = useVoiceStore((s) => s.end);
  const say = useVoiceStore((s) => s.say);
  const reply = useVoiceStore((s) => s.reply);
  const toggleMute = useVoiceStore((s) => s.toggleMute);
  const paused = useVoiceStore((s) => s.paused);
  const resumeAfterLock = useVoiceStore((s) => s.resumeAfterLock);
  // the mic owner's own word for Talk's microphone, never a flag beside it
  const talkMic = useMicStore((s) => (s.purpose === "talk" ? s.state : null));

  const [draft, setDraft] = useState("");
  // 64px in car mode (VP-07): the controls have to be usable at a glance by
  // someone whose hands and eyes are somewhere else.
  const control = carMode ? 64 : 44;
  // S6-09: one state, one dress. A microphone that will not open is not a
  // stopped conversation (MC-08) — the frames showed a Marker orb over
  // "listening" over "Mic unavailable here", three lines and two claims.
  // While the mic is down the orb RESTS and the honest line sits under the
  // field, once, in Muted. A4R11-06 (v2.3) retired the other half: the state
  // line kept the session's "listening" whatever the microphone did, and a
  // lock left it saying so to a closed microphone. It says "listening" only
  // while Talk's microphone is open now (`stateLine`), the orb wears the same
  // truth, and the e2e rig opens the test build's stub microphone before it
  // asserts either (`e2e/core/talk.spec.ts`).
  const micDown = error == null && micError != null;

  // S6-34: the newest turn sits against the field. A conversation reads from
  // the bottom — the transcript was pinned to the top, so the reply you were
  // answering was 408px above the field you answered in at 393.
  const transcriptRef = useRef<ScrollView>(null);
  useEffect(() => {
    transcriptRef.current?.scrollToEnd?.({ animated: false });
  }, [transcript.length, interim, filed.length]);

  const send = () => {
    if (draft.trim() === "") return;
    say(draft);
    setDraft("");
  };

  const leave = () => {
    end("user");
    onClose();
  };

  if (!liveVoice) {
    return (
      <View testID="talk-screen" style={{ flex: 1, backgroundColor: c.ground, ...pad, gap: space[4] }}>
        <Txt kind="title">Talk with EA</Txt>
        <Txt kind="body" tone="muted" testID="talk-honest-line">
          {"Two-way voice conversation isn't available in this build yet — dictate into Brain or use Chat instead."}
        </Txt>
        <Btn testID="talk-close" label="Close" onPress={closeSheet} />
      </View>
    );
  }

  return (
    <View testID="talk-screen" style={{ flex: 1, backgroundColor: c.ground, ...pad, gap: space[4] }}>
      {/* TS-01: the screen's own chrome. A `screen` replaces the rail and the
          tab bar (or, at 1180+, sits in a panel over them), so without this
          there was no way back except the browser's own — the surface had a
          Start button and no title and no exit. Idle it is Close; running it
          is End, at `control` height so car mode's 64px reaches it too. */}
      <View testID="talk-header" style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Txt kind="title" style={{ flex: 1 }}>
          Talk with EA
        </Txt>
        {running ? (
          <Btn testID="talk-end" label="End" style={{ minHeight: control, minWidth: control }} accessibilityLabel="End the conversation" onPress={leave} />
        ) : (
          <Btn testID="talk-close" label="Close" style={{ minHeight: control, minWidth: control }} accessibilityLabel="Close Talk" onPress={onClose} />
        )}
      </View>

      <View style={{ alignItems: "center", gap: space[2] }}>
        <LiveMicOrb size={96} glyph={40} testID="talk-orb" resting={talkMic !== "listening"} />
        <Txt testID="talk-state" kind="body" tone="muted">
          {stateLine({ state, error, paused, muted, mic: talkMic })}
        </Txt>
        {error != null && (
          <Meta testID="talk-error" style={{ color: c.alert, textAlign: "center" }}>
            {error} · you can still type below
          </Meta>
        )}
      </View>

      {/* the ScrollView's content is anchored to its foot (S6-34): a short
          conversation sits against the field, a long one scrolls to its end */}
      <ScrollView ref={transcriptRef} testID="talk-transcript" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", gap: space[3] }}>
        {transcript.map((row, i) => (
          <View key={i} testID={`talk-row-${i}`} style={{ gap: 2 }}>
            <Meta>{row.role === "you" ? "you" : "your EA"}</Meta>
            <Txt>{row.text}</Txt>
            {row.sources != null && row.sources.length > 0 && (
              <Meta testID={`talk-sources-${i}`}>{row.sources.map((s) => s.label).join(" · ")}</Meta>
            )}
          </View>
        ))}
        {interim !== "" && (
          <Txt testID="talk-interim" tone="muted">
            {interim}
          </Txt>
        )}
        {filed.length > 0 && <Meta testID="talk-filed">filed · {filed.join(" · ")}</Meta>}
      </ScrollView>

      <Field testID="talk-field" accessibilityLabel="Type to your EA" value={draft} onChangeText={setDraft} placeholder="or type" onSubmitEditing={send} />
      {/* MC-08: the MICROPHONE's own line, separate from the session's, and
          under the field the person is being pointed at. Muted, not Alert:
          a capability notice is none of the three things Alert is for
          (README Colour), and the line already says what to do instead. */}
      {micDown && (
        <Meta testID="talk-mic-error" style={{ marginTop: -space[2] }}>
          {micError}
        </Meta>
      )}

      {/* Mute · Reply, equal weight, and End in the header (TS-01) — the
          three BRAIN_PROPOSAL row 2 names, at `control` height: Mute had been
          a tenth of Reply's width, the smallest thing on a driving-mode
          screen and the one that stops the microphone hearing you (S6-34).
          After a lock, one control instead, and nothing on its own (A4R11-06). */}
      <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
        {running && paused ? (
          <BtnPrimary testID="talk-resume" label="Resume" style={{ minHeight: control, flex: 1 }} accessibilityLabel="Resume the conversation and reopen the microphone" onPress={resumeAfterLock} />
        ) : running ? (
          <>
            <Btn
              testID="talk-mute"
              label={muted ? "Unmute" : "Mute"}
              style={{ minHeight: control, flex: 1 }}
              accessibilityLabel={muted ? "Unmute the microphone" : "Mute the microphone"}
              onPress={toggleMute}
            />
            <BtnPrimary testID="talk-reply" label="Reply" style={{ minHeight: control, flex: 1 }} onPress={reply} />
          </>
        ) : (
          <BtnPrimary testID="talk-start" label="Start talking" style={{ minHeight: control, flex: 1 }} onPress={start} />
        )}
      </View>

      {carMode && (
        <View testID="talk-car-mode" style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radius.control, paddingVertical: 4 }}>
          <Icon name="mic" size={14} color={c.muted} />
          <Meta>car mode · hands-free, screen stays awake</Meta>
        </View>
      )}
    </View>
  );
}
