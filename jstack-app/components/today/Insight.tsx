/**
 * Insight — Today's "From your EA" section (TD-03, RP-03): the open insight
 * card (text, why-line, Block it / Leave it), collapsing to a one-line result
 * once answered (mock v11 `today()` line 460), and under it the newest UNREAD
 * reply to something Josh asked.
 *
 * Both cards are the EA speaking, which is why they share a section rather
 * than the reply getting a heading of its own: two "From your EA" headings on
 * one screen would be the app describing its own internals. The insight is
 * the EA volunteering something; the reply is the EA answering. The reply is
 * second because the question was Josh's and he already knows he asked it.
 *
 * ONE card, never a list — Today is a summary, and Brain > Replies is the
 * list. Nothing here renders when there is no unread reply: an empty state
 * saying "no replies" is a row that is present every day to report that
 * nothing happened.
 */
import React from "react";
import { View } from "react-native";
import { Btn, BtnPrimary, Card, Meta, Section, Txt } from "@/theme/ui";
import { newestUnread, useRepliesStore } from "@/stores/replies";
import { useSessionStore } from "@/stores/session";
import { useTodayStore } from "@/stores/today";
import { formatWhen } from "@/lib/time";
import { space } from "@/theme/tokens";
import { useTokens } from "@/theme/ThemeProvider";

export function Insight() {
  const c = useTokens();
  const insight = useTodayStore((s) => s.composite?.insight);
  const answerInsight = useTodayStore((s) => s.answerInsight);
  const openSheet = useSessionStore((s) => s.openSheet);
  const openModal = useSessionStore((s) => s.openModal);
  const replies = useRepliesStore((s) => s.replies);
  const markRead = useRepliesStore((s) => s.markRead);
  const reply = newestUnread(replies);

  return (
    <Section testID="insight" style={{ gap: space[3], marginTop: space[3] }} sectionId="insight" title={"From your EA"} labelTestID="insight-label">
      {insight != null && (
        <Card testID="insight-card">
          {insight.state === "done" ? (
            <Txt testID="insight-result" kind="small">
              {insight.result}
            </Txt>
          ) : (
            <>
              <Txt>{insight.text}</Txt>
              <Txt kind="meta" style={{ marginTop: 4, marginBottom: space[3] }}>because: {insight.why}</Txt>
              <View style={{ flexDirection: "row", gap: space[2] }}>
                <BtnPrimary
                  testID="insight-block"
                  label={insight.primary.label}
                  onPress={() => void answerInsight(insight.id, insight.primary.action as "block" | "leave")}
                />
                <Btn
                  testID="insight-leave"
                  label={insight.secondary.label}
                  textStyle={{ color: c.muted }}
                  style={{ borderColor: "transparent" }}
                  onPress={() => void answerInsight(insight.id, insight.secondary.action as "block" | "leave")}
                />
              </View>
            </>
          )}
        </Card>
      )}

      {reply != null && (
        <Card testID="reply-card">
          <Txt testID="reply-card-text" numberOfLines={3}>
            {reply.text}
          </Txt>
          <Meta testID="reply-card-when" style={{ marginTop: 4, marginBottom: space[3] }}>
            {formatWhen(reply.at)}
          </Meta>
          <View style={{ flexDirection: "row", gap: space[2] }}>
            <BtnPrimary testID="reply-card-open" label="Open" onPress={() => openModal("reply", reply.id)} />
            {/* Dismiss marks it READ, it does not delete it. The reply stays
                in Brain > Replies — "I've seen this" and "this never
                happened" are different things and only one of them is the
                person's to say from a summary card. */}
            <Btn
              testID="reply-card-dismiss"
              label="Dismiss"
              textStyle={{ color: c.muted }}
              style={{ borderColor: "transparent" }}
              onPress={() => void markRead(reply.id)}
            />
          </View>
        </Card>
      )}

      {/* TS-05: the same pair that sits in Brain's capture card, under the
          card here. Josh reads Today first and the EA's answer is the thing
          he most often wants to reply to — making him navigate to Brain to
          say something back is the friction ADR-50 is about. Same surfaces,
          opened the same way, so there is one implementation of each. */}
      <View style={{ flexDirection: "row", gap: space[2] }}>
        <BtnPrimary testID="insight-talk" label="Talk with EA" style={{ flex: 1 }} onPress={() => openSheet("talk")} />
        <Btn testID="insight-dictate" label="Dictate to EA" style={{ flex: 1 }} onPress={() => openModal("brain-dictate")} />
      </View>
    </Section>
  );
}
