/**
 * The LIVE mic — `.js-mic.is-live` in the pack, `.mic-live` in mock v11:
 *
 *   width:42; height:42; border-radius:50%; background: var(--marker);
 *   color:#fff; animation: jsPulse 1.4s var(--ease) infinite
 *
 * and README, Components: "Listening: 42px circle, Marker fill, white filled
 * glyph, **pulse ring 1.4s**."
 *
 * AUDIT_v2.md A-05: none of that existed. `ListeningBar` rendered a bare 20px
 * glyph — no orb, no marker fill, no pulse — so VO-01's "live orb" clause was
 * unimplemented and untested, while `TalkSheet` drew the 42px circle without
 * the pulse. The two live-voice surfaces disagreed with each other; they share
 * this component now.
 *
 * `motion.pulseDuration` (1400) was the **fourth** exists-but-never-applied
 * token in this build (after `blur.card`, the overlay frost recipe and the
 * scrollbar rule). This is its consumer. It is a different animation from the
 * idle orb's at-rest "breathing" in `Orb.tsx`, which was invented for GL-06 at
 * 1600ms and is documented there — the pack's 1.4s pulse is the LISTENING one,
 * and this is it.
 *
 * The ring expands and fades under the orb rather than scaling the orb itself,
 * so the tap target never moves: B-39's lesson, where the idle orb's own
 * transform loop meant every mic click in the suite needed `{ force: true }`.
 * `prefers-reduced-motion` drops it entirely, per README Motion ("Honour
 * `prefers-reduced-motion`: keep opacity changes, drop transforms and the
 * pulse") — the one animation the pack names by name there.
 */
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { Icon } from "@/components/chrome/Icon";
import { useReducedMotion } from "@/theme/useReducedMotion";
import { motion, sizes } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { webData } from "@/lib/webData";

/** the pack's ring on the 42px orb: "expands 0 to 14px and fades". T-5 made it
 * a parameter rather than a constant: the 8px working marker cannot grow by 14
 * — the ring would be three times the dot and read as a target, not a pulse. */
const RING_GROWTH = 14;
// react-native-web has no native driver; asking for one only warns (GL-00).
const NATIVE_DRIVER = Platform.OS !== "web";

/**
 * A filled circle with the pack's 1.4s pulse ring under it (T-5).
 *
 * Extracted from `LiveMicOrb` so the working marker's 8px dot is the SAME
 * animation rather than a second one that drifts — there is one pulse in this
 * app and this is it (rule 16). The ring expands and fades UNDER the circle
 * rather than scaling it, so a tap target never moves (B-39), and
 * `prefers-reduced-motion` drops it entirely, per README Motion.
 *
 * `data-animating` is what an e2e can see: an assertion on a running CSS
 * animation is a race, and this says the same thing without one.
 */
export function Pulse({
  size,
  growth = RING_GROWTH,
  color,
  testID,
  data,
  children,
}: {
  size: number;
  growth?: number;
  color: string;
  testID?: string;
  /** extra `data-*` for the surface that owns this pulse */
  data?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      ring.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ring, { toValue: 1, duration: motion.pulseDuration, easing: Easing.out(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
    );
    loop.start();
    return () => {
      loop.stop();
      ring.setValue(0);
    };
  }, [reducedMotion, ring]);

  return (
    <View testID={testID} {...webData({ ...data, animating: reducedMotion ? "off" : "on" })} style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: color,
          opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, (size + growth) / size] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
        {children}
      </View>
    </View>
  );
}

export function LiveMicOrb({ size = sizes.micLive, glyph = 22, testID = "live-mic-orb", resting = false }: { size?: number; glyph?: number; testID?: string; resting?: boolean }) {
  const c = useTokens();
  // S6-09: one orb, two dresses. `resting` is README Mic's Idle — the Card
  // surface, an Accent-ink glyph, no pulse — for a session whose microphone
  // could not open: the socket is up and the field still sends, but nothing
  // is listening, and a Marker orb over "Mic unavailable here" was the
  // surface contradicting itself in three consecutive lines.
  if (resting) {
    return (
      <View testID={testID} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder, ...c.shadow.native }}>
        <Icon name="mic" size={glyph} color={c.accentInk} />
      </View>
    );
  }
  return (
    <Pulse size={size} color={c.micLive} testID={testID} data={{ "mic-live": "1" }}>
      <Icon name="mic" fill size={glyph} color={c.onSelected} />
    </Pulse>
  );
}
