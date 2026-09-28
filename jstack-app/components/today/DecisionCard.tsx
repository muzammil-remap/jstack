/**
 * DecisionCard — Needs you's single open card (ADR-13). Three kind-
 * specific bodies (opts/quote/bill) plus the shared top/meta/verbs
 * chrome, from design/handoff.md's "Decision card spec" and mock v11's
 * `decCard()`/`answer()` (jstack-mock-v11.html lines 399-421).
 *
 * Source links (DC-09): the mock renders `why`/`silence` as one plain
 * line with no per-source markup, but design/handoff.md and DC-09 both
 * call for "source links" — reconciled here by appending each source as
 * its own accent-ink inline span after the meta text (tapping cites it;
 * there is no real destination to navigate to yet, BUGLOG_v2.md A-18).
 */
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Btn, BtnPrimary, Card, CardTitle, Expiry, IconBtn, Txt } from "@/theme/ui";
import { DecisionBody } from "@/components/today/DecisionBodies";
import { shortWeekday } from "@/lib/time";
import { useSessionStore } from "@/stores/session";
import { packPayload } from "@/layout/dialogKit";
import { useTodayStore } from "@/stores/today";
import { verbLabel, whyRuns } from "@/lib/decisionCopy";
import { approveCard, laterCard, OFFLINE_REASON, reviseCard } from "@/lib/cardVerbs";
import { fragment, noOrphan } from "@/lib/richText";
import { radius, space, type as typeScale } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";
import type { ActionItem } from "@/data/types";

export function DecisionCard({ card }: { card: ActionItem }) {
  const c = useTokens();
  const [menuOpen, setMenuOpen] = useState(false);
  const storedPick = useTodayStore((s) => s.picks[card.id]);
  const pick = storedPick ?? card.recommended ?? 1;
  const answer = useTodayStore((s) => s.answer);
  const online = useSessionStore((s) => s.online);
  const openModal = useSessionStore((s) => s.openModal);
  const openSheet = useSessionStore((s) => s.openSheet);

  const verb = verbLabel(card, pick);

  // DC-09 / D27: a source the sentence names is linked in place, one it never
  // names is appended once — composed in lib/decisionCopy.ts, not in render
  const whyParts = whyRuns(fragment(card.why), card.sources);

  // A4R9-01/02: Approve, Revise and Later are `lib/cardVerbs.ts`'s, which the
  // desktop keys call too — a key cannot answer differently from its button
  const onTeach = () => {
    setMenuOpen(false);
    void answer(card.id, { verb: "teach", rule: "" });
    // payload carries both id (for POST /rules `from`) and title (for the
    // sheet's "From: <title>" line) — the card is gone from `needsYou` by
    // the time the sheet opens, so it can't be looked up again there.
    setTimeout(() => openSheet("teach", packPayload(card.id, card.title)), 150);
  };

  return (
    <Card testID={`decision-card-${card.id}`} style={{ gap: space[4] }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[5] }}>
        <Txt kind="label">{card.type}</Txt>
        {/* the pack's expiry form is short — "expires Wed 5pm · then proposes
            1" (README Content) — on the card as on the rows beneath it; the
            server composes the long day (CD-18) and the app shortens it
            wherever it shows it (ux-review R2-06) */}
        <Expiry>{shortWeekday(card.thenWhat)}</Expiry>
      </View>
      {/* ux S6-16: the last word is bound to the one before it, as Latest in's
          titles are (B-83) — "there?" sat alone on line 2 of the triage card */}
      <CardTitle>{noOrphan(card.title)}</CardTitle>

      <DecisionBody card={card} pick={pick} />

      {/* DC-09 — the mock writes the why-line as ONE fragment with the source
          already inside it (`why:'both calendars · <a>Alex, 7:02am</a>'`), and
          README Content quotes exactly that: "both calendars · Alex, 7:02am ·
          silence proposes 1". Appending each source as a further chip printed
          the name twice — "both calendars · Alex, 7:02am · Alex · silence
          proposes 1" — and pushed the line to two rows (ux-review D27). So a
          source whose label already appears in `why` is rendered by linking
          THAT span, and only a source the sentence never names is appended. */}
      <Txt kind="meta" style={{ lineHeight: typeScale.size.meta * typeScale.lineHeight.body }}>
        {whyParts.map((part, i) => {
          const src = part.source;
          if (src == null) return <Text key={i}>{part.text}</Text>;
          // A-11: a source is a LINK only when it has somewhere to go. With a
          // `url` it takes the same external-link confirmation every other
          // outbound affordance in the app takes; without one it renders as
          // provenance text in the body colour, so nothing promises a tap that
          // would only have emitted an internal ref (`email:alex-0702`) into a
          // toast — a toast standing in for a feature, which is the exact
          // failure mode the label-honesty rule names.
          if (src.url == null) {
            return (
              <Text key={i} testID={`decision-source-${card.id}-${part.sourceIndex}`}>
                {part.text}
              </Text>
            );
          }
          return (
            <Text key={i} testID={`decision-source-${card.id}-${part.sourceIndex}`} onPress={() => openModal("external-link", packPayload(src.url, src.label))} style={{ color: c.accentInk }}>
              {part.text}
            </Text>
          );
        })}
        {" "}· {card.silence} · undo 10s
      </Txt>

      {/* OF-08: answering a card is not a capture — it is a decision the EA
          acts on, and it is not on the outbox allow-list, because a verb
          queued now and applied in an hour may be the wrong answer by then.
          So the buttons are disabled with the reason rather than silently
          failing or quietly queueing. The mic still works: a capture is kept,
          a decision is not guessed. */}
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <BtnPrimary
          testID={`decision-primary-${card.id}`}
          label={verb}
          style={{ flex: 1.3 }}
          {...(online ? { onPress: () => void approveCard(card) } : { disabledReason: OFFLINE_REASON })}
        />
        <Btn testID={`decision-revise-${card.id}`} label="Revise" style={{ flex: 1 }} {...(online ? { onPress: () => reviseCard(card) } : { disabledReason: OFFLINE_REASON })} />
        <Btn
          testID={`decision-later-${card.id}`}
          label="Later"
          style={{ flex: 1 }}
          {...(online ? { onPress: () => void laterCard(card) } : { disabledReason: OFFLINE_REASON })}
        />
        <IconBtn
          testID={`decision-more-${card.id}`}
          icon="more_horiz"
          inCard
          accessibilityLabel="More"
          style={{ borderRadius: radius.card }}
          onPress={() => setMenuOpen((v) => !v)}
        />
      </View>
      {menuOpen && (
        <View style={{ flexDirection: "row", gap: space[2] }} testID={`decision-menu-${card.id}`}>
          <Btn
            testID={`decision-never-${card.id}`}
            label="Never"
            textStyle={{ color: c.muted }}
            style={{ flex: 1 }}
            {...(online
              ? {
                  onPress: () => {
                    setMenuOpen(false);
                    void answer(card.id, { verb: "never" });
                  },
                }
              : { disabledReason: OFFLINE_REASON })}
          />
          <Btn testID={`decision-teach-${card.id}`} label="Teach" textStyle={{ color: c.muted }} style={{ flex: 1 }} {...(online ? { onPress: onTeach } : { disabledReason: OFFLINE_REASON })} />
        </View>
      )}
    </Card>
  );
}
