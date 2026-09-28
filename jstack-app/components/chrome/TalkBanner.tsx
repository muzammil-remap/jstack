/**
 * TalkBanner (V-2) — the conversation you walked away from.
 *
 * A session runs whether or not `TalkScreen` is mounted: Josh taps Tasks
 * mid-sentence and the EA is still there. The invariant this component
 * exists to hold is in `tests/unit/voice-ui.test.ts` — **no session runs
 * with neither the screen nor this banner visible.** A live microphone with
 * nothing on screen saying so is the single worst thing this app could do,
 * and it is exactly what happens if someone later renders the screen
 * conditionally and forgets the other half.
 *
 * So: tap to go back, End to stop, and it does not go away. The bar itself
 * is `BottomBanner` (F-42, P-8), shared with `MicBanner`.
 */
import React from "react";
import { Pressable } from "react-native";
import { BottomBanner } from "@/components/chrome/BottomBanner";
import { Icon } from "@/components/chrome/Icon";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { useMicStore } from "@/stores/mic";
import { useVoiceStore } from "@/stores/voice";
import { Txt } from "@/theme/ui";
import { useTokens } from "@/theme/ThemeProvider";

/**
 * The banner's own condition, exported so `tests/unit/voice-ui.test.ts` can
 * check the invariant against the RULE rather than against a copy of it. A
 * test that restates the condition it is testing proves only that someone
 * typed it twice.
 */
export function bannerVisible({ running, sheet }: { running: boolean; sheet: string | null }): boolean {
  return running && sheet !== "talk";
}

export function TalkBanner() {
  const c = useTokens();
  const running = useVoiceStore((s) => s.running);
  // v2.3 B-10: the live colour is a claim about the MICROPHONE, so it is worn
  // only while the mic owner has Talk's microphone open — never through a lock's
  // pause, Mute, or a microphone that is not there (A4R11-06's rule, B-3)
  const live = useMicStore((s) => s.purpose === "talk" && s.state === "listening");
  const end = useVoiceStore((s) => s.end);
  const sheet = useSessionStore((s) => s.sheet);
  const carMode = useSettingsStore((s) => s.voice?.carMode ?? false);
  const openSheet = useSessionStore((s) => s.openSheet);

  // while the screen itself is up there is nothing to remind anyone of
  if (!bannerVisible({ running, sheet })) return null;

  return (
    <BottomBanner testID="talk-banner">
      <Icon name="mic" size={16} color={live ? c.micLive : c.accentInk} />
      <Pressable testID="talk-banner-return" accessibilityRole="button" accessibilityLabel="Return to the conversation" onPress={() => openSheet("talk")} style={{ flex: 1 }}>
        <Txt kind="small">Talking with EA · tap to return</Txt>
      </Pressable>
      {/* TS-06: End is 64px in car mode HERE too, not only on the screen.
          The banner is what a person sees once they have navigated away, and
          car mode is exactly the case where they are not looking closely —
          a 20px tap target on the one control that stops a live microphone
          is the wrong place to save space. */}
      <Pressable
        testID="talk-banner-end"
        accessibilityRole="button"
        accessibilityLabel="End the conversation"
        onPress={() => end("user")}
        hitSlop={8}
        style={carMode ? { minHeight: 64, minWidth: 64, alignItems: "center", justifyContent: "center" } : undefined}
      >
        <Txt kind="small" tone="accentInk">
          End
        </Txt>
      </Pressable>
    </BottomBanner>
  );
}
