/**
 * `head()` (mock v11 line 541) — title (Source Serif 4, 32 desktop / 26
 * phone) + subtitle on the baseline, an optional delta line (row 8 fills
 * it), buttons (desktop: Arrange, Help, Theme; phone: Settings, Theme),
 * and the phone-only health line under the header (RL-05; the rail carries
 * its own health line at the bottom, Rail.tsx).
 */
import React from "react";
import { Text, View } from "react-native";
import { IconBtn, Txt } from "@/theme/ui";
import { noOrphan } from "@/lib/richText";
import { SyncDot } from "@/components/chrome/SyncDot";
import { HealthLine } from "@/components/chrome/HealthLine";
import { useOpenFind } from "@/layout/find";
import { micIsOpen, useMicStore } from "@/stores/mic";
import { useVoiceStore } from "@/stores/voice";
import { useLayout } from "@/theme/useLayout";
import { type as typeScale } from "@/theme/tokens";
import { useTheme, useTokens } from "@/theme/ThemeProvider";

export function Header({
  title,
  subtitle,
  deltaLine,
  onReviewWeek,
  onArrange,
  onHelp,
  onSettings,
  right,
}: {
  title: string;
  subtitle: string;
  deltaLine?: string;
  /** TD-01: when given, appends a "Review the week" link after `deltaLine`. */
  onReviewWeek?: () => void;
  onArrange?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  right?: React.ReactNode;
}) {
  const c = useTokens();
  const { phone } = useLayout();
  const { mode, setMode } = useTheme();
  const openFind = useOpenFind();
  // S6-18: the phone's line says "· mic on" / "· in conversation" too — the
  // banner says it where there is no rail, and the line still said nothing
  const micOpen = useMicStore(micIsOpen);
  const talking = useVoiceStore((s) => s.running);

  const cycleTheme = () => {
    setMode(mode === "dark" ? "light" : mode === "light" ? "auto" : "dark");
  };

  return (
    // marginBottom is the header block's OWN gap (README Spacing, "Between
    // header blocks: 12"). It used to come from the focus-chip row's
    // marginBottom, so on Agents — the one tab with no chips (FS-05) — the
    // page title sat flush against the first section label and the descender
    // of "Agents" crossed "RUNS AND SPEND" (ux-review D7).
    <View testID="header" style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <Txt kind={phone ? "pageTitlePhone" : "pageTitle"}>{title}</Txt>
            {/* N1-05 (P-9): the phone wrapped "…the memory it runs / on" */}
            <Txt tone="muted">{noOrphan(subtitle)}</Txt>
          </View>
          {/* handoff Shell: "a delta line beneath (11.5 muted)" — `meta` is
              Muted on its own. It carried `c.textExpiry` from v1.2 until the
              Stage 4 review (D2, R1-07; DISCREPANCIES row 14); only the link
              below is tappable, so only the link is accent. */}
          {deltaLine != null && (
            <Txt testID="header-delta" kind="meta">
              {deltaLine}
              {onReviewWeek != null && (
                <Text testID="review-week-link" onPress={onReviewWeek} style={{ color: c.accentInk, fontWeight: String(typeScale.weight.emphasis) as "500" }}>
                  {" "}
                  Review the week
                </Text>
              )}
            </Txt>
          )}
        </View>
        {/* R3-05: `flexShrink: 0` plus the row's 12px gap (README Spacing,
            "Between header blocks: 12") — Life's subtitle reached within 3px
            of the Settings button at 393 with neither in place. */}
        <View style={{ flexDirection: "row", gap: 8, flexShrink: 0 }}>
          {right}
          {!phone && <IconBtn icon="grid_view" accessibilityLabel="Arrange" onPress={onArrange ?? (() => {})} />}
          {!phone && <IconBtn icon="help" accessibilityLabel="Help" onPress={onHelp ?? (() => {})} />}
          {/* GS-03: the phone's way into Find. The rail carries it at 768 and
              up; below that there is no rail, and until K-1 there was no
              global search on a phone at all — Brain's field is Brain's, and
              a person looking for a file was expected to know that. */}
          {phone && <IconBtn icon="search" accessibilityLabel="Find" onPress={openFind} />}
          {phone && <IconBtn icon="settings" accessibilityLabel="Settings" onPress={onSettings ?? (() => {})} />}
          <IconBtn icon={mode === "dark" ? "light_mode" : "dark_mode"} accessibilityLabel="Theme" onPress={cycleTheme} />
        </View>
      </View>
      {/* OF-08: the same line as the rail's, and the same rule — offline
          outranks the agents' own health. The rail and the phone header are
          one statement in two places, so a change to either is a change to
          both. */}
      {/* SY-02: the sync dot is in this line on a phone, and the line is now
          rendered whenever there IS a phone — the two branches below are about
          what the app can honestly SAY, and the dot is true in every case
          including the one where the summary has not arrived. It contributes
          no text, so TD-02's exact-text assertion on this line is unchanged. */}
      {/* `minHeight: 36` is the sync dot's tap area, and it belongs to the LINE
          rather than to the dot: a 6px control cannot reach GL-04's floor
          without a hit area, and a hit area on a 13px row spills into whatever
          is above it — which on Today is the delta line's "Review the week"
          link, whose centre the dot then swallowed (the board's TD-08). The
          line carries the height, the dot fills it, and nothing reaches past
          it. The cost is about 17px of phone header, which is what a control
          the person can actually hit costs here. */}
      {phone && (
        <HealthLine
          testID="header-health"
          style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, marginTop: -2, marginBottom: 4 }}
          talking={talking}
          micOpen={micOpen}
          always
          trailing={<SyncDot />}
        />
      )}
    </View>
  );
}
