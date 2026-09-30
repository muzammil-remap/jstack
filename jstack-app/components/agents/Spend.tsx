/**
 * Spend — Agents' spend ring and per-agent caps (AG-02): a 56px ring at
 * the spent fraction, "$X of $Y this month", a landing estimate, the
 * heartbeat line, and cap chips. "edit caps" opens `CapsDialog`, which
 * requires a fresh biometric assertion (SEC-07) before `PUT /agents/caps`.
 */
import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Card, Meta, Section, Txt } from "@/theme/ui";
import { Sens } from "@/components/chrome/Sens";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";
import { money } from "@/lib/money";
import { radius, sizes, space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import { NotConnected } from "@/components/chrome/NotConnected";

function Ring({ fraction }: { fraction: number }) {
  const c = useTokens();
  const size = sizes.ring;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  return (
    <Svg testID="spend-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.hairline} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        // Accent, not Accent ink — README Components: "Spend ring: 56px conic,
        // Accent for spent, Hairline for the rest". Accent ink's allowed places
        // are section labels, verbs, links, expiry, the recommended option
        // number, the active tab and provenance links; a ring fill is not one
        // (ux-review D18/R2-03 — fixed on Life's money bars, missed here).
        stroke={clamped >= 1 ? c.alert : c.accent}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export function Spend() {
  const c = useTokens();
  const spend = useAgentsStore((s) => s.spend);
  const summary = useAgentsStore((s) => s.summary);
  const openModal = useSessionStore((s) => s.openModal);

  const notConnected = useAgentsStore((s) => s.notConnected.spend === true);

  // N8N-2: no source — said, never "$0 of $0"
  if (spend == null) return notConnected ? <Section testID="agents-spend-section" sectionId="agents-spend" title={"Spend"}><NotConnected testID="spend-not-connected" /></Section> : null;
  const fraction = spend.month.cap > 0 ? spend.month.spent / spend.month.cap : 0;

  return (
    <Section testID="agents-spend-section" sectionId="agents-spend" title={"Spend"} right={<Txt testID="spend-edit-caps" kind="meta" tone="accentInk" onPress={() => openModal("caps")}>edit caps</Txt>}>
      <Card style={{ marginTop: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space[4] }}>
          {/* handoff.md, Agents Column 1: "56px conic ring, accent 30.5%,
              bar-colour 42px centre with '$61'". The ring rendered empty. */}
          <View style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
            <Ring fraction={fraction} />
            <View style={{ position: "absolute", width: 42, height: 42, borderRadius: 21, backgroundColor: c.bar, alignItems: "center", justifyContent: "center" }}>
              <Sens testID="spend-ring-value" kind="body">
                {money(spend.month.spent)}
              </Sens>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Sens testID="spend-this-month" kind="body">
              {money(spend.month.spent)} of {money(spend.month.cap)} this month
            </Sens>
            <Sens testID="spend-landing" kind="meta">
              landing about {money(spend.month.landing)}
            </Sens>
            {summary != null && <Meta testID="spend-heartbeat">heartbeat every {summary.heartbeat.every}</Meta>}
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: space[4] }}>
          {spend.caps.map((cap) => (
            <View key={cap.agent} testID={`cap-chip-${cap.agent}`} // outlined, not filled: handoff.md "caps as outlined 10.5 chips";
              // README Surfaces puts chips at radius 8
              style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.control, borderWidth: 1, borderColor: c.hairline }}>
              <Meta>
                {cap.agent} · {money(cap.spent)}/{money(cap.cap)}
              </Meta>
            </View>
          ))}
        </View>
      </Card>
    </Section>
  );
}
