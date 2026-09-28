/**
 * "What works in this build" (GL-08) — every flag from `capabilities()`
 * with its honest status, and every registry section hidden because its
 * `feed` capability is off (ADR-06: a section without a feed hides itself
 * and is listed here, not silently dropped).
 */
import React from "react";
import { View } from "react-native";
import { Dialog } from "@/components/chrome/Dialog";
import { Row, Txt } from "@/theme/ui";
import { SECTIONS } from "@/layout/registry";
import { useSettingsStore } from "@/stores/settings";
import { useTokens } from "@/theme/ThemeProvider";
import type { Capabilities } from "@/data/types";

const LABELS: Record<keyof Capabilities, string> = {
  liveRouting: "Live routing preview while you dictate",
  liveVoice: "Two-way voice conversation with the EA",
  speech: "Spoken replies (this device's browser)",
  fileStore: "Opening a picked file attachment",
  calendarWrite: "Writing back to your calendar",
  // U-1: not a feature the person turns on — it is whether the BACKEND has a
  // push service at all. Help lists it so "notifications are off" has a
  // reason beside it rather than being a mystery.
  pushPublicKey: "Push notifications (the backend has a push service configured)",
  moneyFeed: "Live bank/spend feed (Money is EA-entered until then)",
  healthFeed: "Health data feed",
  export: "Exporting your data (Settings › Export)",
  calendarViews: "Week and Month calendar views",
};

export function Help({ onClose }: { onClose: () => void }) {
  const c = useTokens();
  const capabilities = useSettingsStore((s) => s.capabilities);
  const hiddenByFeed = SECTIONS.filter((s) => s.feed != null && capabilities[s.feed] !== true);

  return (
    <Dialog title="What works in this build" onClose={onClose} testID="help-dialog">
      {/* V-1 removed the "which speech engine" line. It named `lib/stt.ts`'s
          resolved engine ("iOS Speech · on-device", "Browser speech · your
          browser's vendor service"), and that file is gone: ADR-49 makes
          `lib/mic.ts` the one owner, and what a person needs to know about the
          microphone is now said where they use it — the field's button, the
          banner, and the honest line when it is unavailable. A dialog naming a
          vendor service they cannot choose was a fact about the build, not an
          answer to a question anybody had. Recorded in
          02_ACCEPTANCE_TESTS_v22.md §4; the `help-stt-engine` pin goes with
          it (brain.spec.ts). */}
      <View style={{ gap: 2 }}>
        {(Object.keys(LABELS) as (keyof Capabilities)[]).map((key) => {
          const on = capabilities[key] === true;
          return (
            <Row key={key}>
              <View style={{ flex: 1 }}>
                <Txt>{LABELS[key]}</Txt>
                <Txt kind="meta" style={{ color: on ? c.ok : c.muted }}>{on ? "on" : "not available yet"}</Txt>
              </View>
            </Row>
          );
        })}
      </View>
      {hiddenByFeed.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Txt kind="label" style={{ marginBottom: 6 }}>Hidden until their feed is on</Txt>
          {hiddenByFeed.map((s) => (
            <Txt key={s.id} tone="muted">
              {s.title} ({s.tab})
            </Txt>
          ))}
        </View>
      )}
    </Dialog>
  );
}
