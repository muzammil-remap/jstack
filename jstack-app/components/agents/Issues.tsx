/**
 * Issues — Agents' "Agent issues (cannot be hidden)" card (AG-04):
 * badge = open issues, each row's verb posts `POST /agents/issues/{id}`
 * and leaves with a 10s undo toast (A-32, no undo route on the wire).
 */
import React from "react";
import { View } from "react-native";
import { BtnSm, Dot, ListCard, Meta, Row, Section, Txt } from "@/theme/ui";
import { useAgentsStore } from "@/stores/agents";
import { useSessionStore } from "@/stores/session";

export function Issues() {
  const issues = useAgentsStore((s) => s.issues);
  const actIssue = useAgentsStore((s) => s.actIssue);
  const openModal = useSessionStore((s) => s.openModal);

  return (
    <Section
      testID="agents-issues-section"
      sectionId="agents-issues"
      title={"Agent issues"}
      badge={issues.length}
      // OP-05: the open ones are on the card; "all" is everything, including
      // what has since been dealt with.
      right={
        <Txt testID="issues-all" kind="meta" tone="accentInk" onPress={() => openModal("issues-all")}>
          all
        </Txt>
      }
    >
      <ListCard style={{ marginTop: 8 }}>
        {issues.length === 0 ? (
          <Row testID="issues-empty">
            <Meta>Nothing failing. Every check ran when it should.</Meta>
          </Row>
        ) : (
          issues.map((issue, i) => (
            // OP-05: the row opens the issue — what failed, when it last
            // worked, and the verb. The verb button beside it is a different
            // action and keeps its own control.
            <Row key={issue.id} testID={`issue-${issue.id}`} last={i === issues.length - 1} onPress={() => openModal("issue", issue.id)}>
              <Dot kind="alert" />
              <View style={{ flex: 1 }}>
                <Txt kind="body">{issue.title}</Txt>
                <Meta>{issue.why}</Meta>
              </View>
              <BtnSm testID={`issue-act-${issue.id}`} label={issue.verb.label} onPress={() => void actIssue(issue.id, issue.verb.action)} />
            </Row>
          ))
        )}
      </ListCard>
    </Section>
  );
}
