/**
 * Feed — Agents' "Last 24 hours" card (AG-05): ok/muted/alert dots, the
 * time, text, meta. An alert row carries Renew for as long as its linked
 * issue is still open.
 *
 * ux S6-22: the time is `formatWhen`, the form every other surface uses
 * (TD-06) — "Today 6:31am" rather than "9 h ago", which was the one line on
 * the tab counting instead of telling, in a form English does not write.
 * `formatAgo` keeps its own caller (a delegation's age in `lib/taskMeta.ts`).
 */
import React from "react";
import { View } from "react-native";
import { BtnSm, Dot, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { formatWhen } from "@/lib/time";
import { useAgentsStore } from "@/stores/agents";

export function Feed() {
  const feed = useAgentsStore((s) => s.feed);
  const issues = useAgentsStore((s) => s.issues);
  const actIssue = useAgentsStore((s) => s.actIssue);

  return (
    <Section testID="agents-feed-section" sectionId="agents-feed" title={"Last 24 hours"}>
      <ListCard style={{ marginTop: 8 }}>
        {feed.map((f, i) => {
          const issue = f.issueId != null ? issues.find((x) => x.id === f.issueId) : undefined;
          return (
            <Row key={f.id} testID={`feed-${f.id}`} last={i === feed.length - 1}>
              <Dot kind={f.severity === "alert" ? "alert" : f.severity === "muted" ? "neutral" : "ok"} feed />
              <View style={{ flex: 1 }}>
                <Txt kind="body">
                  {/* D-1: this was `f.at.slice(11, 16)` — the UTC hour of an
                      instant, printed as if it were the local one, and wrong
                      by the offset everywhere but UTC. Then `formatAgo`, which
                      was the tab's odd one out (S6-22). */}
                  {formatWhen(f.at)} · {f.text}
                </Txt>
                <Meta>{f.meta}</Meta>
              </View>
              {issue != null && <BtnSm testID={`feed-renew-${f.id}`} label={issue.verb.label} onPress={() => void actIssue(issue.id, issue.verb.action)} />}
            </Row>
          );
        })}
      </ListCard>
    </Section>
  );
}
