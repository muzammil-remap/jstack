/**
 * MicBanner (V-1, ADR-49 / MC-03) — the microphone you walked away from.
 *
 * Josh: "Mic staying on and I don't know how to turn it off — this must never
 * happen." The old indicator was `ListeningBar`, which rendered only while
 * `session.listening` was true and, on a phone, REPLACED the tab bar — so the
 * one thing telling you the mic was on also took away the way out. On desktop
 * it sat in a corner of a wide window.
 *
 * This is the `TalkBanner` pattern instead: an overlay on every tab, with a
 * Stop that works from wherever you are, and the tab bar left alone. The
 * bar itself is `BottomBanner` (F-42, P-8) — the two wore one chrome.
 *
 * It deliberately does NOT render for `purpose: "talk"`. Talk keeps
 * `TalkBanner` as its one banner (resolution #8) — two banners for one session
 * is worse than none, because a person stops reading either.
 */
import React from "react";
import { Pressable } from "react-native";
import { BottomBanner } from "@/components/chrome/BottomBanner";
import { Icon } from "@/components/chrome/Icon";
import { bannerVisible } from "@/components/chrome/TalkBanner";
import { stopActiveMic, type MicPurpose, type MicState } from "@/lib/mic";
import { micBannerText, micIsOpen, useMicStore } from "@/stores/mic";
import { useSessionStore } from "@/stores/session";
import { useVoiceStore } from "@/stores/voice";
import { Txt } from "@/theme/ui";
import { useTokens } from "@/theme/ThemeProvider";

/**
 * The banner's own condition, exported so `tests/unit/voice-ui.test.ts` can
 * check MC-01's invariant against the RULE rather than a copy of it — a test
 * that restates the condition it tests proves only that someone typed it
 * twice (the reasoning `TalkBanner.bannerVisible` already carries).
 */
export function micBannerVisible(s: { state: MicState; purpose: MicPurpose | null }): boolean {
  return micIsOpen(s) && s.purpose !== "talk";
}

/**
 * Is a bottom banner up — this one or Talk's? The chrome that shares its band
 * asks (S6-02, S6-13, S6-18): the demo watermark yields the phone's band to
 * it, and the toast steps over it the way it steps over the mark. Read from
 * the two banners' OWN conditions, so this cannot disagree with the screen.
 */
export function useBannerUp(): boolean {
  const state = useMicStore((s) => s.state);
  const purpose = useMicStore((s) => s.purpose);
  const running = useVoiceStore((s) => s.running);
  const sheet = useSessionStore((s) => s.sheet);
  return micBannerVisible({ state, purpose }) || bannerVisible({ running, sheet });
}

export function MicBanner() {
  const c = useTokens();
  const state = useMicStore((s) => s.state);
  const purpose = useMicStore((s) => s.purpose);

  if (!micBannerVisible({ state, purpose })) return null;

  return (
    <BottomBanner testID="mic-banner">
      <Icon name="mic" size={16} color={c.micLive} />
      <Txt kind="small" testID="mic-banner-text" style={{ flex: 1 }}>
        {micBannerText(purpose)}
      </Txt>
      <Pressable testID="mic-banner-stop" accessibilityRole="button" accessibilityLabel="Stop the microphone" onPress={() => stopActiveMic()} hitSlop={8}>
        <Txt kind="small" tone="accentInk">
          Stop
        </Txt>
      </Pressable>
    </BottomBanner>
  );
}
