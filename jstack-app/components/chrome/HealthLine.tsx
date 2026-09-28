/**
 * HealthLine (F-41, P-8) — the health line the rail and the phone header used
 * to write twice, with mirrored comments (OF-08: "the rail and the phone
 * header are one statement in two places"). The caller keeps its testID and
 * its wrapper style (`rail-health`, `header-health`): the two wrappers differ,
 * and the phone's carries the sync dot and a 36px tap area for it. The DOT is
 * the first child (`screens.test.tsx` R2-08 reads it so).
 *
 * Until the summary loads there is nothing to assert: a confident "all
 * healthy · $0.00" from a null summary is a claim the app has not checked,
 * and it contradicted Agents' own "needs attention · $0.42" in the same
 * session (ux-review R3-02). Dot and figure arrive together with the answer.
 *
 * OF-08: offline outranks the agents' own health. "all healthy" beside a
 * dead connection is true about the agents and useless to the person holding
 * the phone — what they need to know is that what they capture is being
 * kept rather than sent. Muted, not Alert, for it: the words are about
 * connectivity (ux-review R2-08; README Colour keeps Alert for issues,
 * over-budget bars and the lock).
 *
 * V-2 / MC-03: a running conversation or an open microphone is the more
 * urgent fact about the device in your hand, and the line says so in the
 * `micLive` token the banner and the field button wear. S6-18 (ux round,
 * Stage 6): it is APPENDED, never substituted. The rail used to read "● mic
 * on" and nothing else — the attention state and the spend gone for as long
 * as the mic was open — while the phone's line did not say it at all, so one
 * state read three ways at three widths. "needs attention · $0.40 · mic on"
 * is one sentence at every width; only with nothing else to say is the
 * microphone the whole line, on its own dot.
 */
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Txt } from "@/theme/ui";
import { Sens } from "@/components/chrome/Sens";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";
import { useTokens } from "@/theme/ThemeProvider";
import { moneyPrecise } from "@/lib/money";

const dot = { width: 6, height: 6, borderRadius: 3 } as const;

export function HealthLine({
  testID,
  style,
  talking = false,
  micOpen = false,
  always = false,
  trailing,
}: {
  testID: string;
  style: StyleProp<ViewStyle>;
  /** a running conversation, an open microphone — appended to the line */
  talking?: boolean;
  micOpen?: boolean;
  /** render the wrapper even with nothing to say (the phone header's sync
   * dot is true in every case, SY-02); the rail renders nothing instead */
  always?: boolean;
  /** after the words — the phone header's sync dot */
  trailing?: React.ReactNode;
}) {
  const c = useTokens();
  const online = useSessionStore((s) => s.online);
  const summary = useAgentsStore((s) => s.summary);

  // S6-59: bound, so a narrow rail never ends a line on "in"
  const live = talking ? "in\u00A0conversation" : micOpen ? "mic on" : null;
  // nested in the line's own Txt, so the sentence is one text node — TD-02
  // and MC-03 read it whole. The words stay in the line's own ink (S6-48):
  // Marker is the dot's — "count badges, mic while listening; nowhere else"
  // A6-06, then A62-01 — CARRIED, not fixed, and the tree is left in the state
  // that breaks no NAMED rule. B-173 bound the phrase, so on eight Talk frames
  // it moved to line 2 whole and left its separator at the end of line 1
  // ("needs attention · $0.40 ·"). Binding the separator to the phrase moved
  // the dot with it and produced the other defect: a LEADING middle dot, which
  // the design pack forbids by name. There is no third mechanical answer — on a
  // 200 px rail this sentence must wrap somewhere, and a wrapped dot is either
  // trailing or leading. The two real answers both need Josh: say less while a
  // conversation is live (S6-59's own proposal, which S6-18's acceptance row
  // currently forbids — it pins the words being KEPT), or break the line
  // deliberately with no separator at all. Carried in CARRIED_DEFECTS_v22.md
  // with both, and the trailing form stands meanwhile.
  const suffix = live != null ? <Txt kind="small">{` · ${live}`}</Txt> : null;

  const line = !online ? (
    <>
      <View style={{ ...dot, backgroundColor: c.muted }} />
      <Txt kind="small">
        offline · captures queue
        {suffix}
      </Txt>
    </>
  ) : summary != null ? (
    <>
      <View style={{ ...dot, backgroundColor: summary.health === "degraded" ? c.alert : c.ok }} />
      <Txt kind="small">
        {summary.health === "degraded" ? "needs attention" : "all healthy"} · <Sens kind="small">{moneyPrecise(summary.spendToday)}</Sens>
        {suffix}
      </Txt>
    </>
  ) : live != null ? (
    <>
      <View style={{ ...dot, backgroundColor: c.micLive }} />
      <Txt kind="small">{live}</Txt>
    </>
  ) : null;

  if (line == null && !always) return null;
  return (
    <View testID={testID} style={style}>
      {line}
      {/* S6-06: the sync dot on the line's own grammar — a middle dot between
          every pair (README Content). DRAWN rather than typed: the dot
          contributes no text (§4 A-114) and neither does this, so TD-02's
          exact-text pin on the line holds. */}
      {line != null && trailing != null && <View testID="health-sep" aria-hidden style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: c.muted }} />}
      {trailing}
    </View>
  );
}
