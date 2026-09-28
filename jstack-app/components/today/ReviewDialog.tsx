/**
 * ReviewDialog — TD-08: the week that was (decisions, promises kept,
 * time by focus bars), the week ahead, three things — from `GET
 * /review`. mock v11's own "week ahead" bullets and revised-count are
 * narrative copy with no backing field on `ReviewComposite` (BUGLOG_v2.md
 * A-21: rendered from `weekAhead.habitsPct`/`spend` instead, not invented).
 */
import React, { useEffect } from "react";
import { Text, View } from "react-native";
import { Card, Label, ListCard, Meta, Row, Track, Txt } from "@/theme/ui";
import { Dialog } from "@/components/chrome/Dialog";
import { Sens } from "@/components/chrome/Sens";
import { useTodayStore } from "@/stores/today";
import { space } from "@/theme/tokens";

export function ReviewDialog({ onClose }: { onClose: () => void }) {
  const review = useTodayStore((s) => s.review);
  const loadReview = useTodayStore((s) => s.loadReview);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  if (review == null) return null;

  const focusRows = Object.entries(review.weekThatWas.timeByFocus);
  const totalHours = focusRows.reduce((sum, [, h]) => sum + h, 0);
  const maxHours = Math.max(1, ...focusRows.map(([, h]) => h));

  return (
    <Dialog testID="review-dialog" title="Review" onClose={onClose}>
      <Meta>On demand, any time</Meta>

      <Label style={{ marginTop: space[6] }}>The week that was</Label>
      <Card style={{ marginTop: space[3] }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Txt>
            <Text style={{ fontWeight: "500" }}>{review.weekThatWas.decisions}</Text> decisions
          </Txt>
          <Txt>
            <Text style={{ fontWeight: "500" }}>{review.weekThatWas.promisesKept}</Text> promises kept
          </Txt>
        </View>
        <View style={{ gap: space[2], marginTop: space[3] }}>
          {focusRows.map(([focus, hours]) => (
            <View key={focus} style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
              <Meta style={{ width: 60, textTransform: "capitalize" }}>{focus}</Meta>
              <Track value={hours / maxHours} style={{ flex: 1 }} />
              <Meta>{totalHours > 0 ? `${Math.round((hours / totalHours) * 100)}%` : "0%"}</Meta>
            </View>
          ))}
        </View>
      </Card>

      <Label style={{ marginTop: space[6] }}>The week ahead</Label>
      <Card style={{ marginTop: space[3] }}>
        <Txt>Habits on track: {Math.round(review.weekAhead.habitsPct * 100)}%</Txt>
        <Txt style={{ marginTop: 4 }}>
          Spend: <Sens kind="body">{review.weekAhead.spend}</Sens>
        </Txt>
      </Card>

      <Label style={{ marginTop: space[6] }}>Three things this week</Label>
      {review.threePriorities.length === 0 ? (
        <Meta style={{ marginTop: space[3] }}>Nothing high-priority open right now.</Meta>
      ) : (
        <ListCard style={{ marginTop: space[3] }}>
          {review.threePriorities.map((title, i) => (
            <Row key={title} last={i === review.threePriorities.length - 1}>
              <Meta style={{ width: 14 }}>{i + 1}</Meta>
              <Txt style={{ flex: 1 }}>{title}</Txt>
            </Row>
          ))}
        </ListCard>
      )}
    </Dialog>
  );
}
